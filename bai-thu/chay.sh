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
# 🔎 SOI BẪY MÃ-THOÁT-SAU-ỐNG trong chính các tệp vỏ lệnh của bộ đo.
# 📌 Vì sao nó đứng CÙNG CỬA với chốt worktree: cả hai trả lời cùng MỘT câu —
#    «con số sắp in ra có tin được không». Một tệp vỏ đọc nhầm mã thoát thì nó CÓ THỂ
#    in XANH cho một lượt ĐỎ, và lúc ấy mọi con số bên dưới đều vô nghĩa.
python3 "$(dirname "$0")/soi-ma-thoat.py" "$(dirname "$0")" > /tmp/soi-ma-thoat.ra 2>&1
MA_SOI=$?
if [ "$MA_SOI" -ne 0 ]; then
  cat /tmp/soi-ma-thoat.ra >&2
  echo "⇒ DỪNG: tệp vỏ của bộ đo đang đọc mã thoát sai chỗ. Sửa xong hãy đo." >&2
  rm -f /tmp/soi-ma-thoat.ra; exit "$MA_SOI"
fi
rm -f /tmp/soi-ma-thoat.ra

echo
echo "═══ BỘ ĐÓNG BĂNG — phải XANH ═══"
# 🔴 KHÔNG lấy mã thoát sau đường ống. Dòng này TRƯỚC ĐÂY là `XANH=${PIPESTATUS[0]}` — đúng cái
#    bẫy ba người cắn NĂM lần trong ngày 03/09, và chính `bai-thu/soi-ma-thoat.py` bắt được nó
#    trong mã của tôi. Nếp thay thế: ghi ra tệp, lấy `$?` ngay sau lệnh TRẦN, rồi mới lọc để in.
RA_THU=$(mktemp /tmp/bai-thu-XXXXXX)
fnm exec --using=24.19.0 -- node --experimental-strip-types --test bai-thu/*.test.mts > "$RA_THU" 2>&1
XANH=$?
grep -viE 'ExperimentalWarning|trace-warnings|MODULE_TYPELESS|Reparsing|To eliminate' "$RA_THU"
rm -f "$RA_THU"
# 🔢 IN HAI SỐ, LUÔN LUÔN — sổ bẫy mục 64 điều ①.
# 🔑 «đang xanh N/N» nói bộ đo ĐANG XANH. Nó KHÔNG nói bao nhiêu phần trong đó BIẾT ĐỎ.
#    Một phép thử CHƯA TỪNG đỏ thì KHÔNG phân biệt được với một phép thử KHÔNG THỂ đỏ —
#    cả hai đều góp một dấu ✅ vào con số đem đi khoe.
# ⚠️ Thiếu số thứ hai thì phải KÊU. Vắng mặt im lặng chính là cách con số đầu tiên đi một mình.
# 🔴 VÂN TAY ÔM CẢ TỆP THƯỚC (*.mjs) — sửa 03/09 sau khi có VẬT CHỨNG.
#    Bản đầu chỉ ôm `.test.mts` + hai hộp phá. Tôi sửa `boc-mo-dun.mjs`, hành vi bộ đo ĐỔI THẬT
#    (76/91 → 91/91), mà vân tay vẫn khai «bộ đo KHÔNG đổi từ đó». Một câu trả lời SAI, không
#    phải một đánh đổi.
# ⚖️ Cái giá: sửa một CHÚ THÍCH trong tệp thước cũng làm nó kêu «số đã cũ». Chấp nhận, vì
#    giá của báo-cũ-oan = chạy lại 10 giây; giá của khai-còn-tươi-nhầm = một con số SAI đi vào
#    một quyết định. Hai cái giá đó không cùng hạng.
SO=bai-thu/da-chung-minh-biet-do.json
echo
if [ ! -f "$SO" ]; then
  echo "🔢 đã chứng minh BIẾT ĐỎ: CHƯA ĐO BAO GIỜ ⇒ chạy \`bash bai-thu/soi-phep-chua-no.sh\`"
  echo "   ⚠️ tới lúc đó, ĐỪNG dẫn con số xanh ở trên ra làm căn cứ cho bất kỳ quyết định nào."
else
  VT_NAY=$(cat bai-thu/*.test.mts bai-thu/*.mjs bai-thu/doi-chung-am.sh bai-thu/doi-chung-am-thu-tu-moc.sh | md5 -q)
  VT_CU=$(sed 's/.*"van_tay":"//;s/".*//' "$SO")
  M=$(sed 's/.*"M"://;s/,.*//' "$SO"); N=$(sed 's/.*"N"://;s/,.*//' "$SO")
  LUC=$(sed 's/.*"luc":"//;s/".*//' "$SO")
  if [ "$VT_NAY" = "$VT_CU" ]; then
    echo "🔢 đã chứng minh BIẾT ĐỎ: $M/$N   (đo $LUC, bộ đo KHÔNG đổi từ đó)"
  else
    echo "🔢 đã chứng minh BIẾT ĐỎ: $M/$N — ⚠️ SỐ NÀY ĐÃ CŨ (đo $LUC, bộ đo ĐÃ ĐỔI từ đó)"
    echo "   ⇒ thêm phép THỬ chỉ nâng N. Muốn nâng M thì thêm phép PHÁ. Chạy lại soi-phep-chua-no.sh."
  fi
fi

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
