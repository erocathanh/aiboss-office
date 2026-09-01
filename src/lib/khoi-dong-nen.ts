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
/**
 * 🔄 SỬA NGAY TRONG NGÀY (01/09, trước khi hai người soi kịp trả lời):
 *    bản đầu tôi dùng `require()` ĐỘNG trong hàm — thừa hưởng nỗi sợ từ `instrumentation.ts`.
 * 🔴 Nhưng nỗi sợ đó KHÔNG áp vào đây, và cái `require` ấy lại đẻ ra một rủi ro MỚI:
 *    mã nguồn là ESM, nếu `require` KHÔNG tồn tại lúc chạy thì `batMotLan()` ném lỗi,
 *    mà tôi bọc `try/catch` ⇒ **hỏng LẶNG**: bộ nền KHÔNG BAO GIỜ bật, log in một dòng
 *    mà KHÔNG ai đọc. Tôi tự ghi đó là «chỗ tôi ngờ nhất» rồi vẫn nộp — đúng cái nết
 *    `claude-phong-ban-pm` đã bắt tôi hôm nay: **nêu một chỗ ngờ KHÔNG phải là đã xử nó.**
 * ✅ Đo lại thì NHẬP TĨNH ở đây là an toàn, và an toàn vì một lý do CỤ THỂ:
 * ```
 * src/middleware.ts nhập DUY NHẤT 'next/server'  ⇒ KHÔNG chạm chuỗi này
 * api/dung + api/danh-thuc đều `export const runtime = 'nodejs'`
 * ⇒ đồ thị nhập của chúng nằm HẲN trong bó NODE. Nhập tĩnh ở đây KHÔNG chạm bó edge.
 * ```
 * 🔑 Thứ kéo `node:*` sang edge là `instrumentation.ts` — tệp bị dựng cho CẢ HAI runtime.
 *    Nó đi rồi thì KHÔNG cần mẹo nào nữa. **Đừng giữ một mẹo sau khi lý do của nó đã hết.**
 */
import { bat as batBoNen, datNguonThamDo } from '@/lib/may-chay-nen';
import { thamDoCuoiCua } from '@/lib/kho-danh-thuc';

/**
 * 🔴 HAI CỜ, KHÔNG PHẢI MỘT — `claude-phong-ban-pm` bắt 01/09.
 *
 * 🕳 Bản trước tôi đặt `daBat = true` NGAY ĐẦU, chú thích ghi «chống hai lời gọi sát nhau».
 *    Ý chống đua thì đúng, nhưng nó **khoá luôn đường thử lại**:
 * ```
 * daBat = true  →  try { … } catch { console.error }
 * ⇒ hỏng MỘT lần là chết VĨNH VIỄN: mọi lời gọi sau `return` ngay,
 *   bộ nền tắt tới lần khởi máy chủ kế, mà dấu vết chỉ là MỘT dòng lỗi trôi qua từ lâu.
 * ```
 * 🔑 **Một cờ KHÔNG gánh nổi hai việc**: «đang làm, đừng chen» và «làm xong rồi, thôi». Gộp chúng
 *    vào một biến thì thất bại bị ghi nhầm thành thành công.
 * ✅ Nay: `dangBat` chống đua · `daBat` chỉ bật ở CUỐI nhánh thành công.
 *    Hỏng thì cả hai về `false` ⇒ lời gọi sau còn thử lại, KHÔNG im lặng chịu chết.
 */
let daBat = false;
let dangBat = false;

/** Gọi ở đầu mọi cửa API chạy runtime `nodejs`. An toàn khi gọi nhiều lần. */
export function batMotLan(): void {
  if (daBat || dangBat) return;
  dangBat = true;
  /**
   * 🔴 HẸN RA NGOÀI ĐƯỜNG YÊU CẦU — `hermes-aiboss-app-review` FAIL ⑥, 01/09.
   *
   * 🕳 Bản trước gọi thẳng, ĐỒNG BỘ, và các cửa gọi nó TRƯỚC cả `req.json()`:
   * ```
   * POST có thân JSON hỏng
   *   TRƯỚC bản vá: parse hỏng → trả 400
   *   SAU  bản vá : nạp cả đồ thị `may-chay-nen` + dựng đồng hồ → RỒI MỚI phát hiện JSON hỏng → 400
   * ⇒ lượt đầu chậm thêm, và TÁC DỤNG PHỤ xảy ra TRƯỚC khi xác thực đầu vào.
   * ```
   * 🔑 **Một lời gọi «rẻ» đặt trước cửa kiểm tra thì nó KHÔNG còn rẻ nữa — nó thành cái giá
   *    mà MỌI yêu cầu phải trả, kể cả yêu cầu sai.**
   * ✅ Hẹn ở đây, KHÔNG phải ở nơi gọi: người gọi KHÔNG thể quên, và mọi cửa chỉ tốn đúng một dòng.
   *    `setImmediate` chạy sau khi lượt hiện tại nhả — bộ nền vẫn thức trong cùng nhịp,
   *    nhưng KHÔNG nằm trong đường đo thời gian đáp của ai cả.
   */
  setImmediate(() => {
  try {
    // Cắm nguồn dấu thăm dò TRƯỚC khi bật — thiếu bước này thì chốt ③ chạy bằng mặc định
    // «coi như có trình duyệt» và bộ nền đứng ngoài mãi mãi (an toàn, nhưng vô dụng).
    datNguonThamDo(thamDoCuoiCua);
    const bat = batBoNen();
    console.log(
      bat
        ? '[chay-nen] ĐÃ BẬT — máy chủ sẽ tự rút mẩu khỏi hàng đợi khi KHÔNG có trình duyệt lái.'
        : '[chay-nen] TẮT (đặt CHAY_NEN=1 để bật). App chạy y như cũ.',
    );
    daBat = true; // ✅ CHỈ đặt ở CUỐI nhánh thành công
  } catch (e) {
    // Bật bộ nền hỏng thì KHÔNG được làm chết một lượt chat thật. Nhưng phải KÊU,
    // và phải để lần sau CÒN THỬ LẠI — đó là chỗ bản trước của tôi khoá chết.
    console.error('[chay-nen] KHÔNG bật được (sẽ thử lại ở lượt gọi sau):', e instanceof Error ? e.message : e);
  } finally {
    dangBat = false; // dù thành hay bại đều nhả cờ đua — KHÔNG để nó kẹt
  }
  });
}
