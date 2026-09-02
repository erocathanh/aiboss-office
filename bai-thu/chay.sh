#!/bin/bash
# 🧊 CHẠY TOÀN BỘ BỘ ĐÓNG BĂNG HÀNH VI.
#   bash bai-thu/chay.sh          → chạy bộ đo (phải XANH)
#   bash bai-thu/chay.sh --ca-hai → chạy CẢ đối chứng âm (phải ĐỎ khi phá)
# 🔑 Chỉ khai «bộ đo xanh» thì chưa nói được gì. Phải kèm «và nó biết ĐỎ».
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
echo "═══ BỘ ĐÓNG BĂNG — phải XANH ═══"
fnm exec --using=24.19.0 -- node --experimental-strip-types --test bai-thu/*.test.mts 2>&1 \
  | grep -viE 'ExperimentalWarning|trace-warnings|MODULE_TYPELESS|Reparsing|To eliminate'
XANH=${PIPESTATUS[0]}
if [ "${1:-}" = "--ca-hai" ]; then
  echo; bash bai-thu/doi-chung-am.sh; AM=$?
  echo; echo "⇒ bộ đo XANH: $([ $XANH -eq 0 ] && echo CÓ || echo KHÔNG) · biết ĐỎ: $([ ${AM:-1} -eq 0 ] && echo CÓ || echo KHÔNG)"
  [ $XANH -eq 0 ] && [ ${AM:-1} -eq 0 ]; exit $?
fi
exit $XANH
