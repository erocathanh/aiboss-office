/**
 * 🔠 CỠ CHỮ VÙNG ĐỌC — hai mức, nhớ theo MÁY (Owner 17/09/2026:
 * «font chữ hiện tại là Trung Bình, cần thêm 1 mức to hơn 2 mức nữa là Mức lớn»).
 *
 * Mức nằm ở ĐÚNG MỘT chỗ trong trang: thuộc tính `data-co-chu` trên thẻ `<html>`.
 * CSS đọc nó (`globals.css`, khối «HAI MỨC CỠ CHỮ») và đổi biến `--ti-le-chu`.
 *
 * ⚠️ Nói cho ĐÚNG mức: cỡ chữ đổi qua DOM, KHÔNG đi qua React. Bấm chọn mức VẪN có một lượt
 *    vẽ lại (dấu tick trong menu là trạng thái React), nhưng KHÔNG ô chat nào bị DỰNG LẠI
 *    ⇒ chữ Owner gõ dở trong ô soạn còn nguyên. Đo được, KHÔNG phải suy:
 *    `dev/shot-text-size.mjs --case menu` trả `soan_giu: true` ở bước «vừa chọn Lớn».
 *
 * 🔑 Vì sao neo ở `<html>` chứ KHÔNG phải một lớp CSS trên khung app: menu xổ, màn che và
 *    mọi thứ vẽ ngoài khung đều là con của `<body>`. Neo ở gốc thì cả trang nghe MỘT nguồn.
 *
 * 📌 KHOÁ LƯU `phong-ban-ai.co-chu` là khoá THỨ NĂM cùng họ `phong-ban-ai.*`.
 *    Bốn khoá kia khai ở `hang-so.ts:111-114`, và chú thích tại đó đếm «ĐÚNG 4» —
 *    con số ấy đúng ngày 29/08 và nay đã CŨ. Lượt này CỐ Ý KHÔNG sửa `hang-so.ts`:
 *    tệp đó đang neo băm của verdict «đổi tên ghế ô 4» chưa nạp, sửa là gãy cổng băm.
 *    ⇒ Việc chỉnh con số ấy nộp cho PM làm việc tồn, KHÔNG im lặng để đó.
 */
export type CoChu = 'trung' | 'lon';

export const CO_CHU_MAC_DINH: CoChu = 'trung';
export const KHOA_CO_CHU = 'phong-ban-ai.co-chu';

/** Thứ gì KHÔNG phải một trong hai mức thì coi như CHƯA CHỌN — kể cả rác cũ của bản sau này. */
export function laCoChu(v: unknown): v is CoChu {
  return v === 'trung' || v === 'lon';
}

/** Chưa lưu · lưu rác · trình duyệt cấm đọc ⇒ đều ra Trung bình. Đây là nghiệm thu ⓖ của đề. */
export function docCoChu(): CoChu {
  try {
    const v = localStorage.getItem(KHOA_CO_CHU);
    return laCoChu(v) ? v : CO_CHU_MAC_DINH;
  } catch {
    return CO_CHU_MAC_DINH;
  }
}

export function luuCoChu(m: CoChu): void {
  try {
    localStorage.setItem(KHOA_CO_CHU, m);
  } catch {
    /* chế độ riêng tư: mức vẫn đổi ngay, chỉ KHÔNG nhớ được sang lần sau */
  }
}

/**
 * Gắn mức lên `<html>`. Gọi được cả khi chưa có DOM (Next vẫn dựng thử phía máy chủ) ⇒ tự bỏ qua.
 * LUÔN ghi rõ cả hai mức, KHÔNG xoá thuộc tính ở mức Trung bình: nhìn DOM là biết app đang ở mức nào,
 * thay vì phải suy từ chỗ vắng mặt. Thứ vắng mặt KHÔNG phân biệt được «mặc định» với «chưa chạy».
 */
export function apDungCoChu(m: CoChu): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-co-chu', m);
}
