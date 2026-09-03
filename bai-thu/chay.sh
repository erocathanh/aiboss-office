#!/bin/bash
# 🧊 CHẠY TOÀN BỘ BỘ ĐÓNG BĂNG HÀNH VI.
#   bash bai-thu/chay.sh          → chạy bộ đo (phải XANH)
#   bash bai-thu/chay.sh --ca-hai → chạy CẢ đối chứng âm (phải ĐỎ khi phá)
# 🔑 Chỉ khai «bộ đo xanh» thì chưa nói được gì. Phải kèm «và nó biết ĐỎ».
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
# 🚦 CHỐT WORKTREE ĐI TRƯỚC MỌI PHÉP ĐO — đây là chỗ người ta BẮT BUỘC đi qua.
# 🕳 Vì sao đặt Ở ĐÂY chứ không ở lúc `git worktree add`: đo 03/09 — git CÓ gọi hook
#    `post-checkout` khi thêm worktree, nhưng mã thoát khác 0 KHÔNG chặn được, worktree vẫn sinh ra.
#    Git KHÔNG có chỗ chặn lúc TẠO. Nên chốt phải nằm ở chỗ người ta ĐẾN ĐỂ LẤY SỐ.
# ⚠️ Bắt mã thoát TRỰC TIẾP, KHÔNG qua đường ống — ba người cắn bẫy đó trong ngày 03/09.
bash "$(dirname "$0")/cong-worktree.sh"
MA_CONG=$?
if [ "$MA_CONG" -ne 0 ]; then
  echo "⇒ DỪNG: chốt worktree trả mã $MA_CONG. Con số đo ra ở đây KHÔNG dùng được." >&2
  exit "$MA_CONG"
fi
echo
echo "═══ BỘ ĐÓNG BĂNG — phải XANH ═══"
fnm exec --using=24.19.0 -- node --experimental-strip-types --test bai-thu/*.test.mts 2>&1 \
  | grep -viE 'ExperimentalWarning|trace-warnings|MODULE_TYPELESS|Reparsing|To eliminate'
XANH=${PIPESTATUS[0]}
if [ "${1:-}" = "--ca-hai" ]; then
  echo; bash bai-thu/doi-chung-am.sh; AM=$?
  # 🔴 TÁCH TỆP CỐ Ý: `doi-chung-am.sh` là thước CHẤM của cổng nghiệm thu («phép phá CŨ chạy
  #    trên bản MỚI») ⇒ đụng vào nó là tự đo mình bằng cây thước mình vừa uốn.
  echo; bash bai-thu/doi-chung-am-thu-tu-moc.sh; AM2=$?
  echo; echo "⇒ bộ đo XANH: $([ $XANH -eq 0 ] && echo CÓ || echo KHÔNG)"\
"  · biết ĐỎ (phép phá CŨ): $([ ${AM:-1} -eq 0 ] && echo CÓ || echo KHÔNG)"\
"  · biết ĐỎ (thứ tự móc):  $([ ${AM2:-1} -eq 0 ] && echo CÓ || echo KHÔNG)"
  [ $XANH -eq 0 ] && [ ${AM:-1} -eq 0 ] && [ ${AM2:-1} -eq 0 ]; exit $?
fi
exit $XANH
