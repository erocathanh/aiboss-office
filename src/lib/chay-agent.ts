import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { CAU_HINH } from './cau-hinh';

/**
 * Gọi Claude Code ở CHẾ ĐỘ KHÔNG-TƯƠNG-TÁC và đẩy ra từng mẩu trả lời.
 *
 * Bộ cờ bê từ nghiên cứu openclaw (§3-B "CLI backends") rồi siết thêm cho an toàn.
 * Mỗi cờ dưới đây đều đã ĐO THẬT trên máy, không phải chép mò:
 *
 *   --output-format stream-json     mỗi dòng stdout là một JSON → đọc dần được
 *   --include-partial-messages      cho ra `stream_event`/`text_delta` = chảy từng chữ
 *   --verbose                       BẮT BUỘC, thiếu nó stream-json bị chặn
 *   --setting-sources project       ⛔ không nạp hook + CLAUDE.md của cả máy Owner.
 *                                   Đo thật: 0,32 USD → 0,067 USD một lượt.
 *   --strict-mcp-config + --mcp-config {}
 *                                   ⛔ CẮT sạch 13 máy chủ MCP của Owner.
 *                                   Đo thật: thiếu hai cờ này → 180.746 token nạp
 *                                   thừa, MỘT lượt tầm phào tốn 1,08 USD.
 *   --permission-mode dontAsk       ⛔ không bao giờ treo chờ người bấm duyệt
 *   --disallowedTools <danh sách>   vòng này agent THUẦN TRÒ CHUYỆN, ⛔ không tay chân
 *   --max-budget-usd                chốt chặn tiền ngay tầng tiến trình (đã đo: nó CẮT thật)
 *   --resume <mã phiên>             nối mạch hội thoại giữa các lượt
 *
 * ⛔ KHÔNG dùng --bare: nó tuyên bố "OAuth and keychain are never read", tức là
 *    bắt buộc phải có ANTHROPIC_API_KEY. Máy Owner đăng nhập bằng thuê bao
 *    (apiKeySource: "none") ⇒ --bare sẽ làm hỏng xác thực.
 */

/**
 * 🖐 TAY CHÂN — Owner chốt 14/08/2026: *«tôi muốn nó bypass auto mode on giống bạn»*.
 *
 * Trước đó agent bị cấm 26 công cụ ⇒ hỏi "máy tính tôi có gì" thì nó đáp
 * «mình không có công cụ để truy cập hệ thống file hay terminal» — đúng như đã cấu hình,
 * nhưng ⛔ không phải thứ Owner cần.
 *
 * ⚠️ HIỂU CHO ĐÚNG TRƯỚC KHI ĐỔI: mở tay chân = agent **chạy lệnh thật trên máy này**
 * (đọc · ghi · xoá · gọi mạng). Thư mục cách ly `/Users/Shared/phong-ban-ai-ws` chỉ là
 * CHỖ NÓ ĐỨNG, ⛔ KHÔNG phải nhà tù — `cd` ra ngoài là ra được.
 * Chấp nhận được vì: chạy TẠI MÁY, một mình Owner dùng, Owner ngồi ngay đó.
 * 🔴 Điều kiện đó mất đi thì luật này phải đổi theo — xem `CHAN_TAY_CHAN_KHI_MO_RA_NGOAI`.
 */
const CAM_KHI_HAN_CHE = [
  'Task', 'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Skill', 'Monitor', 'NotebookEdit',
  'ToolSearch', 'SendMessage', 'ScheduleWakeup', 'PushNotification',
  'CronCreate', 'CronDelete', 'CronList', 'RemoteTrigger', 'Workflow',
  'TaskCreate', 'TaskUpdate', 'TaskStop', 'EnterWorktree', 'ExitWorktree',
];

/**
 * 🔒 KHOÁ DUY NHẤT CÒN LẠI — chế độ terminal CHỈ bật khi máy chủ nghe ở MÁY NÀY.
 *
 * ⛔ Đây ⛔ KHÔNG phải rào chắn Owner, mà là **phanh chống quên**: ngày nào đưa trang
 *    ra ngoài mạng, "ai vào được trang" lập tức đồng nghĩa "chạy được lệnh trên máy Owner".
 *    Người quên thường là người bận, ⛔ không phải người ẩu — nên để máy nhớ hộ.
 *    Muốn mở ra ngoài mà vẫn full quyền: tự đặt `GIONG_TERMINAL=1`, nhưng phải
 *    dựng lớp đăng nhập TRƯỚC.
 */
