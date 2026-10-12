/**
 * 🔓 CHẠY MỘT LƯỢT — LÕI, TÁCH KHỎI VỎ HTTP.  (P0-2c · Owner ưu tiên hàng đầu 31/08)
 *
 * 🎯 VÌ SAO CÓ TỆP NÀY
 * Owner: *«phụ thuộc trình duyệt quá khó chịu»*. Đo được (claude-phong-ban-pm, 31/08 19:18):
 * ```
 * '/api/chat' được gọi từ ĐÚNG MỘT chỗ — UngDung.tsx. Nơi khác: 0
 * chayAgent chỉ nằm trong api/chat/route.ts  ⇒ MÁY CHỦ KHÔNG TỰ CHẠY GHẾ ĐƯỢC
 * ```
 * ⇒ Trình duyệt KHÔNG phải cái chuông. Nó là **ĐỘNG CƠ**. Muốn máy chủ tự chạy một lượt
 *   thì phải tách LÕI ra khỏi VỎ — vỏ là `ReadableStream` + `Response` của SSE.
 *
 * 🧩 CÁCH TÁCH: lõi KHÔNG biết gì về HTTP. Nó nhận một hàm `nhan(su_kien)` và bắn sự kiện
 *   vào đó. Ai gọi thì tự quyết đem sự kiện đi đâu:
 * ```
 * cửa /api/chat        nhan = (e) => dieu.enqueue(goi(e))     ⇒ chảy về trình duyệt
 * bộ chạy nền (P0-2c)  nhan = (e) => ghiNhatKy(e)             ⇒ chỉ ghi, KHÔNG cần ai xem
 * ```
 *
 * ✅ MẮT XÍCH ② ĐÃ SẴN, KHÔNG PHẢI DỰNG (đo 31/08 20:0x — đây là chỗ tiết kiệm nhiều nhất):
 *   Chữ của MỌI lượt do chính Claude Code ghi xuống `~/.claude/projects/**\/*.jsonl`,
 *   và `/api/phien` đọc thẳng tệp đó. Chú thích `cancel()` ở `api/chat/route.ts` nói rõ:
 *   *«việc bên dưới chạy tiếp và tự ghi vào bản ghi phiên, nên mở lại app là đọc được đầy đủ»*.
 *   ⇒ Lượt do máy chủ tự chạy KHÔNG cần một đường đổ chữ riêng. Mở lại app là thấy.
 *   ⚠️ Nhưng ĐÓ LÀ LỜI KHAI CỦA MÃ, chưa phải phép đo của tôi trên một lượt CHẠY NỀN THẬT.
 *      Cổng ③ của mốc «xong» sinh ra để đo đúng chỗ này. ĐỪNG coi nó là đã chứng minh.
 *
 * 🔴 BA MẮT XÍCH BẮT BUỘC (claude-phong-ban-pm nêu 31/08 20:01, tôi để thành ĐIỀU KIỆN
 *    chứ KHÔNG phải «nên có» — vì bạn ấy đã đo: spawn thẳng `claude -p` thì ghế
 *    **chạy thật, trả lời thật, mà KHÔNG ô nào hiện một chữ**):
 * ```
 * ① ghi vào SỔ TIẾN TRÌNH  → `khiSinh` gọi `dangKyViec`  ⇒ nút Dừng còn thấy nó
 * ② chữ ra chỗ đọc lại được → .jsonl của Claude Code (xem trên)
 * ③ mang MÃ Ô              → `maO` là tham số bắt buộc  ⇒ app biết gán vào đâu
 * ```
 * Thiếu một trong ba là đổi «lượt mồ côi» lấy «lượt VÔ HÌNH» — tệ hơn, vì lượt vô hình
 * vẫn tiêu tiền mà KHÔNG ai biết để dừng.
 *
 * 📌 TỆP NÀY LÀ PHẦN THÊM THUẦN TUÝ. Nó CHƯA được ai gọi. `api/chat/route.ts` vẫn nguyên.
 *    Cố ý: bước ① tách lõi phải soi được ĐỘC LẬP, trước khi nối vào hàng đợi ở bước ②.
 *    Luật nhà: ghế viết mã KHÔNG phải ghế dựng, KHÔNG phải ghế soi.
 */
