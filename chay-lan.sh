#!/bin/zsh
# chay-lan.sh — chạy phòng-ban-ai cho iPhone/máy khác trong cùng wifi vào được.
#
# Vì sao có tệp này (17/08/2026): Owner muốn vào từ điện thoại để ra lệnh cho ông trùm.
# Bind 0.0.0.0 nghĩa là MỌI thiết bị trong wifi gọi được /api/fork — mà route đó chạy lệnh
# thật trên máy. Nên script này BẮT BUỘC nạp mật khẩu trước khi mở cổng; thiếu là dừng luôn.
#
# Dùng:  ~/Projects/aiboss-app-chat/chay-lan.sh
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

# ── TRẦN LƯỢT CHẠY ĐỒNG THỜI (20/08/2026 · Owner bị chặn ở ô thứ 4) ──────────────
# Owner mở 6 ô nhưng máy chủ chỉ cho 3 lượt cùng lúc ⇒ gửi tới ô thứ 4 là hiện
#   «Máy chủ đang chạy 3 lượt cùng lúc (trần 3)»  (chan-muc-dung.ts:25)
# Nâng 3 → 6, ĐÚNG BẰNG SỐ Ô.
# 🔴 ⛔ TUYỆT ĐỐI ĐỪNG GỠ TRẦN (đặt 0 / vô hạn). Mỗi lượt là MỘT TIẾN TRÌNH `claude`
#    chạy thật — vòng lặp đánh thức mà ⛔ không có phanh thì ĐỐT TIỀN THẬT tới khi
#    Owner phát hiện. Trần là cái phanh, ⛔ không phải chỗ vướng.
# 📌 Trần THỨ HAI nâng ngay bên dưới — hai cái phải đi cùng nhau, xem chú thích ở đó.
export TRAN_DONG_THOI=6

# Trần THỨ HAI: số lượt mỗi phút cho MỖI KHÁCH (theo IP — chan-muc-dung.ts:34).
# Owner ngồi MỘT máy ⇒ cả 6 ô CHUNG một suất. Mặc định 6/phút ⇒ gửi đủ 6 ô là hết sạch
# suất của phút đó, câu thứ 7 (kể cả gửi lại một ô) bị chặn «Quá 6 lượt mỗi phút».
#
# 6 → 20 (20/08 sáng) → 60 (20/08, Owner lệnh «nâng lên 60 hay 100 luôn đi em»).
# 🔬 VÌ SAO 60 chứ ⛔ KHÔNG 100 — đo `chan-muc-dung.ts`:
#   dòng 22  if (dangChay >= tranDongThoi) return   ← kiểm TRƯỚC và THOÁT SỚM ⇒ ⛔ KHÔNG ghi mốc
#   dòng 34  if (moc.length >= soLuotMoiPhut) …     ← kiểm SAU
#   ⇒ `soLuotMoiPhut` chỉ đếm lượt THẬT SỰ ĐƯỢC CHẠY, mà số đó đã bị chặn trên bởi 6 chỗ song song.
#   ⇒ Trần VẬT LÝ: lượt ngắn nhất (~10 giây) cho tối đa ~36 lượt/phút; lượt ~30 giây chỉ ~12/phút.
#   ⇒ 60 phủ hết ca nhanh nhất mà VẪN là trần thật. 100 vượt xa mức vật lý ⇒ ⛔ không còn là phanh.
# ⛔ ĐỪNG bỏ hẳn, và ⛔ ĐỪNG đụng TRAN_DONG_THOI — cái đó mới là phanh TIỀN.
export SO_LUOT_MOI_PHUT=60

