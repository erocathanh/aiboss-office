/**
 * 🚀 BẬT BỘ CHẠY NỀN — MỘT LẦN, từ đường NODE. Thay cho `instrumentation.ts`.
 *
 * 🕳 VÌ SAO BỎ `instrumentation.ts` (01/09/2026 · `claude-aiboss-app-pm` gây ra, `claude-aiboss-app-exe` đo ra):
 * ```
 * main = 609634b  ·  next build  →  ĐỎ, 5 mô-đun node: nổ trong bó edge
 *   node:child_process ← doc-phien ← may-chay-nen
 *   node:crypto ← kho-danh-thuc · node:fs · node:os · node:path
 * exe chứng minh nguyên nhân DUY NHẤT: dời instrumentation.ts ra ⇒ XANH ngay.
 * ```
 * 🔑 **Chốt của tôi là chốt LÚC CHẠY, còn gộp bó là LÚC DỰNG.**
 *    `instrumentation.ts` viết `if (NEXT_RUNTIME !== 'nodejs') return;` rồi `await import(...)`.
 *    Webpack đọc TĨNH cái chuỗi trong `import()` và kéo cả chuỗi phụ thuộc vào **bó edge** —
 *    nó KHÔNG biết nhánh kia sẽ chẳng bao giờ chạy. Mà bó edge có mặt là vì `middleware.ts`,
 *    và `middleware.ts` là LỚP CHẶN MẬT KHẨU — bỏ nó là mở máy Owner cho cả mạng.
 * 🕳 Cay nhất: chú thích trong chính `instrumentation.ts` đã cảnh báo ĐÚNG cái bẫy này,
 *    và tôi làm ĐÚNG như nó dặn. Lời cảnh báo nói về THỜI ĐIỂM CHẠY, cái bẫy sống ở THỜI ĐIỂM DỰNG.
 *    Sáu vòng soi mã đều đọc dòng ấy và đều gật. Chỉ lần đầu có người BẤM DỰNG thì nó mới lộ.
 *
 * ✅ CÁCH NÀY: mọi cửa `src/app/api/<tên>/route.ts` đều khai `export const runtime = 'nodejs'`
 *    (⚠️ cố ý viết `<tên>` chứ KHÔNG viết dấu sao — cụm sao-gạch-chéo ĐÓNG khối chú thích,
 *     và tsc báo 7 lỗi ở tận dưới, KHÔNG chỉ vào dòng gây ra. Tôi vừa cắn 01/09.)
 *    ⇒ chúng nằm trong bó NODE, KHÔNG dính bó edge. Gọi từ đó thì webpack KHÔNG có cớ
 *    kéo `node:*` sang edge nữa. Đây là đường có BẰNG CHỨNG (exe đã dựng xanh khi vắng
 *    `instrumentation.ts`), KHÔNG phải mẹo qua mặt bộ gộp bó.
 *
 * ⚖️ CÁI GIÁ, nói thẳng: bộ nền nay bật ở LƯỢT GỌI ĐẦU TIÊN vào một cửa API, KHÔNG phải lúc
 *    máy chủ khởi. Nhưng nó vẫn KHÔNG cần trình duyệt: bộ canh gõ `/api/dung` mỗi 90 giây,
 *    bộ hẹn nạp cũng gõ cửa đó. Máy tự sinh lời gọi cho chính mình.
 * ⚠️ Nếu sau này MỌI thứ tự gõ cửa đều tắt, bộ nền sẽ ngủ tới lời gọi kế. Ghi ra để người sau
 *    biết mà đo, đừng đoán.
 */
let daBat = false;

/** Gọi ở đầu mọi cửa API chạy runtime `nodejs`. An toàn khi gọi nhiều lần. */
export function batMotLan(): void {
  if (daBat) return;
  daBat = true; // đặt TRƯỚC khi làm — hai lời gọi sát nhau thì lời sau đứng ngoài ngay
  try {
    // ⚠️ `require` động, gọi TRONG hàm: giữ chuỗi phụ thuộc nằm hẳn trong bó node.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const may = require('@/lib/may-chay-nen') as typeof import('@/lib/may-chay-nen');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const kho = require('@/lib/kho-danh-thuc') as typeof import('@/lib/kho-danh-thuc');
    // Cắm nguồn dấu thăm dò TRƯỚC khi bật — thiếu bước này thì chốt ③ chạy bằng mặc định
    // «coi như có trình duyệt» và bộ nền đứng ngoài mãi mãi (an toàn, nhưng vô dụng).
    may.datNguonThamDo(kho.thamDoCuoiCua);
    const bat = may.bat();
    console.log(
      bat
        ? '[chay-nen] ĐÃ BẬT — máy chủ sẽ tự rút mẩu khỏi hàng đợi khi KHÔNG có trình duyệt lái.'
        : '[chay-nen] TẮT (đặt CHAY_NEN=1 để bật). App chạy y như cũ.',
    );
  } catch (e) {
    // Bật bộ nền hỏng thì KHÔNG được làm chết một lượt chat thật. Nhưng phải KÊU.
    console.error('[chay-nen] KHÔNG bật được:', e instanceof Error ? e.message : e);
  }
}
