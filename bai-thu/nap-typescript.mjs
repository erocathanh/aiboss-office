/**
 * 🔌 NẠP `typescript` — chạy được ở CẢ kho chính LẪN worktree.
 *
 * 🕳 CA THẬT 02/09 22:0x (@claude-aiboss-app-pm bắt được lỗ, tôi đo ra gốc):
 *    ba bài thử nhập cứng `'../node_modules/typescript/lib/typescript.js'`.
 *    `node_modules/` bị `.gitignore` ⇒ **worktree mới KHÔNG có nó** ⇒ cả ba bộ ĐỎ ngay dòng nhập.
 * ⚖️ Nó hỏng về phía AN TOÀN (đỏ to, mã thoát 1) chứ KHÔNG xanh câm — nhưng «đỏ vì thiếu công cụ»
 *    và «đỏ vì mã hỏng» trông giống hệt nhau trên màn hình, và người vội sẽ bỏ qua CẢ HAI.
 * 🔑 Nguy hơn nữa là đường vòng: thợ thấy đỏ ⇒ tự chạy lại bản chụp trong worktree ⇒ chụp mã ĐÃ CHIA
 *    rồi so với chính nó ⇒ **XANH mà vô nghĩa**. Đó mới là ca @app-pm sợ, và nó đúng.
 *
 * ✅ Cách chữa: tìm `typescript` ở kho ĐANG ĐỨNG trước; không có thì hỏi git kho CHÍNH nằm đâu.
 *    KHÔNG tạo liên kết tượng trưng, KHÔNG cài thêm gì — chỉ ĐỌC từ chỗ đã có.
 * ⚠️ KHÔNG có ở cả hai chỗ ⇒ **NÉM LỖI CÓ CHỮ**, đừng trả về một bản giả để bộ đo chạy tiếp.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function timTypescript() {
  const ungVien = [new URL('../node_modules/typescript/lib/typescript.js', import.meta.url).pathname];
  try {
    // `git worktree list --porcelain`: dòng `worktree <đường>` ĐẦU TIÊN là kho chính
    const chinh = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' })
      .split('\n').find((l) => l.startsWith('worktree '))?.slice('worktree '.length);
    if (chinh) ungVien.push(`${chinh}/node_modules/typescript/lib/typescript.js`);
  } catch { /* không ở trong kho git ⇒ bỏ qua, để vòng dưới báo lỗi có chữ */ }
  for (const p of ungVien) if (fs.existsSync(p)) return p;
  throw new Error(
    'KHÔNG tìm thấy `typescript`. Đã thử:\n' + ungVien.map((x) => '  ' + x).join('\n') +
    '\n⇒ chạy `npm install` ở kho chính, hoặc chạy bộ đo từ kho chính.\n' +
    '⛳ KHÔNG được bỏ qua bài thử vì thiếu công cụ — thiếu công cụ nghĩa là CHƯA ĐO, không phải ĐẠT.',
  );
}

const duong = timTypescript();
const mod = (await import(duong)).default;

/**
 * 🔴 Q5 (reviewer NO-GO 22:35): «có thể nạp NHẦM kho hoặc KHÁC phiên bản TypeScript».
 * 🔑 Đúng — và cái nguy KHÔNG phải nạp nhầm, mà là **nạp nhầm mà KHÔNG ai biết**.
 *    Nên bộ này KHAI RA cả hai thứ, và bài thử ĐỌC lời khai đó rồi đối chiếu `package.json`.
 * ⚠️ Lệch phiên bản KHÔNG tự động là hỏng — cây cú pháp giữa hai bản gần nhau thường như nhau.
 *    Nhưng nó phải NÓI RA, để nếu ký hiệu đổi thì ta biết chỗ đầu tiên cần nghi.
 */
export const nguonTypescript = duong;
export const phienBanTypescript = mod.version;
/** `true` nếu typescript lấy từ chính kho đang đứng, `false` nếu mượn từ kho chính. */
export const layTuKhoDangDung =
  duong === new URL('../node_modules/typescript/lib/typescript.js', import.meta.url).pathname;
export default mod;