# ── CỜ TẮT «TRA CHUỖI GỐC TÍCH» (24/08/2026 · Owner phát hiện app sửa chữ mình) ──────
# Khi Owner hỏi kiểu «tôi đã dặn em việc này chưa?», app TỰ NỐI thêm một khối
#   «🔎 APP ĐÃ TRA GIÚP …» vào CUỐI câu Owner rồi mới đưa cho ghế (chat/route.ts).
# 📌 Ý đồ: bản fork chỉ giữ ~8,4% lịch sử ⇒ ghế «⛔ nhớ» là chuyện THƯỜNG, nết mặc định
#    là đáp «dạ chưa ạ» — SAI MỘT CÁCH TỰ TIN, mà Owner ⛔ có cách kiểm.
#    Nên đây là NỐI THÊM, ⛔ phải sửa chữ Owner. Nhưng Owner có quyền tắt.
#
# 1 (hoặc bỏ hẳn dòng này) = BẬT — nết hiện hành.
# 0                        = TẮT hẳn, traChuoi() trả null ngay, ⛔ nối gì vào câu Owner.
# ⚠️ Chỉ đúng chuỗi «0» mới tắt. Gõ «false»/«off»/«no» là VẪN BẬT — cố ý, để ⛔ ai
#    tắt nhầm một tính năng chống-sai-tự-tin bằng một chữ gõ vội.
export TRA_CHUOI=1

cd ~/Projects/aiboss-app-chat
# BẢN CHẠY THẬT (next start), ⛔ KHÔNG phải next dev.
# Vì sao đổi 17/08 16:0x: ở chế độ dev, Next biên dịch lại từng route lúc chạm vào
# (log: "Compiled /api/chat in 164ms") và bật lớp phủ báo lỗi đè lên màn hình —
# Owner mở bằng iPhone thấy khung đỏ "hydration mismatch" tưởng app hỏng, trong khi
# đó chỉ là cảnh báo của chế độ dựng-thử. Bản thật: không lớp phủ, không biên dịch lại, nhanh hơn.
# Sửa mã xong PHẢI dựng lại: cd ~/Projects/aiboss-app-chat && npx next build
#
# Bind `::` (dual-stack), not `0.0.0.0`. Owner decided round-27 Q1 = A, 11/09/2026.
# `0.0.0.0` claims IPv4 only, so another server could take the IPv6 side of this same
# port and the OS would raise no conflict at all. That happened on the night of
# 10/09/2026: next-server from another repo held [::]:4319 beside this app on
# 0.0.0.0:4319, and every request written as `localhost` went to the other app
# (macOS resolves ::1 first) and came back 401 with realm "claude-master-xemtruoc".
# Nothing crashed; the wake endpoint simply stopped reaching the seats, silently.
#
# Measured 11/09/2026 on a scratch port, both directions:
#   ::      + ::       -> EADDRINUSE   (loud, correct)
#   ::      + 0.0.0.0  -> EADDRINUSE   (loud, correct)
#   0.0.0.0 + ::       -> BOTH BIND    (the hole that bit us)
#   ::      + ::1      -> BOTH BIND    (still open: a specific address can squeeze in)
# So this closes two of the three doors, including the one that actually bit.
# It does not close the [::1] door. Do not read this line as "the port is now safe".
#
# `-H ::` still serves IPv4: 127.0.0.1 -> 200 and the wifi address -> 401 auth
# challenge from realm "phong-ban-ai" (reachable, just asking for the password),
# byte-identical to how this app answers on 4319 today.
#
# Deliberately NOT `HOST=::`. Any build of src/lib/chay-agent.ts still reads HOST as a
# fallback, and reads it to mean "this app is open to the network" -> restricted tools.
# Binding a port and changing every seat's tool set are two different decisions; do not
# ride one on the other.
#
# 11/09/2026: the brake in src/lib/chay-agent.ts now reads the `-H` flag straight out of
# process.argv, so it finally sees the truth — this app IS reachable from outside. Left
# alone it would drop all 26 tools at the next restart. That is not what this app is for:
# it stands in for the terminal, so it keeps full tools, and the line below SAYS so
# instead of letting a silent default decide it.
#
# Keep that line next to the -H flag on purpose. The bug being fixed was exactly a
# declaration living far away from the thing it claimed to describe: they drifted apart
# and no one saw it happen. Move the flag, move this line with it.
export GIONG_TERMINAL=1
exec npx next start -H :: -p 4319
