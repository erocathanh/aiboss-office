/**
 * Dựng markdown thành HTML — bản NHẸ, tự viết, ⛔ không thư viện ngoài
 * (app phải tự chứa, ⛔ không gọi gì từ mạng).
 *
 * 🔴 THOÁT HTML TRƯỚC, DỰNG SAU — thứ tự này ⛔ KHÔNG được đảo.
 *    Agent có toàn quyền chạy lệnh; câu trả lời của nó có thể chứa `<script>`
 *    (vô tình khi bàn về mã, hoặc do đọc phải nội dung lạ). Dựng trước rồi mới thoát
 *    là mở cửa cho mã chạy trong trang. Thoát trước thì mọi thẻ thành chữ thường.
 */
const THOAT: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

function thoat(s: string): string {
  return s.replace(/[&<>"']/g, (c) => THOAT[c]);
}

/** Tách một hàng `| a | b |` thành các ô. */
function tachO(d: string): string[] {
  return d.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
}

/**
 * 📊 Dựng BẢNG markdown (thêm 17/08/2026 · claude-phong-ban-pm — Owner báo bảng ⛔ không vẽ).
 *
 * Làm bằng CÁCH TÁCH DÒNG, ⛔ không dùng một biểu thức khổng lồ: bảng là cấu trúc
 * NHIỀU DÒNG có ràng buộc giữa dòng đầu và dòng vạch — biểu thức một nhát rất dễ
 * ăn nhầm dòng gạch đầu dòng hoặc nuốt mất đoạn sau.
 *
 * ⚠️ Chạy SAU khối mã ```…``` (⛔ để bảng nằm trong khối mã ⛔ không bị dựng) và TRƯỚC bước
 *    đổi xuống dòng thành thẻ ngắt dòng.
 * 📱 Bọc trong khung cuộn riêng: bảng rộng thì CUỘN TRONG KHUNG, ⛔ không đẩy cả ô chat —
 *    đúng bài học «mép trái biến mất» trên máy gập chiều nay.
 */
function dungBang(s: string): string {
  const dong = s.split('\n');
  const laHang = (d: string) => /^\s*\|.*\|\s*$/.test(d);
  // Dòng vạch: chỉ gồm | : - và khoảng trắng, và PHẢI có ít nhất một dấu -
  const laVach = (d: string) => /^\s*\|[\s:|-]+\|\s*$/.test(d) && d.includes('-');

  const ra: string[] = [];
  let i = 0;
  while (i < dong.length) {
    if (laHang(dong[i]) && i + 1 < dong.length && laVach(dong[i + 1])) {
      const tieu = tachO(dong[i]);
      const canLe = tachO(dong[i + 1]).map((v) => {
        const trai = v.startsWith(':');
        const phai = v.endsWith(':');
        if (trai && phai) return 'center';
        if (phai) return 'right';
        return 'left';
      });
      i += 2;
      const than: string[][] = [];
      while (i < dong.length && laHang(dong[i])) { than.push(tachO(dong[i])); i++; }

      const kieu = (c: number) => ` style="text-align:${canLe[c] ?? 'left'}"`;
      const dauBang = tieu.map((o, c) => `<th${kieu(c)}>${o}</th>`).join('');
      const thanBang = than
        .map((h) => `<tr>${tieu.map((_, c) => `<td${kieu(c)}>${h[c] ?? ''}</td>`).join('')}</tr>`)
        .join('');
      ra.push(
        `<div class="cuon-bang"><table class="bang-md">` +
        `<thead><tr>${dauBang}</tr></thead><tbody>${thanBang}</tbody></table></div>`,
      );
    } else {
      ra.push(dong[i]);
      i++;
    }
  }
  return ra.join('\n');
}

export function dungMarkdown(tho: string): string {
  if (!tho) return '';
  let s = thoat(tho);

  // Khối mã ```…``` — làm TRƯỚC, kẻo dấu * bên trong bị hiểu thành đậm
  s = s.replace(/```(?:[a-z]*)\n?([\s\S]*?)```/g, (_m, ma) => `<pre><code>${ma.trim()}</code></pre>`);
  // Mã trong dòng `…`
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Đậm **…** rồi mới nghiêng *…* (⛔ đảo thứ tự là ** bị ăn mất một sao)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  // Tiêu đề ##…
  s = s.replace(/^#{1,4}\s+(.+)$/gm, '<b class="tieu-md">$1</b>');

  // 📊 Bảng — TRƯỚC danh sách và TRƯỚC bước đổi xuống dòng
  s = dungBang(s);

  // Gạch đầu dòng: gom các dòng liền nhau thành MỘT danh sách
  s = s.replace(/(?:^[-*]\s+.+(?:\n|$))+/gm, (khoi) => {
    const muc = khoi.trimEnd().split('\n')
      .map((d) => d.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .map((d) => `<li>${d}</li>`).join('');
    return `<ul>${muc}</ul>`;
  });

  // Xuống dòng còn lại → <br>, nhưng ⛔ đừng nhét <br> vào giữa các thẻ khối
  s = s.replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>');
  s = s.replace(/<br>(<\/?(?:ul|li|pre|code|b class|div class="cuon-bang"))/g, '$1')
       .replace(/(<\/(?:ul|pre)>)<br>/g, '$1')
       .replace(/(<\/div>)<br>/g, '$1');
  return s;
}