function chayNhuTerminal(): boolean {
  if (process.env.GIONG_TERMINAL === '1') return true;          // Owner ép bật
  if (process.env.GIONG_TERMINAL === '0') return false;         // Owner ép tắt
  const ngheNgoai = ['0.0.0.0', '::'].includes(process.env.HOST ?? '');
  return !ngheNgoai;
}

const GIONG_TERMINAL = chayNhuTerminal();

/** Giống terminal ⇒ ⛔ KHÔNG cấm công cụ nào. Terminal có gì, app có nấy. */
const CONG_CU_CAM: string[] = GIONG_TERMINAL ? [] : CAM_KHI_HAN_CHE;

export type MauTraLoi =
  | { loai: 'phien'; ma_phien: string }
  | { loai: 'chu'; chu: string }
  | { loai: 'xong'; ma_phien: string; chi_phi_usd: number | null; token: number | null }
  | { loai: 'loi'; thong_diep: string };

export interface ThamSoChay {
  cauHoi: string;
  maPhienCu?: string | null;
  loiDan?: string;
  tinHieuHuy?: AbortSignal;
  /**
   * 🔌 CHẠY NỀN — người xem rời đi thì việc VẪN CHẠY TỚI HẾT.
   * Bật cờ này ⇒ ⛔ KHÔNG giết tiến trình khi luồng xem đóng.
   * Chỉ nút DỪNG (qua `/api/dung`) mới được giết. Xem `kho-tien-trinh.ts`.
   */
  chayNen?: boolean;
  /** Báo pid ra ngoài NGAY khi sinh, để ghi sổ tiến trình. */
  khiSinh?: (pid: number) => void;
  /** Thư mục làm việc RIÊNG của nhân sự — quyết định phiên nằm ở kho nào. */
  thuMuc: string;
}

/**
 * Bộ sinh bất đồng bộ — trả về từng mẩu ngay khi tiến trình con nhả ra.
 * ⛔ Không gom rồi trả một cục.
 */
/**
 * Dịch lỗi thô của Claude thành câu người đọc hiểu.
 *
 * 🔴 Ca thật 14/08: ghế in nguyên `[ede_diagnostic] result_type=user last_content_type=n/a
 *    stop_reason=tool_use` ra bong bóng chat. Owner đọc ⛔ không hiểu gì, mà chuỗi đó
 *    cũng ⛔ không nói được phải làm gì tiếp.
 * 📌 Lỗi kỹ thuật in thô = **đổ việc dịch nghĩa sang người dùng**. Máy biết bối cảnh
 *    thì máy phải dịch.
 */
function dichLoi(tho: string): string {
  const t = (tho || '').trim();
  if (!t) return 'Lượt chạy thất bại mà ⛔ không có mô tả. Thử gửi lại câu hỏi.';

  // Model kết thúc lượt bằng ý định GỌI CÔNG CỤ mà vòng lặp ⛔ không đi tiếp được.
  if (/stop_reason=tool_use|ede_diagnostic/i.test(t)) {
    return (
      '⚠️ Lượt này dừng giữa lúc trợ lý đang dùng một công cụ.\n\n' +
      '**Nguyên nhân hay gặp NHẤT là bị cắt ngang** — máy chủ chém tiến trình, ' +
      'hoặc bạn bấm dừng. Ghế nặng (opus + nỗ lực cao nhất) đọc lâu là chuyện thường; ' +
      'nếu vừa thấy dòng ⏱️ báo im lặng ở trên thì **thủ phạm là ngưỡng im-lặng, ' +
      '⛔ không phải câu hỏi của bạn** → nới bằng `HAN_GIO_MS=600000 pnpm dev`.\n\n' +
      'Ít gặp hơn: câu lệnh kéo theo **kỹ năng cần sống lâu** (canh kênh, hẹn giờ) — ' +
      'mấy thứ đó ⛔ chưa chạy được ở đây vì mỗi lượt là một tiến trình rồi tắt; ' +
      'khi đó hãy bảo nó *ghi vào kênh* thay vì *canh kênh*.\n\n' +
      '**Gửi lại câu hỏi trước đã** — phần lớn ca chỉ cần vậy.\n\n' +
      '`' + t.slice(0, 120) + '`'
    );
  }
  if (/budget|max-budget/i.test(t)) {
    return '⚠️ Lượt bị chặn vì trần tiền. Trần đã gỡ từ 14/08 — nếu vẫn thấy câu này, khởi động lại máy chủ.';
  }
  if (/not authenticated|unauthor|login/i.test(t)) {
    return '⚠️ Máy chưa đăng nhập Claude Code. Mở terminal chạy `claude` một lần rồi thử lại.';
  }
  return '⚠️ Lượt chạy thất bại:\n\n`' + t.slice(0, 300) + '`';
}