import { chayAgent } from '@/lib/chay-agent';
import { loiDanHeThong } from '@/lib/cau-hinh';
import { datO } from '@/lib/kho-phien';
import { thuMucAgent } from '@/lib/doc-phien';
import { dangKyViec, xoaViec } from '@/lib/kho-tien-trinh';
import type { ChildProcess } from 'node:child_process';
import { timNhanSu } from '@/lib/nhan-su';
import { traChuoi } from '@/lib/tra-chuoi';
import { isSeatHeldByTerminal, claimSeat, updateSeatActivePid } from '@/lib/seat-active';

/** Sự kiện lõi bắn ra. Cùng HÌNH DẠNG với thứ `/api/chat` đang đẩy qua SSE. */
export type SuKienLuot =
  | { loai: 'bat-dau'; noi_tiep: boolean }
  | { loai: 'tra-chuoi'; do_phu: unknown; so_tang: unknown; so_khop: number; tu_khoa: unknown }
  | { loai: 'da-noi-mach'; noi_tiep: boolean }
  | { loai: 'chu'; chu: string }
  | { loai: 'loi'; thong_diep: string }
  // ⚠️ `null` chứ KHÔNG phải `undefined`: `chayAgent` trả `number | null` khi Claude
  //    không khai chi phí. Khai `?: number` ở đây làm tsc chặn — và nó chặn ĐÚNG.
  | { loai: 'xong'; chi_phi_usd: number | null; token: number | null };

export interface DauVaoLuot {
  maO: string;
  maNhanSu: string;
  cauHoi: string;
  /** `null` ⇒ mở phiên mới. */
  maPhienCu: string | null;
  /** Cho phép người gọi dừng lượt (nút Dừng dùng đường khác — `gietViec`). */
  tinHieuHuy?: AbortSignal;
}

export interface KetQuaLuot {
  /** Mã phiên THỰC SỰ đã dùng — có thể khác `maPhienCu` khi mở phiên mới. */
  maPhien: string | null;
  /**
   * 🔢 Số hiệu CHỈ ĐỂ HIỆN — cùng luật với `ViecDangChay.pid_de_hien_thi`.
   *
   * 🔑 Đổi tên 02/09 dù trường này hiện có **0 người đọc** (`may-chay-nen.ts:270` gọi bằng `void`).
   *    Đổi vì đúng lý do đề bài đưa ra: cái tên làm việc canh gác. Người đầu tiên đọc trường này
   *    là người sẽ quyết định dùng nó làm gì — để nó tên `pid` là mời họ đem đi so sánh.
   * 📌 Và đây là chỗ RẺ NHẤT để áp luật: 0 người đọc ⇒ đổi tên KHÔNG rủi ro. Nếp «vá xong một chỗ
   *    thì đi tìm ngay hình đó ở khối lân cận» — chỗ lân cận rẻ nhất thì làm luôn, đừng đợi.
   */
  pid_de_hien_thi: number | null;
  /** `null` nếu chạy trót lọt. */
  loi: string | null;
  /**
   * `true` ⇒ lượt ĐÃ CHẠY nhưng `datO` từ chối buộc nó vào ô (ô ngoài tầm).
   * Người gọi PHẢI xử — đây đúng ca «lượt vô hình»: tốn tiền mà app KHÔNG gán vào đâu.
   */
  buocOThatBai: boolean;
}

