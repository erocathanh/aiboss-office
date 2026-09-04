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
# ── CHỐT TỰ BẢO VỆ — verdict NO-GO 04/09, câu 5 ────────────────────────────────
# 🕳 Reviewer chấm CHƯA ĐẠT vì script này «dựa hết vào chốt trong config».
#    Đúng: nếu ai đó sửa/gỡ next.config.mjs thì script này KHÔNG còn gì che.
# 🔑 Một cái phanh duy nhất KHÔNG phải là hai lớp bảo vệ — nó là một điểm chết dùng chung.
#    Nên script tự kiểm lấy, KHÔNG hỏi config, KHÔNG hỏi ai.
# ⚠️ So ĐƯỜNG DẪN đã chuẩn hoá chứ KHÔNG so chuỗi — cùng lý do câu 2:
#    ".next" · "./.next" · ".next/" · ".next/." · ".next//" là NĂM cách gõ, MỘT thư mục.
DIST_SE_DUNG="${DIST_DEV:-.next-dev}"
# ⚠️ VÒNG 2: chốt này TRƯỚC ĐÂY chỉ so abspath ⇒ dính CẢ BA lỗ Gemini tìm ra
#    (hoa-thường · liên kết mềm · thư mục con). Nâng lên cùng mức với chốt trong config:
#    realpath (gỡ symlink) + so KHÔNG phân biệt hoa-thường + hỏi BAO HÀM hai chiều.
#    📌 Vá một chốt mà bỏ chốt kia thì lớp bảo vệ thứ hai thành mắt xích yếu — đúng thứ
#       câu 5 sinh ra để tránh.
DUNG_CHAM=$(cd "$KHO" && python3 - "$DIST_SE_DUNG" <<'PYCHOT'
import os, sys
def giai(p):
    p = os.path.abspath(p)
    cur, duoi = p, []
    while True:
        if os.path.exists(cur):
            return os.path.join(os.path.realpath(cur), *reversed(duoi))
        cha = os.path.dirname(cur)
        if cha == cur:
            return p
        duoi.append(os.path.basename(cur)); cur = cha
goc = os.path.abspath('.')
km = goc.upper() != goc.lower() and os.path.exists(goc.upper()) and os.path.exists(goc.lower())
c = (lambda x: x.lower()) if km else (lambda x: x)
a, b = c(giai(sys.argv[1])), c(giai('.next'))
print('CO' if a == b or a.startswith(b + os.sep) or b.startswith(a + os.sep) else 'KHONG')
PYCHOT
)
if [ "$DUNG_CHAM" != "KHONG" ]; then
  {
    echo "🔴 DỪNG — bản dev đang định dựng vào CHÍNH thư mục bản chạy thật."
    echo "   DIST_DEV bạn đưa : $DIST_SE_DUNG"
    echo "   giải ra thành    : $GIAI_DIST"
    echo "   chỗ đang phục vụ : $GIAI_NGUY"
    echo "   Chạy tiếp là XOÁ SẠCH bản dựng của Owner (ca thật 03/09: 8/8 tài nguyên HTTP 400)."
    echo "   Đặt DIST_DEV sang thư mục KHÁC, ví dụ: DIST_DEV=.next-dev bash dev/chay-dev.sh"
  } >&2
  exit 1
fi

mkdir -p "$NHA"
# `next` cần thấy node_modules từ THƯ MỤC CHẠY, nếu không nó tra bản Next ra "0.0.0" rồi Turbopack nổ.
# ② agy 04/09: `ln -sfn` tạo liên kết HỎNG vẫn trả THÀNH CÔNG khi đích chưa tồn tại
#    ⇒ script coi là hợp lệ rồi khởi chạy, và hỏng ở tận trong lúc nạp mô-đun.
#    📌 «lệnh chạy xong» KHÔNG bằng «thứ nó tạo ra dùng được». Phải ĐO cái vật, đừng đọc mã thoát.
ln -sfn "$KHO/node_modules" "$NHA/node_modules"
# agy vòng 3: `-e` bắt được liên kết HỎNG nhưng KHÔNG bắt được thư mục RỖNG.
# 📌 «đích tồn tại» KHÔNG bằng «đích DÙNG ĐƯỢC». Phải đo cái RUỘT, đừng đo cái vỏ.
if [ ! -e "$NHA/node_modules" ]; then
  { echo "🔴 DỪNG — liên kết node_modules HỎNG (trỏ vào chỗ không tồn tại)."
    echo "   trỏ tới : $KHO/node_modules"
    echo "   Chạy 'pnpm install' trong $KHO rồi thử lại."; } >&2
  exit 1
fi
if [ -z "$(ls -A "$NHA/node_modules" 2>/dev/null | head -1)" ]; then
  { echo "🔴 DỪNG — node_modules TỒN TẠI nhưng RỖNG."
    echo "   trỏ tới : $KHO/node_modules"
    echo "   Chạy 'pnpm install' trong $KHO rồi thử lại."; } >&2
  exit 1
fi
if [ ! -d "$NHA/node_modules/next" ]; then
  { echo "🔴 DỪNG — node_modules KHÔNG có gói 'next' ⇒ chưa cài xong."; } >&2
  exit 1
fi