export async function* chayAgent(ts: ThamSoChay): AsyncGenerator<MauTraLoi> {
  const doiSo: string[] = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    // 🔑 GIỐNG TERMINAL (Owner 14/08): nạp ĐỦ như khi Owner gõ `claude` ở nhà —
    //    settings + hook + CLAUDE.md các tầng + toàn bộ máy chủ MCP đã cắm.
    //    ⛔ Bản trước cắt sạch mấy thứ này cho rẻ; rẻ nhưng KHÔNG còn là terminal.
    ...(GIONG_TERMINAL ? [] : ['--setting-sources', 'project',
                              '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}']),
    // Mở tay chân thì phải mở luôn cổng quyền, nếu không agent CÓ công cụ mà vẫn bị chặn
    // giữa chừng — mà trang web ⛔ không có nút "Duyệt" nào để bấm.
    '--permission-mode', GIONG_TERMINAL ? 'bypassPermissions' : 'dontAsk',
    // 🔴 Owner 14/08: gõ `/mo-kenh-phoi-hop` vào ô chat mà ghế IM RE — chính cờ này chặn.
    //    Terminal có lệnh gạch chéo thì app cũng phải có (luật «app = terminal»).
    //    Đây là rào tôi SÓT khi gỡ 4 rào kia — gỡ nốt.
    ...(GIONG_TERMINAL ? [] : ['--disable-slash-commands']),
    '--model', CAU_HINH.moHinh,
    // 🧠 Mức nỗ lực suy nghĩ — Owner chốt 14/08: CAO NHẤT ('max').
    //    Cờ có thật ở bản 2.1.232 (`claude --help`: low · medium · high · xhigh · max).
    '--effort', CAU_HINH.mucNoLuc,
    // Trần = 0 ⇒ BỎ HẲN cờ (Owner chốt 14/08: không giới hạn).
    // ⚠️ Truyền `--max-budget-usd 0` là CẤM TIÊU, ⛔ không phải «vô hạn» — sai một chữ
    //    thì mọi lượt chết ngay từ token đầu. Phải bỏ cờ, ⛔ đừng để số 0.
    ...(CAU_HINH.tranTienMoiLuot > 0
      ? ['--max-budget-usd', String(CAU_HINH.tranTienMoiLuot)]
      : []),
    // ⚠️ Danh sách rỗng thì phải BỎ HẲN cờ — `--disallowedTools` đứng trơ sẽ nuốt
    //    tham số đứng sau nó làm giá trị, hỏng âm thầm chứ ⛔ không báo lỗi.
    ...(CONG_CU_CAM.length ? ['--disallowedTools', ...CONG_CU_CAM] : []),
  ];

  if (ts.maPhienCu) {
    doiSo.push('--resume', ts.maPhienCu);
  } else if (ts.loiDan) {
    doiSo.push('--append-system-prompt', ts.loiDan);
  }

  // spawn KHÔNG qua shell + câu hỏi đi bằng stdin
  // ⇒ ⛔ không có đường chèn lệnh, ⛔ không đụng trần độ dài tham số.
  fs.mkdirSync(ts.thuMuc, { recursive: true });
  const tien = spawn(CAU_HINH.lenhClaude, doiSo, {
    cwd: ts.thuMuc,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  /**
   * ⏱️ Đồng hồ đo **IM LẶNG**, ⛔ KHÔNG đo tổng thời gian sống.
   *
   * 🔴 Ca thật 14/08 (đo tại bản ghi ghế `claude-eroca-boss`): hai lượt KHÁC ĐỀ TÀI
   *    — một lượt gọi kỹ năng mở kênh, một lượt là câu MỞ MÀN kịch bản quay — cùng
   *    chết ở **117 giây**. Đó là dấu vân tay của một cái đồng hồ, ⛔ không phải của
   *    công cụ nào cả. Bản cũ hẹn cứng `setTimeout(kill, hanGio)` đếm từ lúc sinh
   *    tiến trình, ⛔ không cần biết ghế đang tuôn chữ hay đã treo — quá 2 phút là chém.
   * 📌 Ghế chạy `opus` + `--effort max` + nạp trọn CLAUDE.md/hook/MCP thì một lượt
   *    "rà tình hình" ăn hàng phút là BÌNH THƯỜNG; chính kịch bản quay ghi *«mỗi ô
   *    mất 30 giây–3 phút»*. Trần cứng 2 phút biến việc-chạy-đúng thành lỗi.
   * ⇒ Còn nhả chữ thì còn sống. Chỉ chém khi **tắt tiếng** quá lâu (= treo thật).
   */
  let biCatVIImLang = false;
  let donGio: ReturnType<typeof setTimeout> | undefined;
  const datLaiDongHo = () => {
    clearTimeout(donGio);
    donGio = setTimeout(() => {
      biCatVIImLang = true;
      tien.kill('SIGTERM');
    }, CAU_HINH.hanGio);
  };
  datLaiDongHo();

  const huy = () => tien.kill('SIGTERM');
  ts.tinHieuHuy?.addEventListener('abort', huy);
  if (tien.pid) ts.khiSinh?.(tien.pid);

  /**
   * Người xem đã rời đi hay chưa. Khi rời mà đang CHẠY NỀN thì vẫn phải TIÊU THỤ
   * stdout (⛔ không để ống nghẽn làm tiến trình treo), nhưng ⛔ KHÔNG chất vào hàng đợi
   * — ⛔ không ai kéo thì hàng đợi chỉ phình bộ nhớ vô ích.
   */
  let daRoiDi = false;

  tien.stdin.write(ts.cauHoi);
  tien.stdin.end();

  // Gom stderr để báo lỗi cho ra hồn nếu tiến trình chết.
  let loiChuan = '';
  tien.stderr.on('data', (c: Buffer) => {
    loiChuan += c.toString('utf8');
    if (loiChuan.length > 4000) loiChuan = loiChuan.slice(-4000);
  });

  // Hàng đợi nối stdout (đẩy) với vòng lặp `for await` (kéo).
  const hangDoi: MauTraLoi[] = [];
  let danhThuc: (() => void) | null = null;
  let ketThuc = false;
  let loiTienTrinh: string | null = null;

  const day = (m: MauTraLoi) => {
    if (!daRoiDi) hangDoi.push(m);
    danhThuc?.();
    danhThuc = null;
  };

  let maPhien = '';
  let dem = '';

  tien.stdout.on('data', (c: Buffer) => {
    // ⏱️ Có chữ ra ⇒ ghế còn sống ⇒ đặt lại đồng hồ im-lặng. Đây là chỗ DUY NHẤT
    //    chứng minh được "nó đang làm việc" — ⛔ đừng dời sang nơi khác.
    datLaiDongHo();
    dem += c.toString('utf8');
    const dong = dem.split('\n');
    dem = dong.pop() ?? '';
    for (const d of dong) {
      const s = d.trim();
      if (!s) continue;
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(s);
      } catch {
        continue; // dòng chưa trọn / không phải JSON → bỏ qua
      }
      xuLyMau(j);
    }
  });

  function xuLyMau(j: Record<string, unknown>) {
    const loai = j.type as string;

    if (typeof j.session_id === 'string' && j.session_id && !maPhien) {
      maPhien = j.session_id;
      day({ loai: 'phien', ma_phien: maPhien });
    }

    // Chảy từng chữ
    if (loai === 'stream_event') {
      const sk = j.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
      if (sk?.type === 'content_block_delta' && sk.delta?.type === 'text_delta' && sk.delta.text) {
        day({ loai: 'chu', chu: sk.delta.text });
      }
      return;
    }

    if (loai === 'result') {
      if (j.is_error) {
        const ds = Array.isArray(j.errors) ? (j.errors as string[]).join(' · ') : '';
        const tho = ds || (typeof j.result === 'string' ? j.result : '');
        day({ loai: 'loi', thong_diep: dichLoi(tho) });
      }
      // ⭐ TOKEN mới là thứ ăn vào cửa sổ 5 giờ + cửa sổ TUẦN (dùng chung với
      //    Claude chat của Owner) — đô-la chỉ là số máy tự quy đổi. Phải hiện token.
      const u = j.usage as Record<string, number> | undefined;
      const token = u
        ? (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0) +
          (u.input_tokens ?? 0) +
          (u.output_tokens ?? 0)
        : null;

      day({
        loai: 'xong',
        ma_phien: maPhien,
        chi_phi_usd: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null,
        token,
      });
    }
  }

  tien.on('error', (e) => {
    loiTienTrinh =
      `Không chạy được lệnh "${CAU_HINH.lenhClaude}": ${e.message}. ` +
      'Kiểm tra Claude Code đã cài và đã đăng nhập chưa.';
    ketThuc = true;
    danhThuc?.();
    danhThuc = null;
  });

  tien.on('close', (ma) => {
    // ⭐ Ghế bị CHÍNH TA chém thì phải nói thẳng là ta chém, kèm con số thật.
    //    ⛔ Đừng để nó rơi xuống nhánh dưới rồi hiện thành "lỗi công cụ" — đó là
    //    cách một phép đo tự nói dối: người dùng đi sửa câu hỏi trong khi thủ phạm
    //    là cái đồng hồ của ta (ca 14/08, hai lượt cùng chết ở giây 117).
    if (biCatVIImLang) {
      const giay = Math.round(CAU_HINH.hanGio / 1000);
      loiTienTrinh =
        `⏱️ Ghế bị dừng vì **⛔ không nhả chữ nào suốt ${giay} giây** — coi như treo.\n\n` +
        'Nó ⛔ KHÔNG phải lỗi câu hỏi của bạn: chừng nào ghế còn tuôn chữ thì đồng hồ ' +
        'còn được đặt lại, chạy bao lâu cũng được.\n\n' +
        `**Nới ngưỡng:** dừng máy chủ rồi mở lại bằng \`HAN_GIO_MS=600000 pnpm dev\` (10 phút im lặng).`;
    } else if (ma !== 0 && ma !== null && hangDoi.length === 0 && !maPhien) {
      loiTienTrinh = `Tiến trình claude thoát với mã ${ma}.${loiChuan ? ' ' + loiChuan.trim() : ''}`;
    }
    ketThuc = true;
    danhThuc?.();
    danhThuc = null;
  });

  try {
    while (true) {
      while (hangDoi.length > 0) yield hangDoi.shift()!;
      if (ketThuc) break;
      await new Promise<void>((giai) => {
        danhThuc = giai;
      });
    }
    while (hangDoi.length > 0) yield hangDoi.shift()!;
    if (loiTienTrinh) yield { loai: 'loi', thong_diep: loiTienTrinh };
  } finally {
    clearTimeout(donGio);
    ts.tinHieuHuy?.removeEventListener('abort', huy);
    if (ts.chayNen) {
      /**
       * 🔴 ⛔ ĐÃ BỎ `tien.kill('SIGTERM')` Ở ĐÂY (17/08/2026).
       * Khối này chạy cả khi luồng XEM đóng — tức Owner chỉ tắt trình duyệt.
       * Giết ở đây nghĩa là: rời màn hình = mất việc. Owner nói thẳng nó phải
       * chạy tiếp «như terminal».
       * ⇒ Chạy nền thì buông cho tiến trình sống; dọn hàng đợi cho nhẹ bộ nhớ.
       *   Vẫn còn hai phanh: đồng hồ IM LẶNG ở trên, và nút DỪNG qua /api/dung.
       */
      daRoiDi = true;
      hangDoi.length = 0;
    } else if (tien.exitCode === null) {
      tien.kill('SIGTERM');
    }
  }
}