/**
 * Chạy MỘT lượt cho một ghế. KHÔNG biết gì về HTTP, KHÔNG tự quyết ai được chạy.
 *
 * ⚠️ CHỐT CHẶN **KHÔNG** nằm ở đây — người gọi phải tự lo, và đây là danh sách để
 *    người gọi khỏi quên (mỗi mục đều là một ca đã cắn thật trong `api/chat/route.ts`):
 * ```
 * · chặn mức dùng (xinLuot)              · chặn ghế ĐANG chạy nơi khác (dangChay)
 * · kiểm bản ghi phiên còn sống (coPhien) · kiểm nhân sự có thật
 * ```
 * 📌 Cố ý KHÔNG gói chúng vào đây: bộ chạy nền cần một BỘ CHỐT KHÁC (nó KHÔNG có
 *    «khách» để chặn theo mức dùng, và nó phải chặn theo HÀNG ĐỢI chứ không theo lượt gõ).
 *    Gói chung sẽ ép hai người dùng chung một bộ chốt sai cho cả hai.
 */
export async function chayMotLuot(
  vao: DauVaoLuot,
  nhan: (su_kien: SuKienLuot) => void,
): Promise<KetQuaLuot> {
  const { maO, maNhanSu, cauHoi, maPhienCu, tinHieuHuy } = vao;

  const ns = timNhanSu(maNhanSu);
  if (!ns) return { maPhien: maPhienCu, pid_de_hien_thi: null, loi: `Không có nhân sự "${maNhanSu}".`, buocOThatBai: false };

  // ⛔ Check if seat is currently claimed and active in terminal (5A-1)
  const { isHeld: giuTerminal, record: recTerminal } = isSeatHeldByTerminal(maNhanSu);
  if (giuTerminal) {
    return {
      maPhien: maPhienCu,
      pid_de_hien_thi: null,
      loi: `skipped: terminal (Seat '${maNhanSu}' is held by terminal PID ${recTerminal?.pid})`,
      buocOThatBai: false,
    };
  }

  /**
   * 🖐 TAY CẦM để XOÁ SỔ (danh tính) — và 🔢 SỐ HIỆU để HIỆN, chụp NGAY LÚC SINH.
   *
   * 🕳 Vì sao hai biến chứ KHÔNG một: bản đầu tôi viết `tienDangChay?.pid` ở hai lối `return`,
   *    và `tsc` chặn — «Property 'pid' does not exist on type 'never'». TypeScript KHÔNG theo
   *    được phép gán nằm trong hàm gọi lại `khiSinh`, nên nó vẫn tin biến này mãi là `null`.
   * ⚠️ Chữa bằng ÉP KIỂU thì cổng im, nhưng cái nó im KHÔNG phải cái tôi sửa. Chụp số ngay lúc
   *    sinh thì đúng nghĩa hơn THẬT: đó chính là khoảnh khắc con số chắc chắn là của con mình.
   * 📌 Nếp: **cổng máy kêu thì đọc xem nó kêu ĐIỀU GÌ, đừng đi tìm cách làm nó im.**
   */
  let tienDangChay: ChildProcess | null = null;
  let pidDeHienThi: number | null = null;
  let maPhien: string | null = maPhienCu;
  let buocOThatBai = false;

  nhan({ loai: 'bat-dau', noi_tiep: Boolean(maPhienCu) });

  // 🔎 Tra chuỗi đời của ghế rồi đính vào câu hỏi (câu «tôi đã dặn… chưa»).
  //    Hỏng thì KỆ — KHÔNG được chặn lượt vì một thứ phụ trợ.
  let cauGui = cauHoi;
  try {
    const tra = traChuoi(maNhanSu, maPhienCu, cauHoi);
    if (tra) {
      cauGui = cauHoi + String.fromCharCode(10, 10) + tra.loi_dan;
      nhan({
        loai: 'tra-chuoi',
        do_phu: tra.do_phu,
        so_tang: tra.so_tang,
        so_khop: tra.khop.length,
        tu_khoa: tra.tu_khoa,
      });
    }
  } catch {
    /* tra hỏng thì đừng chặn lượt — gửi câu gốc */
  }

  try {
    for await (const mau of chayAgent({
      cauHoi: cauGui,
      maPhienCu,
      thuMuc: thuMucAgent(maNhanSu),
      // 👑 Ghế có LINH HỒN RIÊNG thì KHÔNG nhét qua lời dặn hệ thống — linh hồn nằm ở
      //    `CLAUDE.md` trong thư mục ghế và Claude Code tự nạp theo chỗ đứng.
      loiDan: ns.soul ? undefined : loiDanHeThong(ns.nhan, ns.vai, ns.ten_phong),
      tinHieuHuy,
      // 🔌 Người xem rời đi thì việc VẪN CHẠY TỚI HẾT. Với bộ chạy nền thì
      //    KHÔNG có người xem nào ngay từ đầu — đúng thứ ta cần.
      chayNen: true,
      khiSinh: (t) => {
        tienDangChay = t;
        pidDeHienThi = t.pid ?? null;
        dangKyViec(maO, t, maNhanSu); // ← MẮT XÍCH ①: nút Dừng phải thấy được lượt này
      },
      // ⚰️ Đường này KHÔNG có người xem để rời đi, nên `finally` bên dưới vốn đã đúng.
      //    Nối `khiChet` cho ĐỒNG NHẤT với đường SSE: một luật xoá sổ, KHÔNG phải hai.
      khiChet: (t) => xoaViec(maO, t),
    })) {
      if (mau.loai === 'phien') {
        // Ghi XUỐNG ĐĨA ngay ⇒ tắt máy chủ/trình duyệt vẫn tìm lại được phiên.
        maPhien = mau.ma_phien;
        claimSeat(maNhanSu, {
          tool: 'app',
          sessionId: mau.ma_phien,
          pid: process.pid,
          cwd: thuMucAgent(maNhanSu),
        });
        /**
         * ← MẮT XÍCH ③: buộc lượt vào ĐÚNG ô.
         * 🔴 PHẢI ĐỌC GIÁ TRỊ TRẢ VỀ (hermes vòng 2, NGOÀI ĐỀ ②).
         *    `datO` từ chối ô ngoài tầm và chỉ ghi một dòng nhật ký MÁY CHỦ.
         *    Vòng 2 tôi cho nó trả `boolean` — nhưng KHÔNG ai đọc, nên nó vẫn câm
         *    y như cũ. **Cho một hàm biết nói mà KHÔNG ai nghe thì chưa sửa gì cả.**
         * ⚠️ KHÔNG dừng lượt: tiến trình đã sinh, giết ở đây là đốt tiền mà chẳng cứu ai.
         *    Nhưng phải KÊU — lượt KHÔNG buộc được vào ô chính là «lượt VÔ HÌNH».
         */
        if (!datO(maO, maNhanSu, mau.ma_phien)) {
          buocOThatBai = true;
          nhan({
            loai: 'loi',
            thong_diep:
              `Lượt CHẠY THẬT nhưng KHÔNG buộc được vào ô «${maO}» (ô ngoài tầm). ` +
              `Chữ vẫn nằm trong bản ghi phiên ${mau.ma_phien}, mở lại ghế là đọc được.`,
          });
        }
        nhan({ loai: 'da-noi-mach', noi_tiep: Boolean(maPhienCu) });
      } else if (mau.loai === 'chu') {
        nhan({ loai: 'chu', chu: mau.chu });
      } else if (mau.loai === 'loi') {
        nhan({ loai: 'loi', thong_diep: mau.thong_diep });
      } else if (mau.loai === 'xong') {
        nhan({ loai: 'xong', chi_phi_usd: mau.chi_phi_usd, token: mau.token });
      }
    }
    return { maPhien, pid_de_hien_thi: pidDeHienThi, loi: null, buocOThatBai };
  } catch (e) {
    const thongDiep = e instanceof Error ? e.message : 'Lỗi không rõ.';
    nhan({ loai: 'loi', thong_diep: thongDiep });
    return { maPhien, pid_de_hien_thi: pidDeHienThi, loi: thongDiep, buocOThatBai };
  } finally {
    updateSeatActivePid(maNhanSu, null);
    // Rút khỏi sổ tiến trình — CHỈ rút đúng TAY CẦM của mình (xem `xoaViec`).
    if (tienDangChay !== null) xoaViec(maO, tienDangChay);
  }
}
