#!/bin/bash
# 🪝 CÀI hook post-checkout vào kho HIỆN TẠI.  `bash bai-thu/cai-hook.sh`
# 🕳 Vì sao cần script này: `.git/hooks/` KHÔNG được git theo dõi ⇒ hook KHÔNG đi theo kho.
#    Máy khác clone về sẽ có `bai-thu/hook-post-checkout` nằm đó mà KHÔNG chạy — đúng hình
#    «cổng có mặt trên đĩa nhưng vắng mặt lúc cần», thứ đội này cắn ba lần trong 12 tiếng.
# ⚠️ KHÔNG dùng core.hooksPath: kho này có `pre-commit` đang sống, đặt hooksPath là tắt nó.
set -u
goc=$(git rev-parse --show-toplevel 2>/dev/null); ma=$?
[ "$ma" -eq 0 ] && [ -n "$goc" ] || { echo "🔴 không ở trong kho git ⇒ DỪNG" >&2; exit 2; }
cai_mot() {   # cai_mot <tên hook>
  local ten="$1"
  local nguon="$goc/bai-thu/hook-$ten"
  [ -f "$nguon" ] || { echo "🔴 thiếu $nguon ⇒ DỪNG, đừng cài một thứ không đọc được" >&2; return 2; }
  local dich="$(git rev-parse --git-common-dir)/hooks/$ten"
  if [ -f "$dich" ] && ! cmp -s "$nguon" "$dich"; then
    local luu="$dich.truoc-cai-$(date +%Y%m%d-%H%M%S)"
    cp "$dich" "$luu"; echo "ℹ đã có hook KHÁC ở $ten — giữ lại bản cũ: $luu"
  fi
  cp "$nguon" "$dich" && chmod +x "$dich"
  echo "✅ đã cài: $dich"
}
cai_mot post-checkout || exit 2
cai_mot pre-commit    || exit 2
echo "   cả hai hook chạy được: post-checkout $([ -x "$(git rev-parse --git-common-dir)/hooks/post-checkout" ] && echo CÓ || echo KHÔNG) · pre-commit $([ -x "$(git rev-parse --git-common-dir)/hooks/pre-commit" ] && echo CÓ || echo KHÔNG)"
