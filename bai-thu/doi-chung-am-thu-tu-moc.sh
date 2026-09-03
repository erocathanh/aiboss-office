#!/bin/bash
# 🔴 ĐỐI CHỨNG ÂM cho THƯỚC THỨ TỰ MÓC — LÀN B.
#
# 🔑 Tệp này TÁCH RIÊNG khỏi `doi-chung-am.sh` một cách CỐ Ý, hai lý do đều là ràng buộc thật:
#    ① `doi-chung-am.sh` là CÁI THƯỚC CHẤM của cổng nghiệm thu («phép phá CŨ chạy trên bản MỚI»).
#       Sửa nó là tự đo mình bằng cây thước mình vừa uốn.
#    ② LÀN A (`hermes-build-app`) chạy song song — giao nhau 0 tệp thì mới song song thật.
#
# ⚠️ Mỗi phép phá ở đây đều là thứ mà **thước DỜI-THUẦN của LÀN A KHÔNG thấy**: tập hợp dòng
#    KHÔNG đổi, chỉ THỨ TỰ đổi. Đó là chỗ hai làn bù cho nhau, và là lý do phải có cả hai.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
NODE="fnm exec --using=24.19.0 -- node"
CHAY="$NODE --experimental-strip-types --test"
BO_MOC=bai-thu/dong-bang-thu-tu-moc.test.mts
BO_THAN=bai-thu/dong-bang-than.test.mts
B0=$(md5 -q src/components/UngDung.tsx)
DAT=0; TONG=0; LOP_SAI=0

# 🟢 ĐỐI CHỨNG DƯƠNG NGƯỢC — bản chép KHÔNG phá gì phải XANH.
#    Thiếu bước này thì mọi cái ĐỎ bên dưới có thể chỉ là «đường dẫn sai», và ta sẽ mừng nhầm.
CT=/tmp/khong-pha-$$.tsx; cp src/components/UngDung.tsx "$CT"
if NGUON_THU="$CT" $CHAY "$BO_MOC" >/dev/null 2>&1; then
  echo "🟢 bản chép KHÔNG phá ⇒ XANH (thước đọc đúng tệp, cái ĐỎ bên dưới mới có nghĩa)"
else
  echo "🔴 bản chép KHÔNG phá đã ĐỎ ⇒ DỪNG: thước đang hỏng vì lý do khác, mọi số dưới đây vô nghĩa"
  rm -f "$CT"; exit 1
fi
rm -f "$CT"
echo

# 🏷 pha() nay đòi KHAI LỚP — cùng cổng với `doi-chung-am.sh`.
#    Ba phép phá sai nhãn bị bắt 03/09 đều ở hộp KIA; hộp NÀY chưa từng bị bắt.
# 📌 Nhưng «chưa bị bắt» KHÔNG phải «đã được soi». Đưa cả hai hộp vào cùng một cổng thì lần sau
#    KHÔNG phải hỏi hộp nào đã soi hộp nào chưa — và câu hỏi đó chính là chỗ ba lỗi kia trốn.
pha() {  # lớp · tên · cũ · mới · "hoan-vi" nếu phải chứng minh tập hợp dòng KHÔNG đổi
  local lop="$1" ten="$2" cu="$3" moi="$4" loai="${5:-}"
  TONG=$((TONG+1))
  local t=/tmp/pha-moc-$$-$TONG.tsx
  cp src/components/UngDung.tsx "$t"
  python3 -c "
import io,sys
p,cu,moi,loai = sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]
s=io.open(p,encoding='utf-8').read()
if s.count(cu)!=1:
    print('  🔴 KHÔNG dựng lại được ca phá (neo có',s.count(cu),'chỗ) ⇒ BỎ, đừng tính là ĐẠT'); sys.exit(2)
t=s.replace(cu,moi)
io.open(p,'w',encoding='utf-8').write(t)
if loai=='hoan-vi':
    a,b=sorted(s.splitlines()),sorted(t.splitlines())
    print('     (tập hợp dòng sau khi phá:', 'Y HỆT ⇒ thước dời-thuần của LÀN A sẽ IM' if a==b else '🔴 ĐÃ ĐỔI ⇒ đây KHÔNG phải hoán vị, phép phá đặt sai tên', ')')
    if a!=b: sys.exit(2)