# ③ agy 04/09: KHÔNG có khoá trên thư mục dựng dev ⇒ hai tiến trình dev giẫm nhau.
#    mkdir là thao tác NGUYÊN KHỐI của hệ tệp — dùng nó làm khoá, KHÔNG dùng "kiểm rồi tạo"
#    (giữa hai bước đó có khe cho tiến trình thứ hai lọt vào).
KHOA="$KHO/$DIST_SE_DUNG.khoa"
if mkdir "$KHOA" 2>/dev/null; then
  echo $$ > "$KHOA/pid"
  trap 'rm -rf "$KHOA"' EXIT INT TERM
else
  # 🕳 agy vòng 3 — KHE ĐUA do CHÍNH TÔI tạo ra sáng nay:
  #    giữa `mkdir` và `echo $$ > pid` có một khoảnh khắc tệp pid RỖNG.
  #    Bản cũ đọc rỗng ⇒ CU='?' ⇒ rơi thẳng xuống nhánh «thu hồi khoá của tiến trình đã chết»
  #    ⇒ XOÁ KHOÁ CỦA MỘT TIẾN TRÌNH ĐANG SỐNG, rồi hai bản dev cùng giẫm một thư mục.
  # 🔑 **KHÔNG BAO GIỜ thu hồi một cái khoá mà mình KHÔNG CHỨNG MINH được là đã chết.**
  #    Đọc-không-ra KHÔNG phải bằng chứng chết — nó là bằng chứng CHƯA BIẾT.
  CU=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do          # chờ tối đa ~1 giây cho bên kia ghi xong pid
    CU=$(cat "$KHOA/pid" 2>/dev/null || true)
    [ -n "$CU" ] && break
    sleep 0.1
  done
  if [ -n "$CU" ] && kill -0 "$CU" 2>/dev/null; then
    { echo "🔴 DỪNG — đã có một bản dev đang dùng $DIST_SE_DUNG (pid $CU)."
      echo "   Hai tiến trình dev cùng một thư mục dựng sẽ giẫm lên nhau."
      echo "   Chờ nó xong, hoặc chạy với DIST_DEV khác."; } >&2
    exit 1
  fi
  if [ -z "$CU" ]; then
    TUOI=$(( $(date +%s) - $(stat -f %m "$KHOA" 2>/dev/null || date +%s) ))
    if [ "$TUOI" -lt 300 ]; then
      { echo "🔴 DỪNG — có khoá trên $DIST_SE_DUNG nhưng CHƯA đọc được pid (khoá mới ${TUOI}s)."
        echo "   KHÔNG thu hồi: đọc-không-ra KHÔNG phải bằng chứng tiến trình kia đã chết."
        echo "   Chờ vài giây rồi thử lại, hoặc chạy với DIST_DEV khác."; } >&2
      exit 1
    fi
    echo "⚠️  khoá KHÔNG có pid và đã cũ ${TUOI}s (>300s) — coi là rác, thu hồi." >&2
  else
    echo "⚠️  khoá cũ của pid $CU đã chết — thu hồi." >&2
  fi
  rm -rf "$KHOA"; mkdir "$KHOA" || { echo "🔴 DỪNG — tiến trình khác vừa giành khoá." >&2; exit 1; }
  echo $$ > "$KHOA/pid"
  trap 'rm -rf "$KHOA"' EXIT INT TERM
fi
cd "$NHA" || exit 1
echo "🧪 bản DEV  cổng $CONG · dựng vào ${DIST_DEV:-.next-dev} · trạng thái riêng $NHA/.trang-thai · claude GIẢ"
echo "   mã lấy từ $KHO (cùng kho, không chép)"
# 🔴 NODE_ENV=development BẮT BUỘC — đo 03/09/2026, nhân quả hai chiều:
#      NODE_ENV=production  ⇒ HTTP 500 · EvalError: Code generation from strings disallowed
#      NODE_ENV=development ⇒ HTTP 200 · 0 lỗi
#    VÌ SAO nó thành 'production' ngay từ đầu: ghế AI chạy BÊN TRONG app, nên nó THỪA KẾ
#    NODE_ENV của máy chủ mẹ rồi truyền thẳng vào `next dev`. KHÔNG ai cố ý đặt nó cả.
#    Cơ chế: `next dev` sinh mã webpack kiểu eval("..."), mà edge runtime (nơi middleware
#    chạy) CẤM eval ⇒ nổ ngay lúc nạp middleware, và nổ thành 500 cho MỌI đường.
#    📌 Next CÓ cảnh báo dòng «non-standard NODE_ENV» ngay trên màn hình. Tôi đọc lướt qua nó
#       hai lần. Một cảnh báo đứng cạnh chỗ hỏng vẫn vô hình nếu ta đang tìm thứ khác.
# ⚠️ KHÔNG dùng `exec` ở đây: `exec` THAY THẾ tiến trình vỏ ⇒ `trap ... EXIT` KHÔNG bao giờ chạy
#    ⇒ khoá ở trên sẽ CÒN SÓT sau mỗi lần thoát.
#    🕳 Đo được 04/09 bằng phép thử ĐẦU-CUỐI, sau khi 23 ca đơn lẻ đều XANH.
#    🔑 Bài thử từng phần KHÔNG thấy được thứ chỉ lộ ra khi ghép cả đường lại.
env NODE_ENV=development DUONG_DAN_CLAUDE="$KHO/dev/claude-gia.sh" NEXT_DIST_DIR="${DIST_DEV:-.next-dev}" npx next dev -H 127.0.0.1 -p "$CONG" "$KHO"
