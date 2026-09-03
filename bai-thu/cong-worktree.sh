#!/bin/bash
# 🚦 CHỐT WORKTREE — «KHÔNG ai mở worktree khi `git status` của thư mục cổng còn khác rỗng.»
#    Luật do claude-aiboss-app-pm chốt 03/09 (kênh 11:12), sinh từ BA ca ngoài-git trong 12 tiếng:
#      bai-thu/ tối 02/09 · ai/so-diff.py sáng 03/09 · bai-thu/ v4 trưa 03/09
#    Cả ba đều do NGƯỜI KHÁC bắt, không phải người làm ra nó — vì người vừa dựng xong một hiện vật
#    đang nghĩ về NỘI DUNG của nó, chứ không nghĩ về việc nó có ĐI ĐƯỢC sang chỗ khác không.
#
# 🔴 GIỚI HẠN ĐO ĐƯỢC, khai trước để đừng ai tưởng đây là cái chặn tuyệt đối (đo 03/09):
#    `git worktree add` CÓ gọi hook `post-checkout`, NHƯNG mã thoát khác 0 KHÔNG chặn được:
#    worktree vẫn sinh ra, và `git worktree add` vẫn trả 0.
#    ⇒ Git KHÔNG có chỗ chặn lúc TẠO worktree. Nên chốt thật nằm ở chỗ người ta ĐẾN ĐỂ LẤY SỐ:
#      `bai-thu/chay.sh` gọi tệp này TRƯỚC khi đo. Muốn có con số thì phải đi qua đây.
#
# ⚠️ KHÔNG lấy mã thoát SAU MỘT ĐƯỜNG ỐNG. Ba người cắn bẫy đó trong một ngày 03/09:
#    `node … | cut` rồi đọc `$?` ⇒ đó là mã của `cut`. Ở đây mã đo được BẮT riêng, kiểm riêng.
set -u

THU_MUC_CONG=("bai-thu" "ai")

dung() { echo "🚦 CHẶN — $1" >&2; exit "${2:-1}"; }

# ── ① tìm worktree CHÍNH. Lệnh đo TRƯỢT ⇒ CHẶN, KHÔNG coi là sạch ──────────────────────
ds=$(git worktree list --porcelain 2>/dev/null); ma_ds=$?
[ "$ma_ds" -eq 0 ] || dung "lệnh \`git worktree list\` trượt (mã $ma_ds) ⇒ CHƯA ĐO, không phải ĐẠT" 2
[ -n "$ds" ] || dung "\`git worktree list\` trả RỖNG ⇒ CHƯA ĐO. Rỗng là DỪNG, KHÔNG phải 0" 2
goc=$(printf '%s\n' "$ds" | awk '/^worktree /{print substr($0,10); exit}')
[ -n "$goc" ] && [ -d "$goc" ] || dung "không đọc được đường dẫn worktree CHÍNH ⇒ CHƯA ĐO" 2

day=$(git rev-parse --show-toplevel 2>/dev/null); ma_day=$?
[ "$ma_day" -eq 0 ] && [ -n "$day" ] || dung "không xác định được cây hiện tại ⇒ CHƯA ĐO" 2
[ "$day" = "$goc" ] && LA_CHINH=1 || LA_CHINH=0

