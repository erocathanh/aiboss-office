import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cấu hình dạng HÀM (Next hỗ trợ sẵn) chứ KHÔNG phải object — vì cần biết ĐANG Ở PHA NÀO
 * mới chặn được `next dev`. Object thì KHÔNG có chỗ nào nhận thông tin đó.
 * @type {(phase: string) => import('next').NextConfig}
 */
export default function nextConfig(phase) {
  const thuMucDung = process.env.NEXT_DIST_DIR || '.next';

  /* ── SO ĐƯỜNG DẪN, KHÔNG SO CHUỖI ────────────────────────────────────────────────
     🕳 VERDICT NO-GO 04/09 (reviewer), câu 2: bản trước chốt bằng `thuMucDung === '.next'`.
        Reviewer thử BỐN cách gõ khác mà CÙNG TRỎ MỘT CHỖ — cả bốn LỌT:
          "./.next"  ·  ".next/"  ·  ".next/."  ·  ".next//"
        ⇒ `NEXT_DIST_DIR="./.next" next dev` VẪN xoá sạch bản dựng đang phục vụ Owner.
     🔑 **Cổng canh cái TÊN, trong khi thứ gây hoạ là cái CHỖ.** Một thư mục có vô số cách gõ;
        chỉ có MỘT đường dẫn đã chuẩn hoá.
     ⚠️ Giải tương đối theo THƯ MỤC CHỨA TỆP NÀY, KHÔNG theo `process.cwd()`:
        `dev/chay-dev.sh` chạy `next dev` từ một thư mục KHÁC rồi truyền gốc dự án làm tham số,
        nên `cwd` lúc đó KHÔNG phải gốc dự án. Lấy cwd là so nhầm chỗ. */
  const gocDuAn = path.dirname(fileURLToPath(import.meta.url));

  /* ── CÂU HỎI ĐÚNG KHÔNG PHẢI «HAI CHUỖI CÓ BẰNG NHAU», MÀ «GHI VÀO ĐÂY CÓ ĐỤNG .next KHÔNG»
     🕳 VÒNG 2, người soi thay là GEMINI (Hermes tắc tới 08/09) tìm ra BA LOẠI lỗ mà chốt so-chuỗi
        và cả chốt so-resolve đều LỌT. Hermes trước đó tìm 5 cách viết — nhưng cả 5 cùng MỘT LOẠI.
     📏 Tôi tự đo lại cả ba trên máy này, và số đo LẬT MỘT NỬA lời khuyên:
        ① HOA-THƯỜNG   hệ tệp máy này KHÔNG phân biệt hoa-thường (.NEXT/x tồn tại sau khi tạo .next/)
                       realpath('.NEXT') trả về '.NEXT', KHÔNG trả về '.next'
                       ⇒ **realpath KHÔNG chữa được ca này.** Phải so KHÔNG phân biệt hoa-thường.
        ② SYMLINK      path.resolve chuẩn hoá CHUỖI, KHÔNG gỡ liên kết. realpath GỠ được.  ⇒ dùng realpath
        ③ THƯ MỤC CON  .next/server resolve KHÁC .next ⇒ chốt cho qua, mà ghi vào đó VẪN phá bản dựng
        ③b THƯ MỤC CHA '.' chứa .next bên trong ⇒ cũng phá
                       ⇒ phải hỏi BAO HÀM hai chiều, KHÔNG hỏi bằng nhau.
     🔑 Ba loại, ba cơ chế. Làm một cái rồi tưởng xong là đúng cái bẫy đã đẻ ra vòng soi này. */

  // realpath phần TỔ TIÊN đã tồn tại, rồi ghép lại phần chưa có (thư mục dựng có thể chưa tạo)
  const giaiThat = (p) => {
    let cur = path.resolve(gocDuAn, p);
    const duoi = [];
    for (;;) {
      try {
        return duoi.length ? path.join(fs.realpathSync(cur), ...duoi.slice().reverse())
                           : fs.realpathSync(cur);
      } catch {
        const cha = path.dirname(cur);
        if (cha === cur) return path.resolve(gocDuAn, p);   // hết đường đi lên
        duoi.push(path.basename(cur));
        cur = cha;
      }
    }
  };

  // ĐO hệ tệp có phân biệt hoa-thường KHÔNG, KHÔNG đoán theo tên hệ điều hành.
  // Dùng chính gốc dự án làm mẫu vì nó CHẮC CHẮN tồn tại.
  const khongPhanBietHoaThuong = (() => {
    try {
      const H = gocDuAn.toUpperCase(), T = gocDuAn.toLowerCase();
      return H !== T && fs.existsSync(H) && fs.existsSync(T);
    } catch { return false; }
  })();
  const chuan = (p) => (khongPhanBietHoaThuong ? p.toLowerCase() : p);

  // «đụng nhau» = bằng nhau HOẶC cái này nằm trong cái kia (CẢ HAI chiều)
  const dungCham = (a, b) => {
    const A = chuan(a), B = chuan(b);
    return A === B || A.startsWith(B + path.sep) || B.startsWith(A + path.sep);
  };

  const duongSeDung = giaiThat(thuMucDung);
  const duongDangPhucVu = giaiThat('.next');

  /* ── CHỐT NODE_ENV — lỗ ④, agy tìm ra 04/09 ─────────────────────────────────────
     🕳 Hôm 03/09 tôi vá ca này bằng một dòng trong `dev/chay-dev.sh`. agy chỉ ra: gọi THẲNG
        `next dev` với NODE_ENV=production thì chốt distDir CHO QUA, rồi app nổ HTTP 500
        «EvalError: Code generation from strings disallowed» ở MỌI đường.
     🔑 **Vá ở lối đi KHÔNG bằng vá ở cái cửa.** Tôi bịt một lối, còn cái cửa vẫn mở.
        Nay chặn ngay trong cấu hình — mọi lối vào `next dev` đều đi qua đây.
     ⚖️ CHỈ chặn pha dev. `next build` và `next start` PHẢI có NODE_ENV=production. */
  if (phase === 'phase-development-server'
      && process.env.NODE_ENV && process.env.NODE_ENV !== 'development'
      && process.env.NODE_ENV !== 'test') {
    throw new Error(
      [
        '',
        `🔴 DỪNG — \`next dev\` đang chạy với NODE_ENV=${process.env.NODE_ENV}.`,
        '   Đo 03/09: dev sinh mã kiểu eval(), mà edge runtime CẤM eval ⇒ middleware nổ',
        '   ⇒ app trả HTTP 500 cho MỌI đường. Nhìn từ ngoài KHÔNG giống lỗi cấu hình.',
        '',
        '   VÌ SAO nó thành production: ghế AI chạy BÊN TRONG app nên thừa kế NODE_ENV của',
        '   máy chủ mẹ. KHÔNG ai cố ý đặt.',
        '',
        '   ĐƯỜNG ĐÚNG:  bash dev/chay-dev.sh      (đã đặt sẵn NODE_ENV=development)',
        '   hoặc:        NODE_ENV=development npx next dev …',
        '',
      ].join('\n'),
    );
  }

  if (phase === 'phase-development-server' && dungCham(duongSeDung, duongDangPhucVu)) {
    throw new Error(
      [
        '',
        '🔴 DỪNG — `next dev` đang định dựng vào `.next`, ĐÚNG thư mục cổng 4319 đang phục vụ.',
        '   Chạy tiếp là XOÁ SẠCH bản dựng của Owner (ca thật 03/09/2026: 8/8 tài nguyên HTTP 400).',
        '',
        '   ĐƯỜNG ĐÚNG:  bash dev/chay-dev.sh',
        '                (cổng 4320 · dựng vào .next-dev · trạng thái riêng · claude giả)',
        '',
        '   Cổng KHÔNG phải là thứ cách ly. `next dev -p <cổng khác>` mà thiếu NEXT_DIST_DIR',
        '   thì VẪN xoá `.next`. Thứ cách ly là NEXT_DIST_DIR.',
        '',
        `   NEXT_DIST_DIR bạn đưa : ${thuMucDung}`,
        `   giải ra thành         : ${duongSeDung}`,
        `   chỗ đang phục vụ      : ${duongDangPhucVu}`,
        '',
        '   ⚠️ Chốt chặn theo CHỖ THẬT, KHÔNG theo tên: biến thể chính tả · CHỮ HOA (.NEXT) ·',
        '      LIÊN KẾT MỀM · và cả THƯ MỤC CON (.next/server) hay THƯ MỤC CHA (.) đều bị chặn.',
        '   ⚠️ Nó chặn KỂ CẢ khi 4319 KHÔNG chạy — cố ý. Một cổng phải trả lời được «có an toàn',
        '      không» mà KHÔNG cần đi hỏi trạng thái bên ngoài; hỏi thêm là thêm một đường để sai.',
        '      Nên nếu bạn CHẮC CHẮN không có bản dựng nào đang được phục vụ, đây vẫn là chặn ĐÚNG.',
        '',
      ].join('\n'),
    );
  }

  return {
    reactStrictMode: true,
  /**
   * 🧪 THƯ MỤC DỰNG đọc từ biến môi trường — để bản DEV và bản CHẠY THẬT không giẫm nhau.
   *
   * 🕳 CA SINH RA (03/09/2026, tôi gây ra): tôi bật `next dev` cổng 4320 tưởng là đã cách ly
   *    (cổng riêng · `.trang-thai` riêng vì nó neo vào `process.cwd()` · claude giả).
   *    Nhưng `next dev` và `next start` DÙNG CHUNG `.next` ⇒ bản dev XOÁ SẠCH bản dựng mà
   *    cổng 4319 đang phục vụ. Đo lúc đó: 8/8 tài nguyên HTTP 400, `BUILD_ID` biến mất.
   *    App vẫn trả HTML 200 — nên nhìn từ ngoài nó KHÔNG giống một cái hỏng.
   * 🔑 Tôi kiểm BA đường cách ly rồi SUY đường thứ tư. Ba cái đúng không chứng minh cái thứ tư.
   *
   * ⚖️ MẶC-ĐỊNH-AN-TOÀN: biến KHÔNG đặt ⇒ `.next` ⇒ bản chạy thật cư xử Y HỆT trước dòng này.
   *    Khác hẳn một thay đổi phải NHỚ mới đúng — thứ đó sớm muộn cũng có người quên.
   * ĐỪNG đổi thành `?? ` — chuỗi RỖNG phải rơi về `.next`, chứ không được thành thư mục ''.
   */
    distDir: thuMucDung,
    // Web NỘI BỘ — không cho công cụ tìm kiếm đánh chỉ mục.
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
        },
      ];
    },
  };
}
