import { BON_O, CHU_KY_GIONG } from '@/lib/demo-man-hinh';

/**
 * MÀN DEMO — dựng để CHỤP MÀN HÌNH đưa vào slide.
 *
 * 🔴 RÀNG BUỘC Owner đặt (19/08/2026): mở trang này ⛔ ĐƯỢC nạp giao diện làm việc thật.
 *    Cách giữ: tệp này ⛔ import `UngDung`, ⛔ gọi `/api/*`, ⛔ đụng phiên/ô/đánh-thức.
 *    Nó là thành phần MÁY CHỦ tĩnh — ⛔ có `use client`, ⛔ có trạng thái, ⛔ có mạng.
 *    ⇒ App thật chạy hay chết, trang này vẫn ra đúng một hình. Và ngược lại:
 *      bấm gì trên trang này cũng ⛔ chạm được vào app thật.
 *
 * ⚠️ Chữ trong 4 ô nằm ở `src/lib/demo-man-hinh.ts` — sửa chữ thì sửa BÊN ĐÓ.
 */
/* Kiểu dáng NHÚNG TRONG TRANG — cố ý ⛔ đụng globals.css của app thật.
   Owner dặn: mở bản demo ⛔ được ảnh hưởng app thật. Sửa globals.css là đổi CẢ HAI. */
const KIEU = `
.man-demo{min-height:100dvh;background:#0a1929;color:#faf7f0;
  font-family:-apple-system,'Segoe UI',Roboto,sans-serif;padding:26px 22px 34px}
.man-demo .thanh{display:flex;align-items:baseline;gap:14px;
  border-bottom:1px solid rgba(230,177,69,.3);padding-bottom:12px;margin-bottom:20px}
.man-demo .thanh b{color:#e6b145;letter-spacing:.14em;font-size:15px}
.man-demo .thanh span{color:#9db0c6;font-size:13px}
.man-demo .luoi{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1180px}
.man-demo .o{background:#102a43;border:1px solid rgba(230,177,69,.26);border-radius:14px;
  padding:15px 17px 13px;display:flex;flex-direction:column;min-height:232px}
.man-demo .o.xong{border-color:rgba(111,191,143,.5)}
.man-demo .o header{display:flex;align-items:baseline;gap:9px;margin-bottom:3px}
.man-demo .o header b{color:#e6b145;font-size:12.5px;letter-spacing:.1em}
.man-demo .nguoi{color:#7f93aa;font-size:12px}
.man-demo .dang-lam{color:#c9d6e4;font-size:13px;margin:0 0 11px;
  border-left:2px solid rgba(230,177,69,.45);padding-left:9px}
.man-demo .ra{flex:1;background:#0b1c30;border-radius:9px;padding:11px 13px;
  font-size:13.5px;line-height:1.62}
.man-demo .ra p{margin:0 0 8px}
.man-demo .ra p:last-child{margin-bottom:0}
.man-demo .ra .nhip{color:#8fa3b8;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.man-demo .o footer{margin-top:11px;font-size:12px;color:#6fbf8f;
  display:flex;align-items:center;gap:6px}
.man-demo .dau{font-weight:800}
@media(max-width:900px){.man-demo .luoi{grid-template-columns:1fr}}
`;

export const dynamic = 'force-static';

export default function ManDemo() {
  return (
    <main className="man-demo">
      <style dangerouslySetInnerHTML={{ __html: KIEU }} />
      <div className="thanh">
        <b>PHÒNG BAN AI</b>
        <span>bốn phòng · một giọng</span>
      </div>

      <div className="luoi">
        {BON_O.map((o) => (
          <section key={o.phong} className={`o ${o.trangThai}`}>
            <header>
              <b>{o.phong}</b>
              <span className="nguoi">{o.nguoi}</span>
            </header>
            <p className="dang-lam">{o.dangLam}</p>
            <div className="ra">
              {o.ra.map((d, i) => (
                <p key={i} className={d.startsWith('›') || d.startsWith('✓') ? 'nhip' : ''}>
                  {d}
                </p>
              ))}
            </div>
            <footer>
              <span className="dau">✓</span> {CHU_KY_GIONG}
            </footer>
          </section>
        ))}
      </div>
    </main>
  );
}
