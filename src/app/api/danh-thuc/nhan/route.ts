import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nhanYeuCau, giuChoOBan } from '@/lib/kho-danh-thuc';

export const runtime = 'nodejs';

/**
 * 📢 KÊU KHI CÓ TAB CŨ ĐANG CÂM (ghế soi nêu 31/08).
 *
 * 🕳 CA: nạp bản mới lên máy chủ, nhưng tab iPhone của Owner VẪN chạy mã cũ cho tới khi
 *    anh tải lại trang. Tab cũ gửi mảng CHUỖI ⇒ `ma_nhan_su = null` ⇒ ⛔ ô nào được giao.
 *    Cổng vẫn trả 200, mẩu vẫn vào hàng — chỉ là ⛔ ai giao được.
 *    ⇒ Owner thấy «app im» mà ⛔ có một dấu hiệu nào chỉ ra vì sao.
 * 📌 Vá một lỗi hỏng-im-lặng mà đẻ ra lỗi hỏng-im-lặng khác thì coi như ⛔ vá.
 *    Nên chỗ này phải KÊU RA nhật ký: `~/Operations/logs/phong-ban-lan.log`.
 *    Tìm bằng: grep TAB-CU-DANG-CAM
 * ⏱ Hãm một phút một lần — vòng thăm dò chạy 12 lần/phút, kêu mỗi lần là ngập nhật ký
 *    và ⛔ ai đọc nữa. Nhật ký ngập cũng là một kiểu im lặng.
 */
let keuThieuKhaiLuc = 0;
const NHIP_KEU_MS = 60_000;
export const dynamic = 'force-dynamic';

/**
 * 🔖 DẤU VÂN BẢN DỰNG (P1-8 · 31/08/2026) — để TAB CŨ TỰ LỘ RA LÀ NÓ CŨ.
 *
 * 🎯 Owner chốt 31/08: tuần này nạp lại 30-40 lần. Ở nhịp đó, «nhớ nhắc Owner tải lại
 *    trang» ⛔ phải một lời dặn — nó là chỗ CHẮC CHẮN HỎNG. Quên một lần là Owner nhìn
 *    app im mà ⛔ có dấu hiệu nào chỉ ra vì sao.
 *
 * 🧪 CƠ CHẾ HỎNG CỤ THỂ THÌ CHƯA AI ĐO ĐƯỢC — nói thẳng, ⛔ giấu:
 *    `claude-aiboss-app-pm` đã dựng giả thuyết «tab cũ xin bó JS cũ ⇒ 404» rồi TỰ BÁC
 *    bằng số: bó cũ `page-fdeb465ab3c8b19d.js` VẪN CÒN trên đĩa sau lần dựng mới
 *    (đối chứng dương: bó của bản mới cũng có ⇒ lệnh `ls` ⛔ mù). Next GIỮ LẠI bó cũ.
 * ⇒ Nên cửa này ⛔ đoán tab hỏng KIỂU GÌ. Nó chỉ khai đúng một sự thật kiểm được:
 *    **mã máy chủ hiện là bản nào.** Đúng dù nguyên nhân là gì, và vẫn đúng khi
 *    nguyên nhân đổi ở lần dựng sau.
 *
 * 📌 ⛔ NHÉT LÚC DỰNG, ⛔ biến môi trường, ⛔ đụng `next.config.mjs` — đúng tệp đã hạ cả
 *    app ngày 18/08. Đọc thẳng tệp `.next/BUILD_ID` lúc chạy là đủ.
 *    (đo 31/08: thư mục làm việc của máy chủ = thư mục dự án ⇒ đường dẫn này đọc được thật)
 *
 * ⏱ ĐỌC ĐÚNG MỘT LẦN lúc nạp mô-đun, ⛔ đọc đĩa mỗi lời gọi: vòng thăm dò gõ cửa này
 *    12 lần/phút cho mỗi tab.
 *
 * ⚠️ HAI CHỖ CÒN HỞ, ghi ra để người sau ⛔ tưởng nó kín:
 *    ① `next dev` ⛔ sinh `.next/BUILD_ID` ⇒ trả chuỗi RỖNG. Bên trình duyệt coi rỗng là
 *       «⛔ biết» và IM. Chọn hụt-hơn-báo-nhầm có chủ ý: một băng báo sai còn tệ hơn ⛔ băng.
 *    ② Mô-đun nạp LÚC CÓ LỜI GỌI ĐẦU, ⛔ phải lúc máy chủ khởi. Nếu máy chủ sống suốt
 *       từ lúc khởi tới sau một lần dựng mà ⛔ MỘT tab nào gõ cửa này, con số bắt được sẽ
 *       là bản MỚI trong khi mã đang phục vụ là bản CŨ ⇒ ⛔ bao giờ báo. Vô hại trên thực tế
 *       vì ⛔ có tab nào gõ cửa nghĩa là ⛔ có ai cần được báo — nhưng nó CÓ THẬT.
 */
const BAN_DUNG: string = (() => {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim().slice(0, 64);
  } catch {
    return '';
  }
})();