" "$t" "$cu" "$moi" "$loai" || { rm -f "$t"; return; }
  local kl; kl=$($NODE bai-thu/lop-phep-pha.mjs src/components/UngDung.tsx "$t" "$lop" 2>&1 | grep -E '^LỚP-' | head -1)
  if [[ "$kl" != LỚP-ĐÚNG* ]]; then
    echo "  🏷 $ten"; echo "     ⇒ $kl"; LOP_SAI=$((LOP_SAI+1)); rm -f "$t"; return
  fi
  local m=1 h=1 ra=/tmp/ra-pha-$$.txt
  NGUON_THU="$t" $CHAY "$BO_MOC"  >"$ra" 2>&1 || m=0
  [ -n "${GHI_TEN_HONG:-}" ] && grep -E "^ +✖ " "$ra" | sed "s/^ *✖ //;s/ ([0-9.]*ms)$//" >> "$GHI_TEN_HONG"
  NGUON_THU="$t" $CHAY "$BO_THAN" >"$ra" 2>&1 || h=0
  [ -n "${GHI_TEN_HONG:-}" ] && grep -E "^ +✖ " "$ra" | sed "s/^ *✖ //;s/ ([0-9.]*ms)$//" >> "$GHI_TEN_HONG"
  if [ $m -eq 0 ] || [ $h -eq 0 ]; then
    echo "  ✅ $ten ⇒ ĐỎ  (lớp «${lop}» khớp · thứ-tự-móc: $([ $m -eq 0 ] && echo bắt || echo ' - ') · hình-dạng-thân: $([ $h -eq 0 ] && echo bắt || echo ' - '))"
    DAT=$((DAT+1))
  else
    echo "  🔴 $ten ⇒ CẢ HAI thước VẪN XANH"
  fi
  rm -f "$t"
}

echo "═══ HOÁN VỊ THẬT — tập hợp dòng KHÔNG đổi, chỉ THỨ TỰ đổi ═══"
echo "   🕳 Đây đúng ca mà bản gộp-phẳng v2 trả 15/15 XANH, và phép phá ② mang tên «đổi thứ tự»"
echo "      nhưng lệnh của nó là XOÁ ⇒ chỗ này chưa từng bị thử suốt hai đêm."
pha hoan-vi-moc "① hoán vị hai useState liền nhau (tieuDiem ↔ nhacO1)" \
    "  const [tieuDiem, datTieuDiemThuan] = useState(0);
  const [nhacO1, datNhacO1] = useState('');" \
    "  const [nhacO1, datNhacO1] = useState('');
  const [tieuDiem, datTieuDiemThuan] = useState(0);" hoan-vi
pha hoan-vi-moc "② hoán vị hai useState KHÁC KIỂU (phongMo ↔ phongChon)" \
    "  const [phongMo, datPhongMo] = useState<string | null>(null);
  const [phongChon, datPhongChon] = useState<string | null>(null);" \
    "  const [phongChon, datPhongChon] = useState<string | null>(null);
  const [phongMo, datPhongMo] = useState<string | null>(null);" hoan-vi

echo
echo "═══ ĐỔI DANH TÍNH MÓC — cùng số lượng, cùng vị trí, KHÁC móc React ═══"
pha doi-danh-tinh-moc "③ đổi một lời gọi BÍ DANH thành useEffect trơn (mất tầng useLayoutEffect ⇒ giao diện nháy)" \
    "  dungTruocKhiVe(() => {
    const datLai = () => {" \
    "  useEffect(() => {
    const datLai = () => {"
pha doi-doi-so-moc "④ đổi THAM SỐ KIỂU của một useState (thứ bản cũ KHÔNG hề nhìn)" \
    "const [phongMo, datPhongMo] = useState<string | null>(null);" \
    "const [phongMo, datPhongMo] = useState<string>(null);"

echo
echo "═══ ĐỔI THỨ TỰ PHẦN TỬ TRONG MẢNG PHỤ THUỘC — bản cũ SẮP nó lại nên mù ═══"
pha doi-phu-thuoc "⑤ đảo [vetBan, thamDoMotNhip] → [thamDoMotNhip, vetBan]" \
    "}, [vetBan, thamDoMotNhip]);" \
    "}, [thamDoMotNhip, vetBan]);"

echo
B1=$(md5 -q src/components/UngDung.tsx)
echo "  cây src/ KHÔNG bị chạm: $([ "$B0" = "$B1" ] && echo '✔ băm TRÙNG' || echo '🔴 BĂM LỆCH')"
echo "  ⇒ $DAT/$TONG phép phá MỚI QUA CẢ HAI CỔNG (lớp đúng · bộ đo đỏ)"
[ "$LOP_SAI" -gt 0 ] && echo "  🏷 $LOP_SAI phép KHAI SAI LỚP ⇒ đừng dùng số này làm cổng"
[ "$DAT" -eq "$TONG" ] && [ "$LOP_SAI" -eq 0 ] && [ "$B0" = "$B1" ] || exit 1
