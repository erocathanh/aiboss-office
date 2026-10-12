// middleware.ts — LỚP CHẶN MẬT KHẨU cho toàn bộ trang phòng-ban-ai.
//
// Vì sao BẮT BUỘC (đo 17/08/2026, claude-web-funnel):
//   `/api/fork` dùng spawn() chạy `claude --resume … --fork-session` — THỰC THI LỆNH THẬT
//   trên máy Owner. Còn có /api/chat · /api/danh-thuc · /api/o · /api/phien.
//   Trang chạy localhost thì không sao. Nhưng khi bind 0.0.0.0 cho iPhone vào từ wifi,
//   BẤT KỲ thiết bị nào trong mạng cũng gọi được /api/fork ⇒ chạy Claude Code trên máy Owner,
//   đốt token, đọc/ghi tệp. Khách đến nhà bấm vào wifi là làm được.
//
// Mật khẩu: dùng chung với các web nội bộ khác, đặt qua biến môi trường PHONGBAN_USER/PHONGBAN_PASS
//   (nạp từ ~/.bos-funnel-basic-auth lúc khởi động — xem script chạy).
//   ⛔ KHÔNG hardcode mật khẩu vào tệp này.
//
// Fail-CLOSED có chủ đích: thiếu biến môi trường ⇒ CHẶN HẾT, không phải mở hết.
//   Cấu hình hỏng mà mở toang là kiểu hỏng tệ nhất — nó im lặng.

import { NextRequest, NextResponse } from 'next/server';

export const config = {
  // chặn mọi thứ trừ tài nguyên tĩnh của Next
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export function middleware(req: NextRequest) {
  /* ── Gọi TỪ CHÍNH MÁY thì đi thẳng (Owner chốt 17/08 tối) ──────────────
     Vì sao: các ghế AI trên cùng máy gọi nhau qua 127.0.0.1 (vd POST /api/danh-thuc
     để đánh thức ghế khác). Lớp mật khẩu ⛔ không phân biệt được «người lạ ngoài wifi»
     với «ghế bên cạnh trên cùng máy» ⇒ 15:41–21:41 hôm nay các ghế ⛔ KHÔNG gọi được nhau.
     Owner ưu tiên chạy mượt, chấp nhận rủi ro trong mạng nhà.
     ⚠️ GIỚI HẠN THẬT, ⛔ đừng tưởng đây là hàng rào: chỉ đọc header `host`, mà header thì
     GIẢ ĐƯỢC — người trong wifi gõ `curl -H "Host: 127.0.0.1" http://192.168.x.x:4319/`
     là qua được. Đây là cửa cho TIỆN, ⛔ không phải khoá. Máy trong LAN vẫn phải mật khẩu
     ở đường bình thường; ai cố tình thì vượt được.
     Gỡ: xoá khối này. Sao lưu: src/middleware.ts.truoc-mo-localhost */
  const host = (req.headers.get('host') || '').toLowerCase();
  const tuChinhMay = host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
  if (tuChinhMay) return NextResponse.next();

  const USER = process.env.PHONGBAN_USER;
  const PASS = process.env.PHONGBAN_PASS;

  // fail-closed: chưa cấu hình thì không ai vào được
  if (!USER || !PASS) {
    return new NextResponse(
      'Chua cau hinh mat khau (PHONGBAN_USER/PHONGBAN_PASS). Trang dong de an toan.',
      { status: 503 },
    );
  }

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(':');
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u === USER && p === PASS) return NextResponse.next();
    } catch {
      // rơi xuống đòi mật khẩu
    }
  }

  return new NextResponse('Can mat khau', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="phong-ban-ai", charset="UTF-8"' },
  });
}
