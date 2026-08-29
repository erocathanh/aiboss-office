'use client';

import { useState } from 'react';
import { SAU_O, MUC_CHIA_O, CHU_KY_GIONG } from '@/lib/demo-man-hinh';

/**
 * MÀN DEMO — dựng để CHỤP MÀN HÌNH đưa vào slide.
 *
 * 🔴 RÀNG BUỘC Owner (19/08): mở trang này ⛔ ĐƯỢC nạp giao diện làm việc thật.
 *    Giữ bằng cách: ⛔ import UngDung · ⛔ gọi cổng nào · ⛔ nối luồng nào.
 *    Nó chỉ là chữ tĩnh + một biến đếm ô.
 *
 * 🔴 RÀNG BUỘC Owner (20/08): «phải để giao diện giống bên phong-ban đang chạy, có để các nút bấm».
 *    Giữ bằng cách: dùng ĐÚNG TÊN LỚP của app thật (`nhom-bo-cuc` · `nut-bc` · `luoi bc-N` ·
 *    `o-chat` · `de-o` · `anh-o` · `tt-o` · `bang-tin` · `dong-tin` · `bong` · `soan`).
 *    Kiểu dáng do `globals.css` → `@import mau09.css` lo — mẫu 09 chính Owner đã duyệt.
 *    ⇒ ⛔ tự vẽ lại giao diện: vẽ lại là sớm muộn cũng lệch khỏi app thật.
 *
 * ⚠️ Chữ trong các ô nằm ở `src/lib/demo-man-hinh.ts`. Sửa chữ thì sửa BÊN ĐÓ.
 */
export default function ManDemo() {
  const [boCuc, setBoCuc] = useState<number>(6);
  const hien = SAU_O.slice(0, boCuc);

  return (
    <main className="khu-demo">
      {/* Chỉ thêm mức 6 — mau09.css mới có bc-1/2/4. ⛔ đụng tệp đó, viết riêng ở đây. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .khu-demo{display:flex;flex-direction:column;height:100dvh;overflow:hidden}
        .khu-demo .thanh-tren{flex:none;display:flex;align-items:center;gap:14px;
          padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
        .khu-demo .luoi{flex:1;min-height:0;display:grid;gap:10px;padding:10px}
        .khu-demo .luoi.bc-1{grid-template-columns:1fr;grid-template-rows:1fr}
        .khu-demo .luoi.bc-2{grid-template-columns:1fr;grid-template-rows:1fr 1fr}
        .khu-demo .luoi.bc-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
        .khu-demo .luoi.bc-6{grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr}
        @media(max-width:1100px){.khu-demo .luoi.bc-6{grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr)}}
        .khu-demo .o-chat{display:flex;flex-direction:column;min-height:0}
        .khu-demo .bang-tin{gap:7px}
        .khu-demo .ket-qua{flex:none;padding:9px 12px;border-top:1px solid rgba(255,255,255,.08);
          display:flex;flex-direction:column;gap:3px}
        .khu-demo .ket-qua a{display:inline-block;font-size:12.5px;font-weight:700;
          padding:7px 12px;border-radius:9px;text-decoration:none;
          border:1px solid rgba(230,177,69,.55);color:#e6b145}
        .khu-demo .ket-qua small{opacity:.6;font-size:11px}
        .khu-demo .ky-giong{flex:none;padding:0 12px 9px;font-size:11px;opacity:.65}
      ` }} />

      <div className="thanh-tren">
        <b style={{ letterSpacing: '.12em' }}>PHÒNG BAN AI</b>
        <div className="nhom-bo-cuc">
          {MUC_CHIA_O.map((n) => (
            <button
              key={n}
              className={`nut-bc${boCuc === n ? ' chon' : ''}`}
              type="button"
              data-bc={n}
              onClick={() => setBoCuc(n)}
              title={`${n} ô`}
              aria-label={`Bố cục ${n} ô`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={`luoi bc-${boCuc}`}>
        {hien.map((o, i) => (
          <div key={o.phong} className={`o-chat${i === 0 ? ' tieu-diem' : ''}`} data-o={i}>
            <div className="de-o">
              <div className="anh-o">{i === 0 ? '👑' : String(i + 1)}</div>
              <div className="tt-o">
                <b>{o.phong}</b>
                <div className="ma-ky-thuat">{o.nguoi}</div>
              </div>
              <span className="so-o">{i + 1}</span>
            </div>

            <div className="bang-tin">
              <div className="dong-tin ho">
                <div className="bong">{o.owner}</div>
              </div>
              <div className="dong-tin">
                <div className="bong">
                  {o.ra.map((d, k) => (
                    <div key={k}>{d || ' '}</div>
                  ))}
                </div>
              </div>
            </div>

            {o.ketQua && (
              <div className="ket-qua">
                <a href={o.ketQua.duong}>{o.ketQua.nhan}</a>
                {o.ketQua.ghi && <small>{o.ketQua.ghi}</small>}
              </div>
            )}
            <div className="ky-giong">✓ {CHU_KY_GIONG}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
