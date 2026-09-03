#!/bin/bash
# 🧪 BẢN CHẠY DEV — cổng RIÊNG, để sửa giao diện KHÔNG phải dựng lại và KHÔNG cắt lượt ai ở 4319.
#
# 🔑 BA CHỐT, cả ba là CƠ CHẾ chứ không phải lời dặn — và KHÔNG sửa một dòng `src/` nào:
#   ⓪ THƯ MỤC DỰNG RIÊNG  NEXT_DIST_DIR=.next-dev  ⇐ CHỐT QUAN TRỌNG NHẤT, và là chốt tôi THIẾU
#      ở lần thử 21:4x — `next dev` và `next start` dùng chung `.next` ⇒ bản dev XOÁ SẠCH bản
#      dựng mà 4319 đang phục vụ (8/8 tài nguyên HTTP 400). Ba chốt dưới KHÔNG cứu được chỗ này.
#      🔑 Tôi kiểm ba đường cách ly rồi SUY đường thứ tư. Ba cái đúng KHÔNG chứng minh cái thứ tư.
#   ①bis CHỈ NGHE LOOPBACK  -H 127.0.0.1  ⇐ ĐO ĐƯỢC 03/09, và nó bác một tiền đề
#      `next dev` KHÔNG có -H thì nó vẫn nghe `*:4320`, tức MỌI giao diện — tôi đo bằng lsof
#      và gọi được từ LAN IP (ra 500, không phải 000). PM ngờ «có khi 4320 chỉ nghe loopback,
#      thế thì cửa anh canh không tồn tại» — ĐO RA NGƯỢC LẠI: cửa ấy CÓ tồn tại.
#      🔑 Bản dev mở ra wifi mà middleware lại đang hỏng ⇒ nếu ai «sửa cho chạy» bằng cách bỏ
#         middleware thì 4320 thành app KHÔNG mật khẩu trên wifi, với /api/fork chạy spawn THẬT.
#      ⇒ Chặn ở tầng SOCKET rẻ hơn và chắc hơn chặn ở tầng ứng dụng: mạng KHÔNG chạm tới được.
#   ① CỔNG RIÊNG   4320, cổng 4319 không bị đụng
#   ② TRẠNG THÁI RIÊNG  `.trang-thai/` neo vào `process.cwd()` (kho-phien.ts:15 · kho-danh-thuc.ts:23)
#      ⇒ chạy từ THƯ MỤC KHÁC là tự có sổ ô và hàng chuông riêng. Bản dev KHÔNG đụng sổ thật.
#   ③ KHÔNG TIÊU TIỀN  `DUONG_DAN_CLAUDE` (cau-hinh.ts:28) trỏ vào `claude-gia.sh`
#      ⇒ tiến trình sinh ra là bản GIẢ. Bản dev KHÔNG có đường nào chạm nhị phân thật.
#
# ⚠️ CÙNG KHO, CÙNG MÃ — `next dev` nhận thư mục dự án làm tham số, KHÔNG chép mã đi đâu.
#    Chép là đẻ bản thứ hai rồi hai bản trôi mỗi bản một kiểu.
set -u
export PATH="/opt/homebrew/bin:$PATH"
KHO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NHA="${NHA_DEV:-$HOME/Projects/aiboss-dev-4320}"
CONG="${CONG_DEV:-4320}"

if lsof -nP -iTCP:"$CONG" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "🔴 cổng $CONG ĐANG BẬN — DỪNG, đừng giẫm lên ai" >&2; exit 1
fi
mkdir -p "$NHA"
# `next` cần thấy node_modules từ THƯ MỤC CHẠY, nếu không nó tra bản Next ra "0.0.0" rồi Turbopack nổ.
ln -sfn "$KHO/node_modules" "$NHA/node_modules"
cd "$NHA" || exit 1
echo "🧪 bản DEV  cổng $CONG · dựng vào ${DIST_DEV:-.next-dev} · trạng thái riêng $NHA/.trang-thai · claude GIẢ"
echo "   mã lấy từ $KHO (cùng kho, không chép)"
exec env DUONG_DAN_CLAUDE="$KHO/dev/claude-gia.sh" NEXT_DIST_DIR="${DIST_DEV:-.next-dev}" npx next dev -H 127.0.0.1 -p "$CONG" "$KHO"
