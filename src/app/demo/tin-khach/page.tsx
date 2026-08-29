'use client';

import { useState } from 'react';
import { DS_TIN } from '@/lib/demo-tin-khach';

/**
 * Trang «danh sách câu soạn sẵn» — kết quả mà PHÒNG CHĂM KHÁCH trả về.
 *
 * 🔴 ĐÍNH CHÍNH 20/08 — Owner sửa cách hiểu của tôi và của eeat, nguyên văn:
 *    «nút thật của app mình mà, demo app AIBOSS.VN sắp ra mắt nhưng thực tế thì claude code
 *     chúng ta vẫn giao việc và làm được, chẳng qua tôi không muốn học viên chờ»
 *    ⇒ Máy LÀM ĐƯỢC THẬT. Màn này quay sẵn để **bỏ qua đoạn chờ**, ⛔ phải vì nó bịa.
 *    Bản trước tôi viết «nút giả», eeat viết «lừa lớp» — cả hai đều hạ thấp một thứ CÓ THẬT.
 *
 *    ⚠️ Cái DUY NHẤT chưa xong là ĐOẠN ỐNG sang fanpage (Owner tự ráp bcls-platform sau,
 *       chính Owner nói vậy). Nên chữ hiện ra phải tách đúng hai phần:
 *         · máy soạn câu cho từng khách  → LÀM ĐƯỢC RỒI, đang thấy đây
 *         · bấm một cái tin bay sang khách → ống đang ráp
 *    ⛔ Đừng viết «đã gửi ✓» (nói quá) — cũng ⛔ viết «nút giả» (nói kém đi).
 */
export default function TinKhach() {
  const [daBam, setDaBam] = useState<number | null>(null);

  return (
    <main className="khu-tin">
      <style dangerouslySetInnerHTML={{ __html: `
        .khu-tin{min-height:100dvh;padding:22px 18px 40px;max-width:900px;margin:0 auto}
        .khu-tin h1{font-size:19px;margin:0 0 4px}
        .khu-tin .phu{opacity:.6;font-size:13px;margin:0 0 18px}
        .khu-tin .the{border:1px solid rgba(255,255,255,.12);border-radius:13px;
          padding:13px 15px;margin-bottom:11px}
        .khu-tin .dau{display:flex;align-items:baseline;gap:9px;margin-bottom:7px}
        .khu-tin .dau b{font-size:14px}
        .khu-tin .loai{font-size:11px;opacity:.65;border:1px solid rgba(255,255,255,.18);
          padding:1px 8px;border-radius:20px}
        .khu-tin .hoi{font-size:13px;opacity:.72;margin:0 0 8px}
        .khu-tin .tra{font-size:13.5px;line-height:1.6;background:rgba(255,255,255,.05);
          border-radius:9px;padding:9px 12px;margin:0 0 9px}
        .khu-tin .trong{opacity:.55;font-style:italic}
        .khu-tin .can-doc{font-size:12px;color:#e8b45c;margin:0 0 9px}
        .khu-tin button{font-size:13px;font-weight:700;padding:8px 15px;border-radius:9px;
          border:1px solid rgba(230,177,69,.55);background:transparent;color:#e6b145;cursor:pointer}
        .khu-tin .noi-that{margin-top:8px;font-size:12.5px;color:#e8955c;line-height:1.55}
      ` }} />

      <h1>Câu soạn sẵn — chờ anh chị duyệt</h1>
      <p className="phu">Mỗi dòng một khách. Đọc xong bấm duyệt từng cái, ⛔ gửi hàng loạt.</p>

      {DS_TIN.map((t, i) => (
        <section key={t.ten} className="the">
          <div className="dau">
            <b>{t.ten}</b>
            <span className="loai">hỏi {t.loai}</span>
          </div>
          <p className="hoi">“{t.hoi}”</p>
          <p className={`tra${t.traLoi ? '' : ' trong'}`}>
            {t.traLoi || 'Để trống — chờ anh chị quyết chính sách rồi mới soạn.'}
          </p>
          {t.canDoc && <p className="can-doc">⚠️ {t.canDoc}</p>}
          <button type="button" onClick={() => setDaBam(i)}>Duyệt và gửi</button>
          {daBam === i && (
            <p className="noi-that">
              Câu trả lời máy soạn xong rồi — phần anh chị thấy đây là thật.
              Còn <b>đoạn ống nối sang fanpage</b> Thanh đang ráp; ráp xong thì bấm một cái
              là tin bay thẳng tới khách.
            </p>
          )}
        </section>
      ))}
    </main>
  );
}
