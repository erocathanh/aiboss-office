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
  /** Thư mục làm việc RIÊNG của nhân sự — quyết định phiên nằm ở kho nào. */
  thuMuc: string;
}

/**
 * Bộ sinh bất đồng bộ — trả về từng mẩu ngay khi tiến trình con nhả ra.
 * ⛔ Không gom rồi trả một cục.
 */
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
    '--disable-slash-commands',
    '--model', CAU_HINH.moHinh,
    '--max-budget-usd', String(CAU_HINH.tranTienMoiLuot),
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

  const donGio = setTimeout(() => tien.kill('SIGTERM'), CAU_HINH.hanGio);
  const huy = () => tien.kill('SIGTERM');
  ts.tinHieuHuy?.addEventListener('abort', huy);

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
    hangDoi.push(m);
    danhThuc?.();
    danhThuc = null;
  };

  let maPhien = '';
  let dem = '';

  tien.stdout.on('data', (c: Buffer) => {
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
        day({
          loai: 'loi',
          thong_diep: ds || (typeof j.result === 'string' ? j.result : 'Lượt chạy thất bại.'),
        });
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
    if (ma !== 0 && ma !== null && hangDoi.length === 0 && !maPhien) {
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
    if (tien.exitCode === null) tien.kill('SIGTERM');
  }
}
