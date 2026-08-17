#!/bin/zsh
# chay-lan.sh — chạy phòng-ban-ai cho iPhone/máy khác trong cùng wifi vào được.
#
# Vì sao có tệp này (17/08/2026): Owner muốn vào từ điện thoại để ra lệnh cho ông trùm.
# Bind 0.0.0.0 nghĩa là MỌI thiết bị trong wifi gọi được /api/fork — mà route đó chạy lệnh
# thật trên máy. Nên script này BẮT BUỘC nạp mật khẩu trước khi mở cổng; thiếu là dừng luôn.
#
# Dùng:  ~/Projects/phong-ban-ai/chay-lan.sh
# Tắt :  pkill -f 'next.*4319'

set -e
CHIA=~/.bos-funnel-basic-auth

if [ ! -f "$CHIA" ]; then
  echo "⛔ Không thấy $CHIA — chưa có mật khẩu thì KHÔNG mở ra wifi." >&2
  exit 1
fi

# tệp 2 dòng: dòng 1 = user, dòng 2 = mật khẩu. ⛔ không echo giá trị ra màn hình.
# Định dạng tệp: "user: <giá trị>" / "pass: <giá trị>" — phải cắt NHÃN trước dấu hai chấm ĐẦU TIÊN.
# (Bản đầu đọc nguyên cả dòng làm giá trị ⇒ chặn cả chính Owner. Đo được nhờ nghiệm thu 2 chiều.)
# ⚠️ chỉ xoá \r\n, KHÔNG xoá khoảng trắng — mật khẩu có thể chứa dấu cách.
export PHONGBAN_USER="$(sed -n '1p' "$CHIA" | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')"
export PHONGBAN_PASS="$(sed -n '2p' "$CHIA" | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')"

if [ -z "$PHONGBAN_USER" ] || [ -z "$PHONGBAN_PASS" ]; then
  echo "⛔ Đọc được tệp nhưng user/mật khẩu rỗng — dừng cho an toàn." >&2
  exit 1
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || echo "?")
TEN=$(scutil --get LocalHostName 2>/dev/null || echo "?")

echo "🔒 Mật khẩu: ĐÃ NẠP (user + pass đều có mặt — không in giá trị)"
echo "🌐 Vào từ điện thoại cùng wifi:"
echo "     http://${TEN}.local:4319"
echo "     http://${IP}:4319          ← dùng cái này nếu tên .local không ra"
echo "⏹  Tắt: pkill -f 'next.*4319'"
echo ""

# ── GHIM NODE 24.19.0 cho MÁY CHỦ và MỌI GHẾ nó đẻ ra (thêm 17/08/2026 22:3x) ──────
# Vì sao: `.node-version` ghim 24.19.0, nhưng PATH của máy có HAI lớp che fnm:
#   bậc 1  ~/.local/bin        ← từng chứa symlink node→hồ-sơ-Hermes-marketer (v22.23.1),
#                                 đặt 25/07/2026; đã cất thành `.tat-node-che-fnm-*`
#   bậc 2  /opt/homebrew/bin   ← node v26.3.0
#   bậc 18 fnm_multishells     ← thua cả hai ⇒ `.node-version` KHÔNG bao giờ được áp
# Hệ quả đo được 17/08: ghế trong app thấy node v22.23.1 và báo "pnpm không có trong shell này".
# Cách chữa: chèn thẳng bản đúng lên ĐẦU PATH, chỉ trong tiến trình này — ⛔ KHÔNG đụng PATH toàn máy
# (máy còn Hermes + openclaw + agent khác đang chạy; đổi PATH chung là đá chân người khác).
NODE_GHIM="$HOME/.local/share/fnm/node-versions/v24.19.0/installation/bin"
if [ -x "$NODE_GHIM/node" ]; then
  export PATH="$NODE_GHIM:$PATH"
else
  echo "⚠️ Thiếu node 24.19.0 ở $NODE_GHIM — chạy tạm bằng node đang có: $(node -v 2>/dev/null)" >&2
fi
echo "🟢 node dùng cho máy chủ + các ghế: $(node -v 2>/dev/null) · pnpm: $(pnpm -v 2>/dev/null || echo 'không thấy')"

cd ~/Projects/phong-ban-ai
# BẢN CHẠY THẬT (next start), ⛔ KHÔNG phải next dev.
# Vì sao đổi 17/08 16:0x: ở chế độ dev, Next biên dịch lại từng route lúc chạm vào
# (log: "Compiled /api/chat in 164ms") và bật lớp phủ báo lỗi đè lên màn hình —
# Owner mở bằng iPhone thấy khung đỏ "hydration mismatch" tưởng app hỏng, trong khi
# đó chỉ là cảnh báo của chế độ dựng-thử. Bản thật: không lớp phủ, không biên dịch lại, nhanh hơn.
# Sửa mã xong PHẢI dựng lại: cd ~/Projects/phong-ban-ai && npx next build
exec npx next start -H 0.0.0.0 -p 4319