/**
 * 🖐 TRÌNH DUYỆT NHẬN VIỆC — `POST /api/danh-thuc/nhan`
 *    `{ ds_o: ["o-1"], ds_ban: ["o-2"] }`
 *
 * ⏳ `ds_ban` (P0-2a, 30/08/2026): ô CÓ ghế nhưng ĐANG BẬN.
 *    Máy chủ ⛔ TỰ BIẾT điều đó — `dangChay` là trạng thái của trình duyệt.
 *    Khai ra thì mẩu được GIỮ chờ ô rảnh, thay vì hết hạn âm thầm sau 3 phút.
 * ⚠️ Ô ⛔ CÓ GHẾ thì ⛔ thuộc danh sách nào cả — nó KHÁC «bận». Ô trống mà tính là bận
 *    thì mẩu nhắm vào nó sẽ được giữ tới tận trần 30 phút cho một chỗ ⛔ ai ngồi.
 *
 * Trả về yêu cầu đánh thức còn hạn của từng ô VÀ đánh dấu ĐÃ XỬ ngay trong cùng lượt
 * (xem `nhanYeuCau` — lấy-và-đánh-dấu phải đi liền, nếu không hai tab cùng nhặt một
 * yêu cầu là chạy đúp, trả tiền hai lần).
 *
 * ⚠️ Vì sao gộp cả 4 ô vào MỘT yêu cầu thay vì mỗi ô một yêu cầu: 4 ô × 1 lần/5 giây
 *    = 48 lượt gọi mỗi phút cho một việc thường xuyên rỗng. Gộp còn 12.
 */
export async function POST(req: NextRequest) {
  let than: { ds_o?: unknown; ds_ban?: unknown; ma_trinh_duyet?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  /**
   * Nhận CẢ HAI dạng: chuỗi `"o-1"` (bản cũ) và vật `{ma_o, ma_nhan_su}` (bản nay).
   * ⚠️ Dạng cũ ⇒ `ma_nhan_su = null` ⇒ **⛔ được giao** (xem `nhanYeuCau`).
   *    Tab cũ còn mở thì nó ⛔ nhận được gì, nhưng thà thế còn hơn giao cho NHẦM GHẾ.
   */
  const locO = (v: unknown): { ma_o: string; ma_nhan_su: string | null }[] =>
    Array.isArray(v)
      ? v
          .flatMap((x) => {
            if (typeof x === 'string') {
              return /^o-\d+$/.test(x) ? [{ ma_o: x, ma_nhan_su: null }] : [];
            }
            if (x && typeof x === 'object') {
              const o = x as { ma_o?: unknown; ma_nhan_su?: unknown };
              if (typeof o.ma_o === 'string' && /^o-\d+$/.test(o.ma_o)) {
                return [{
                  ma_o: o.ma_o,
                  ma_nhan_su: typeof o.ma_nhan_su === 'string' ? o.ma_nhan_su : null,
                }];
              }
            }
            return [];
          })
          .slice(0, 8)
      : [];

  // 🪪 Mã TAB — để biết mẩu đang được GIỮ CHỖ bởi ai. Tab khác ⛔ xác nhận hộ được.
  const maTrinhDuyet =
    typeof than.ma_trinh_duyet === 'string' ? than.ma_trinh_duyet.trim().slice(0, 64) : '';

  const dsO = locO(than.ds_o);
  const dsBan = locO(than.ds_ban);

  // ⏳ GIỮ TRƯỚC, NHẶT SAU — ⛔ đảo thứ tự.
  //    Đảo lại thì trong cùng một nhịp, mẩu của ô bận có thể vừa kịp hết hạn ở bước nhặt
  //    rồi mới được giữ ⇒ giữ một cái đã chết, và ⛔ ai biết vì cả hai bước đều «xong».
  const daGiu = giuChoOBan(dsBan.map((x) => x.ma_o));

  const nhan: Record<
    string,
    { ma: string; ma_nhan_su: string; tu_ai: string; cau_hoi: string; luc: number }
  > = {};
  let lechGhe = 0;
  let thieuKhai = 0;
  for (const { ma_o: maO, ma_nhan_su: maNhanSu } of dsO) {
    const kq = nhanYeuCau(maO, maNhanSu, maTrinhDuyet);
    lechGhe += kq.lechGhe;
    if (kq.thieuKhai) thieuKhai += 1;
    const y = kq.y;
    // ⭐ Trả kèm `ma_nhan_su`: mẩu nhắm vào GHẾ, ⛔ vào ô. Ô có thể đã đổi ghế kể từ
    //   lúc xếp hàng ⇒ ⛔ có trường này thì bên nhận ⛔ cách nào biết mình có đúng người.
    if (y) nhan[maO] = { ma: y.ma, ma_nhan_su: y.ma_nhan_su, tu_ai: y.tu_ai, cau_hoi: y.cau_hoi, luc: y.luc };
  }

  /**
   * Mấy con số này để bên nghiệm thu ĐẾM được, ⛔ phải suy từ việc «⛔ thấy lỗi».
   * `lech_ghe` > 0 nghĩa là CÓ mẩu đang nằm chờ đúng ghế — ⛔ phải «⛔ có việc gì».
   */
  if (thieuKhai > 0) {
    const bayGio = Date.now();
    if (bayGio - keuThieuKhaiLuc > NHIP_KEU_MS) {
      keuThieuKhaiLuc = bayGio;
      console.warn(
        `[TAB-CU-DANG-CAM] ${thieuKhai} ô gửi danh sách dạng CHUỖI (⛔ khai ghế đang ngồi) ` +
        '⇒ máy chủ ⛔ dám giao mẩu nào cho chúng. Trang đang mở là BẢN CŨ — ' +
        'Owner cần TẢI LẠI TRANG. Xem chú thích đầu tệp app/api/danh-thuc/nhan/route.ts.',
      );
    }
  }

  // 🔖 `ban_dung`: chở thêm ĐÚNG MỘT trường trên cửa đã gọi sẵn — ⛔ cửa mới, ⛔ đồng hồ mới.
  return Response.json({ nhan, da_giu: daGiu, lech_ghe: lechGhe, thieu_khai: thieuKhai, ban_dung: BAN_DUNG });
}
