'use client';

// `BongBong` — một bong bóng tin; `chenRanh` là phụ trợ RIÊNG của nó.
// 🔑 DỜI NGUYÊN VĂN từ `UngDung.tsx` dòng 300-341. KHÔNG sửa ký tự nào.
// 📌 Tách khỏi `hang-so.ts` vì đây là COMPONENT React (JSX + memo + useMemo) — khác hạng.
// 📏 Đo: `chenRanh`, `dungMarkdown`, `memo` chỉ khối này dùng ⇒ đi theo, KHÔNG export chenRanh.
import { memo, useMemo } from 'react';
import { dungMarkdown } from '@/lib/dung-markdown';

/**
 * Chèn xuống dòng tại mốc ranh giới mẩu.
 * ⚠️ Chỉ dùng để HIỂN THỊ. Chuỗi gốc `chu` giữ nguyên ⇒ tắt chế độ là sạch ngay.
 */
/**
 * 💬 MỘT bong bóng — MEMO HOÁ. Đây là chỗ chữa gốc chuyện «nóng máy + markdown vỡ».
 *
 * 🔴 GỐC THẬT (đo 17/08/2026, sau khi đọc mã `openclaw` trên máy Owner):
 *    Bản cũ gọi `dungMarkdown(t.chu)` THẲNG trong vòng lặp vẽ danh sách. React vẽ lại
 *    ô sau MỖI mẩu chữ ⇒ **MỌI bong bóng cũ cũng dựng lại markdown**, ⛔ không riêng
 *    bong bóng đang chảy. Ô có 40 tin ⇒ mỗi nhịp dựng 40 lần, mà một câu có hàng nghìn
 *    nhịp. Đó mới là thứ đốt CPU, ⛔ KHÔNG phải bản thân việc dựng markdown.
 *
 * 📌 `openclaw` (Owner chat qua điện thoại KHÔNG bị lỗi) ⛔ KHÔNG in thô lúc đang chảy —
 *    nó LUÔN dựng markdown. Nó nhẹ nhờ: giữ tối đa 60 tin gần nhất (`slice(-60)` — đo
 *    được trong `dist/control-ui/assets/chat-page-*.js`) và cập nhật entry THEO ID nên
 *    tin cũ giữ nguyên tham chiếu ⇒ ⛔ không vẽ lại.
 * ⇒ Ta làm đúng thứ đó: memo theo nội dung. Tin cũ ⛔ không đổi chữ ⇒ ⛔ không dựng lại.
 *    Nhờ vậy BỎ được kiểu «đang chảy thì in thô» — thứ Owner vừa phàn nàn.
 */
const BongBong = memo(function BongBong(
  { chu, ranh, hienMau, loi, dangChay, soLanLap, nhanLapAria }:
  {
    chu: string;
    ranh?: number[];
    hienMau: boolean;
    loi?: boolean;
    dangChay: boolean;
    soLanLap?: number;
    nhanLapAria?: string;
  },
) {
  const coLap = Boolean(loi && soLanLap && soLanLap > 1);
  const lop = `bong${loi ? ' loi' : ''}${dangChay ? ' dang-chay' : ''}${coLap ? ' co-lap' : ''}`;
  // ¶ bật ⇒ in thô có xuống dòng theo mẩu (⛔ markdown ⛔ không dựng được khi đã cắt dòng giữa câu)
  const thoTheoMau = useMemo(() => (hienMau ? chenRanh(chu, ranh) : ''), [hienMau, chu, ranh]);
  // Dựng markdown chỉ khi CHỮ đổi — tin cũ đứng yên thì ⛔ không tốn gì
  const html = useMemo(() => (hienMau ? '' : dungMarkdown(chu)), [hienMau, chu]);
  if (coLap) {
    return (
      <div className={`${lop}${hienMau ? ' tho' : ''}`}>
        {hienMau ? (
          <div className="noi-dung-bong">{thoTheoMau}</div>
        ) : (
          <div className="noi-dung-bong" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        <span className="nhan-lap-loi" aria-label={nhanLapAria} title={nhanLapAria}>
          ×{soLanLap}
        </span>
      </div>
    );
  }
  if (hienMau) return <div className={`${lop} tho`}>{thoTheoMau}</div>;
  return <div className={lop} dangerouslySetInnerHTML={{ __html: html }} />;
});

function chenRanh(chu: string, ranh?: number[]): string {
  if (!ranh || ranh.length === 0) return chu;
  const moc = ranh.filter((v) => v > 0 && v < chu.length);
  if (moc.length === 0) return chu;
  let ra = '';
  let truoc = 0;
  for (const m of moc) { ra += chu.slice(truoc, m) + '\n'; truoc = m; }
  return ra + chu.slice(truoc);
}

export { BongBong };
