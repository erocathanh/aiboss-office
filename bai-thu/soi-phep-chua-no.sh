#!/bin/bash
# 🔍 SOI PHÉP CHƯA BAO GIỜ NỔ — «chốt mà điều kiện kích hoạt không bao giờ đúng thì TỆ HƠN không
#    có chốt: chốt vắng mặt thì còn có người lo, chốt có-mà-không-bao-giờ-nổ thì không ai lo,
#    và cũng không ai biết để đi gỡ» (luật nhà, claude-phong-ban-pm tra ra, PM nhận 03/09).
#
# 🎯 Câu nó trả lời: trong toàn bộ phép thử của bộ đo, phép nào ĐÃ TỪNG bị một phép phá làm ĐỎ,
#    và phép nào CHƯA BAO GIỜ. Phép chưa bao giờ đỏ KHÔNG hẳn là sai — nhưng nó CHƯA ĐƯỢC CHỨNG
#    MINH LÀ BIẾT ĐỎ, và ta phải biết mình đang có bao nhiêu cái như thế.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
HONG=$(mktemp /tmp/ten-hong-XXXX); DU=$(mktemp /tmp/ten-du-XXXX)

# ① mọi phép thử ĐANG CÓ (chạy trên mã lành ⇒ tất cả đều ✔)
fnm exec --using=24.19.0 -- node --experimental-strip-types --test bai-thu/*.test.mts 2>/dev/null \
  | grep -E '^ +✔ ' | sed 's/^ *✔ //;s/ ([0-9.]*ms)$//' | sort -u > "$DU"
TONG=$(wc -l < "$DU" | tr -d ' ')

# ② chạy CẢ HAI hộp phép phá, thu tên phép ĐỎ
GHI_TEN_HONG="$HONG" bash bai-thu/doi-chung-am.sh            >/dev/null 2>&1
GHI_TEN_HONG="$HONG" bash bai-thu/doi-chung-am-thu-tu-moc.sh >/dev/null 2>&1
sort -u "$HONG" -o "$HONG"
NO=$(wc -l < "$HONG" | tr -d ' ')

echo "═══ PHÉP THỬ ĐÃ TỪNG NỔ / TỔNG ═══"
echo "  tổng phép thử (không kể tên bộ): $TONG"
echo "  đã từng bị phép phá làm ĐỎ     : $NO"
echo "  CHƯA BAO GIỜ nổ                 : $((TONG-NO))"
echo
echo "═══ DANH SÁCH PHÉP CHƯA BAO GIỜ NỔ — đọc từng dòng, đừng đọc con số ═══"
comm -23 "$DU" "$HONG" | sed 's/^/  · /'

# 📌 GHI SỐ RA TỆP, kèm DẤU VÂN TAY của chính bộ đo — để `chay.sh` in kèm được, và để nó biết
#    con số đã CŨ hay chưa. Sổ bẫy mục 64 điều ④: đo một lần rồi ghi vào báo cáo thì nó thành
#    một giai thoại, không phải một cái cổng.
VAN_TAY=$(cat bai-thu/*.test.mts bai-thu/doi-chung-am.sh bai-thu/doi-chung-am-thu-tu-moc.sh | md5 -q)
printf '{"N":%s,"M":%s,"van_tay":"%s","luc":"%s","commit":"%s"}\n' \
  "$TONG" "$NO" "$VAN_TAY" "$(date '+%F %H:%M:%S')" "$(git rev-parse --short HEAD)" \
  > bai-thu/da-chung-minh-biet-do.json
echo
echo "  đã ghi số vào bai-thu/da-chung-minh-biet-do.json (chay.sh sẽ in kèm)"
rm -f "$HONG" "$DU"