# ── ①bis THƯ MỤC CỔNG PHẢI CÓ THẬT ────────────────────────────────────────────────────
# 🕳 CA CẮN NGAY LÚC TỰ NGHIỆM THU (03/09): kho KHÔNG có `bai-thu/` và `ai/` thì
#    `git status --porcelain -- bai-thu ai` trả RỖNG và mã 0 — git KHÔNG coi đó là lỗi.
#    Cổng đọc rỗng thành «sạch» và in ĐẠT. Tức là **thước ngắm vào chỗ trống rồi khai không có bụi.**
# 📌 Đúng bệnh tôi đi báo cả ngày hôm nay, và nó nằm trong chính cái chốt tôi vừa dựng.
#    Rỗng KHÔNG phải là 0 — rỗng nghĩa là thước CHƯA KỊP NÓI GÌ.
thieu=()
for d in "${THU_MUC_CONG[@]}"; do [ -e "$goc/$d" ] || thieu+=("$d"); done
[ ${#thieu[@]} -eq 0 ] || dung "thư mục cổng KHÔNG tồn tại ở $goc: ${thieu[*]}
     ⇒ CHƯA ĐO. Hoặc sai kho, hoặc danh sách THU_MUC_CONG đã lỗi thời — cả hai đều phải người xem." 2

# ── ② đo bẩn ở worktree CHÍNH. Mã đo bắt RIÊNG, đếm bắt RIÊNG ─────────────────────────
ban=$(git -C "$goc" status --porcelain -- "${THU_MUC_CONG[@]}" 2>&1); ma_ban=$?
[ "$ma_ban" -eq 0 ] || dung "lệnh đo trượt ở $goc (mã $ma_ban): ${ban:0:120} ⇒ CHƯA ĐO" 2
if [ -z "$ban" ]; then so_ban=0; else so_ban=$(printf '%s\n' "$ban" | wc -l | tr -d ' '); fi

# ── ②bis HOOK CÓ ĐƯỢC CÀI KHÔNG — nhắc, KHÔNG chặn ───────────────────────────────────
# 📌 Cân xứng: hook chỉ là phụ (nó KHÔNG chặn được `worktree add`, đã đo). Cái chặn thật là
#    chính tệp này. Nên thiếu hook thì NHẮC, chứ chặn người ta lấy số vì thiếu một thứ phụ
#    là đổi một rủi ro nhỏ lấy một cản trở lớn.
hook_dich="$(git rev-parse --git-common-dir 2>/dev/null)/hooks/post-checkout"
hook_nguon="$goc/bai-thu/hook-post-checkout"
if [ -f "$hook_nguon" ] && ! cmp -s "$hook_nguon" "$hook_dich" 2>/dev/null; then
  echo "ℹ hook post-checkout CHƯA cài (hoặc đã cũ) — .git/hooks KHÔNG đi theo kho." >&2
  echo "   cài bằng:  bash bai-thu/cai-hook.sh" >&2
fi

# ── ③ phán quyết. Cây CHÍNH bẩn là chuyện thường; cây LIÊN KẾT thì KHÔNG ──────────────
if [ "$so_ban" -eq 0 ]; then
  # 🧹 DỌN TỆP DẤU ĐÃ CŨ — điều kiện sinh ra nó đã hết thì nó phải tự biến đi.
  # 🕳 BA LẦN trong ngày 03/09 tệp dấu này chặn nhầm: ghi lúc cây chính đang commit dở (09:40),
  #    rồi cây sạch lại ngay sau đó — nhưng TỆP DẤU KHÔNG TỰ BIẾT MÌNH ĐÃ CŨ.
  #    Lần 2 nó chặn việc gỡ worktree của ghế KHÁC. Lần 3 nó chặn chính phép nghiệm thu của tôi.
  # 📌 Một cảnh báo đúng lúc sinh ra, mà KHÔNG có đường chết, thì nó sống dai hơn cái nó cảnh báo —
  #    và từ lúc ấy nó chỉ còn gây phiền, chứ không còn bảo vệ ai.
  if [ "$LA_CHINH" -eq 0 ] && [ -f "$day/KHONG-DUOC-TIN-BO-DO.txt" ]; then
    rm -f "$day/KHONG-DUOC-TIN-BO-DO.txt"
    echo "🧹 đã gỡ tệp dấu CŨ ở $day — cây chính nay đã sạch, cảnh báo hết hiệu lực"
  fi
  echo "🚦 CHỐT WORKTREE ĐẠT — ${THU_MUC_CONG[*]} sạch ở worktree chính ($goc)"
  exit 0
fi
echo "🚦 $so_ban tệp CHƯA VÀO GIT dưới ${THU_MUC_CONG[*]} tại worktree chính:" >&2
printf '%s\n' "$ban" | sed 's/^/     /' >&2
if [ "$LA_CHINH" -eq 1 ]; then
  # 📌 Ở cây chính, bẩn là BÌNH THƯỜNG — đó là chỗ người ta làm việc. Chỉ nhắc.
  echo "   ℹ đây LÀ cây chính ⇒ cho chạy tiếp, nhưng ĐỪNG mở worktree khi còn danh sách trên." >&2
  exit 0
fi
# 📌 Ở cây LIÊN KẾT thì khác hẳn: mã ở đây lấy từ HEAD, nên mọi thứ chưa commit KHÔNG có mặt.
#    Con số đo ra sẽ là số của bản CŨ — và nó vẫn XANH, nên KHÔNG ai đi tìm.
#    Ca thật 03/09: worktree từ HEAD chạy bộ đo ra 64/64 xanh, trong khi kho chính là 91/91.
dung "đang ở worktree LIÊN KẾT ($day) mà cây chính còn $so_ban tệp chưa commit.
     Số đo ở đây là số của bản CŨ trong HEAD, và nó vẫn XANH — xanh trông giống xanh.
     ⇒ commit ở cây chính rồi tạo lại worktree, hoặc chạy đo ở cây chính." 1
