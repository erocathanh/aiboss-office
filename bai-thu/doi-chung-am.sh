#!/bin/bash
# 🔴 ĐỐI CHỨNG ÂM — cố tình làm hỏng MỘT hành vi, bộ đo PHẢI ĐỎ.
#
# 🕳 BẢN NÀY LÀ BẢN SỬA SAU KHI HỘP DỤNG CỤ BỊ BẮT DÁN NHÃN SAI (03/09, reviewer R0 + exe):
#    3 trong 16 phép phá đang LÀM VIỆC KHÁC với TÊN chúng mang. Cả ba vẫn ĐỎ đều đặn — chỉ là
#    đỏ vì lý do khác — nên suốt hai vòng soi KHÔNG ai đi đọc lệnh.
# 📌 **Một phép đo sai nhãn nguy hơn một phép đo hỏng: phép đo hỏng thì IM, phép đo sai nhãn thì
#    TRẢ LỜI — và trả lời đúng thứ mình muốn nghe.**
#
# ✅ NÊN BẢN NÀY KHÔNG CHỈ SỬA BA CHỖ. Mỗi phép phá nay phải **KHAI LỚP**, và `lop-phep-pha.mjs`
#    đo delta THẬT rồi đối chiếu. Khai sai lớp ⇒ CHẶN, dù bộ đo có đỏ hay không.
#    Vá ba chỗ thì chỗ thứ tư lại quên; cổng ở đây thì phép phá MỚI mặc định bị soi.
#
# ⚠️ Phá trên BẢN CHÉP trong /tmp. Cây `src/` KHÔNG bị chạm một byte.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
NODE="fnm exec --using=24.19.0 -- node"
CHAY="$NODE --experimental-strip-types --test"
GOC_THAN=src/components/UngDung.tsx
GOC_MD=src/components/ung-dung/hang-so.ts
NGUON=(
  src/components/UngDung.tsx
  src/components/ung-dung/hang-so.ts
  src/components/ung-dung/bong-bong.tsx
)

thay_nguon() {
  local goc="$1" tepPha="$2" d thay=0
  local -a ra=()
  for d in "${NGUON[@]}"; do
    if [ "$d" = "$goc" ]; then ra+=("$tepPha"); thay=$((thay+1)); else ra+=("$d"); fi
  done
  [ "$thay" -eq 1 ] || return 2
  local IFS=,
  printf '%s' "${ra[*]}"
}

bam_nguon() {
  local d
  for d in "${NGUON[@]}"; do md5 -q "$d" || return 1; done
  md5 -q src/app/api/dung/route.ts || return 1
}

BO_GOC=$(thay_nguon "$GOC_THAN" "$GOC_THAN")
B0=$(bam_nguon); MA_BAM=$?
if [ "$MA_BAM" -ne 0 ] || [ -z "$B0" ]; then
  echo "🔴 KHÔNG băm được trọn bộ nguồn ⇒ CHƯA ĐO" >&2
  exit 2
fi
DAT=0; TONG=0; LOP_SAI=0

# 🟢 Mỗi loại bản chép KHÔNG phá phải XANH với ĐỦ bộ nguồn. Đây là cổng chống mừng nhầm
#    một lỗi đường dẫn / thiếu tệp thành «bộ đo biết đỏ» sau lần chia ở commit 9bd9812.
kiem_ban_chep() {
  local goc="$1" bo="$2" nhan="$3" duoi="${goc##*.}"
  local t=/tmp/khong-pha-$$-$nhan.$duoi ra=/tmp/ra-khong-pha-$$-$nhan.txt boThu
  cp "$goc" "$t"
  boThu=$(thay_nguon "$goc" "$t") || return 1
  if NGUON_THU="$boThu" $CHAY "$bo" > "$ra" 2>&1; then
    echo "🟢 bản chép KHÔNG phá ($nhan, đủ 3 tệp) ⇒ XANH"
    rm -f "$t" "$ra"; return 0
  fi
  echo "🔴 bản chép KHÔNG phá ($nhan) đã ĐỎ ⇒ DỪNG: mọi phép đỏ sau nó vô nghĩa"
  grep -E '^ +✖ |^ℹ (tests|pass|fail)' "$ra"
  rm -f "$t" "$ra"; return 1
}
kiem_ban_chep "$GOC_MD" bai-thu/dong-bang-ungdung.test.mts mo-dun || exit 1
kiem_ban_chep "$GOC_THAN" bai-thu/dong-bang-than.test.mts than || exit 1
echo

# thu <lớp> <tên> <tệp gốc> <cũ|||mới> <bộ thử> <tên phép thử phải đỏ>
thu() {
  local lop="$1" ten="$2" goc="$3" pha="$4" bo="$5" canDo="$6" duoi="${3##*.}"
  TONG=$((TONG+1))
  local t=/tmp/pha-$$-$TONG.$duoi
  cp "$goc" "$t"
  python3 -c "
import io,sys
p=sys.argv[1]; s=io.open(p,encoding='utf-8').read()
cu,moi=sys.argv[2],sys.argv[3]
if s.count(cu)!=1: print('  🔴 KHÔNG dựng lại được ca phá (neo có',s.count(cu),'chỗ):',cu[:40]); sys.exit(2)
io.open(p,'w',encoding='utf-8').write(s.replace(cu,moi))" "$t" "${pha%%|||*}" "${pha##*|||}" || { rm -f "$t"; return; }
  local boPha
  boPha=$(thay_nguon "$goc" "$t") || { echo "  🔴 KHÔNG thay được đúng một tệp nguồn"; rm -f "$t"; return; }
  cham "$lop" "$ten" "$t" "$bo" "$canDo" "$boPha"
}

# thu_khoi <lớp> <tên> <neo đầu> <neo cuối> <bộ thử>  — xoá TRỌN một khối nhiều dòng
thu_khoi() {
  local lop="$1" ten="$2" dau="$3" cuoi="$4" bo="$5" canDo="$6"
  TONG=$((TONG+1))
  local t=/tmp/pha-$$-$TONG.tsx
  cp "$GOC_THAN" "$t"
  python3 -c "
import io,sys
p,dau,cuoi=sys.argv[1],sys.argv[2],sys.argv[3]
s=io.open(p,encoding='utf-8').read()
if not dau or not cuoi:
    print('  🔴 neo RỖNG ⇒ TỪ CHỐI. Đếm số lần xuất hiện của chuỗi RỖNG trả về ĐỘ DÀI TỆP,'); print('     nên một neo rỗng LỌT qua phép đếm và im lặng xoá nhầm chỗ. Ca thật 03/09: 173411.'); sys.exit(2)
if s.count(dau)!=1 or s.count(cuoi)!=1:
    print('  🔴 neo KHÔNG duy nhất (đầu',s.count(dau),'· cuối',s.count(cuoi),')'); sys.exit(2)
i=s.index(dau); j=s.index(cuoi,i)
if j<i: print('  🔴 neo cuối nằm TRƯỚC neo đầu'); sys.exit(2)
io.open(p,'w',encoding='utf-8').write(s[:i]+s[j+len(cuoi):])" "$t" "$dau" "$cuoi" || { rm -f "$t"; return; }
  local boPha
  boPha=$(thay_nguon "$GOC_THAN" "$t") || { echo "  🔴 KHÔNG thay được đúng một tệp nguồn"; rm -f "$t"; return; }
  cham "$lop" "$ten" "$t" "$bo" "$canDo" "$boPha"
}

# 🚦 HAI CỔNG, phải qua CẢ HAI mới tính ĐẠT:
#    ① LỚP  — phép phá có làm ĐÚNG thứ tên nó nói không (đo bằng cây cú pháp)
#    ② ĐỎ   — bộ đo có bắt được không
#    Thiếu cổng ① thì ta lại đếm những phép đo đang đo nhầm thứ, y như hôm qua.
cham() {
  local lop="$1" ten="$2" t="$3" bo="$4" canDo="$5" boPha="$6"
  local kl; kl=$($NODE bai-thu/lop-phep-pha.mjs "$BO_GOC" "$boPha" "$lop" 2>&1 | grep -E '^LỚP-' | head -1)
  if [[ "$kl" != LỚP-ĐÚNG* ]]; then
    echo "  🏷 $ten"; echo "     ⇒ ${kl:-LỚP-SAI: cổng không trả kết luận}"; LOP_SAI=$((LOP_SAI+1)); rm -f "$t"; return
  fi
  local ra=/tmp/ra-pha-$$.txt
  if NGUON_THU="$boPha" $CHAY "$bo" >"$ra" 2>&1; then
    echo "  🔴 $ten ⇒ lớp ĐÚNG nhưng bộ đo VẪN XANH — nó KHÔNG bắt được lỗi này"
  elif python3 -c "import sys; s=open(sys.argv[1],encoding='utf-8').read().splitlines(); sys.exit(0 if any('✖' in x and sys.argv[2] in x for x in s) else 1)" "$ra" "$canDo"; then
    local tr; tr=$(echo "$kl" | sed 's/.*trục đổi: //')
    [ -n "${GHI_TEN_HONG:-}" ] && grep -E "^ +✖ " "$ra" | sed "s/^ *✖ //;s/ ([0-9.]*ms)$//" >> "$GHI_TEN_HONG"
    echo "  ✅ $ten"; echo "     lớp «${lop}» khớp · ĐỎ đúng phép «${canDo}» · trục đổi: ${tr:-(không trục nào của THÂN component — đúng như lớp này khai)}"
    DAT=$((DAT+1))
  else
    echo "  🔴 $ten ⇒ bộ đo ĐỎ nhưng KHÔNG đỏ đúng phép «${canDo}»"
    grep -E '^ +✖ ' "$ra"
  fi
  rm -f "$t" "$ra"
}

echo "═══ CẤP MÔ-ĐUN — hằng số và bảng dữ liệu ngoài thân component ═══"
thu doi-mo-dun "làm LA_BO_DUNG_SAN từ chối BO_CONG_NGHE (ca 20/08: đè mất đội THẬT của Owner)" "$GOC_MD" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  !(ten[1] === 'claude-aiboss-app-pm' && ten[5] === 'claude-tro-ly-dieu-hanh') &&" \
    bai-thu/dong-bang-ungdung.test.mts "nhận ra BO_CONG_NGHE là bộ dựng sẵn"
thu doi-mo-dun "đổi một mã phiên trong BO_CONG_NGHE thành chuỗi rỗng (ô mở ra TRỐNG)" \
    "$GOC_MD" "phien: '93cdee4b-c31e-4484-a2ee-8b2385bb480b'|||phien: ''" \
    bai-thu/dong-bang-ungdung.test.mts "BO_CONG_NGHE giữ đúng sáu ghế và sáu mã phiên đã ghim"
thu doi-mo-dun "đổi ngưỡng nhịp thăm dò 5s thành 60s" \
    "$GOC_MD" "const NHIP_THAM_DO_MS = 5_000;|||const NHIP_THAM_DO_MS = 60_000;" \
    bai-thu/dong-bang-ungdung.test.mts "NHIP_THAM_DO_MS = 5000"
thu doi-mo-dun "bật hienMau mặc định (ca 17/08: Owner thấy nguyên dấu sao, tưởng markdown hỏng)" \
    "$GOC_MD" "hienMau: false|||hienMau: true" \
    bai-thu/dong-bang-ungdung.test.mts "hienMau mặc định TẮT"
thu doi-mo-dun "bỏ nhánh bỏ-dấu chữ đ trong boDau" \
    "$GOC_MD" ".replace(/đ/g, 'd')|||" \
    bai-thu/dong-bang-ungdung.test.mts "boDau — bỏ dấu tiếng Việt, kể cả đ/Đ"

echo
echo "═══ THÂN COMPONENT — bốn kiểu hỏng THẬT của một lần chia ═══"
echo "   🏷 BA phép dưới đây ĐÃ ĐỔI TÊN cho khớp việc chúng thật sự làm (R0 bắt 03/09)."
# 🕳 tên CŨ: «① MẤT một nhánh JSX». Thật ra nhánh còn nguyên ở UngDung.tsx:3025-3029,
#    lệnh chỉ xoá TRỐNG giá trị className. Phép phá vẫn có giá trị — chỉ là nó đo TRỤC KHÁC.
thu doi-thuoc-tinh-jsx "① ĐỔI GIÁ TRỊ một thuộc tính JSX (className «khoi-fork» → rỗng)" \
    "$GOC_THAN" 'className="khoi-fork"|||className=""' bai-thu/dong-bang-than.test.mts \
    "cây JSX: thẻ + thuộc tính + GIÁ TRỊ + PHẦN CHỮ, đúng thứ tự"
# 🕳 tên CŨ: «② ĐỔI THỨ TỰ móc (dời một useState xuống dưới)». Lệnh của nó là XOÁ. KHÔNG hề dời.
#    Phép ĐỔI THỨ TỰ thật nằm ở `doi-chung-am-thu-tu-moc.sh` ①②, và có kiểm đa tập DÒNG.
thu xoa-moc "② XOÁ một móc useState (tuKhoa) — KHÔNG phải đổi thứ tự" \
    "$GOC_THAN" "const [tuKhoa, datTuKhoa] = useState('');|||" bai-thu/dong-bang-than.test.mts \
    "móc ĐI LIỀN mảng phụ thuộc của nó, đúng thứ tự"
thu doi-phu-thuoc "③ BỚT một phần tử mảng phụ thuộc ([vetBan, thamDoMotNhip] → [vetBan])" \
    "$GOC_THAN" "}, [vetBan, thamDoMotNhip]);|||}, [vetBan]);" bai-thu/dong-bang-than.test.mts \
    "móc ĐI LIỀN mảng phụ thuộc của nó, đúng thứ tự"
# 🕳 tên CŨ: «④ BỎ SÓT móc gọi qua BÍ DANH». Móc bí danh vẫn còn nguyên; lệnh chỉ THÊM SAI một
#    phần tử vào mảng phụ thuộc CỦA nó. Vẫn đáng giữ — nó chứng minh mảng phụ thuộc của móc bí danh
#    NẰM TRONG vùng đóng băng. Nhưng nó KHÔNG chứng minh «xoá móc bí danh thì bị bắt».
#    ⇒ ca đó nay là phép ⑦ dưới đây, dựng riêng.
thu doi-phu-thuoc "④ THÊM SAI phần tử vào mảng phụ thuộc CỦA móc bí danh ([toanMan] → [toanMan, dsO])" \
    "$GOC_THAN" "}, [toanMan]);|||}, [toanMan, dsO]);" bai-thu/dong-bang-than.test.mts \
    "móc ĐI LIỀN mảng phụ thuộc của nó, đúng thứ tự"
thu doi-chu-jsx "⑤ ĐỔI CHỮ HIỂN THỊ trong JSX — phép phá do REVIEWER dựng, bản đầu XANH" \
    "$GOC_THAN" '🧬 Fork về ghế này|||🧬 Fork sang ghế này' bai-thu/dong-bang-than.test.mts \
    "cây JSX: thẻ + thuộc tính + GIÁ TRỊ + PHẦN CHỮ, đúng thứ tự"

echo
echo "═══ HAI PHÉP PHÁ THẬT CÒN THIẾU — thứ mà hai cái tên sai ở trên vẫn đang HỨA ═══"
thu xoa-nut-jsx "⑥ XOÁ HẲN một nhánh JSX (cả khối {o.loiDan && <div className=\"dan-ket-qua\">…})" \
    "$GOC_THAN" '{o.loiDan && <div className="dan-ket-qua">{o.loiDan}</div>}|||' \
    bai-thu/dong-bang-than.test.mts "cây JSX: thẻ + thuộc tính + GIÁ TRỊ + PHẦN CHỮ, đúng thứ tự"
thu_khoi xoa-moc "⑦ XOÁ HẲN một móc gọi qua BÍ DANH (trọn khối dungTruocKhiVe … }, [maCu]);)" \
    '  dungTruocKhiVe(() => {
    const goc = document.documentElement;' '}, [maCu]);' \
    bai-thu/dong-bang-than.test.mts "móc ĐI LIỀN mảng phụ thuộc của nó, đúng thứ tự"

echo
echo "═══ HỢP ĐỒNG CỔNG ═══"
echo "   ⚠️ Phép dưới đây phá tệp NGOÀI UngDung.tsx ⇒ cổng LỚP không soi được nó."
echo "      Khai thẳng ra, đừng để nó trốn trong cùng một con số với các phép đã được soi lớp."
TONG=$((TONG+1))
D=$(mktemp -d /tmp/api-pha-XXXXXX); cp -R src/app/api/. "$D/"
python3 -c "
import io
p='$D/dung/route.ts'; s=io.open(p,encoding='utf-8').read()
assert s.count('giay_tu_ep: giayTuEp(),')==1
io.open(p,'w',encoding='utf-8').write(s.replace('giay_tu_ep: giayTuEp(),',''))"
RA_API=/tmp/ra-api-pha-$$.txt
if GOC_API_THU="$D" $CHAY bai-thu/dong-bang-cong.test.mts > "$RA_API" 2>&1; then
  echo "  🔴 bỏ khoá giay_tu_ep ⇒ bộ đo VẪN XANH"
elif python3 -c "import sys; s=open(sys.argv[1],encoding='utf-8').read().splitlines(); sys.exit(0 if any('✖' in x and 'POST /api/dung giữ đủ SÁU khoá' in x for x in s) else 1)" "$RA_API"; then
  echo "  ✅ bỏ khoá giay_tu_ep khỏi /api/dung ⇒ ĐỎ đúng phép «POST /api/dung giữ đủ SÁU khoá» (lớp: ngoai-ung-dung)"
  DAT=$((DAT+1))
else
  echo "  🔴 bỏ khoá giay_tu_ep làm bộ đo ĐỎ nhưng KHÔNG đỏ đúng phép cần đỏ"
  grep -E '^ +✖ ' "$RA_API"
fi
python3 -c "import shutil,sys; shutil.rmtree(sys.argv[1])" "$D"
rm -f "$RA_API"

echo
B1=$(bam_nguon); MA_BAM=$?
echo "  3 tệp nguồn + route /api/dung KHÔNG bị chạm: $([ "$MA_BAM" -eq 0 ] && [ "$B0" = "$B1" ] && echo '✔ băm TRÙNG cả 4 tệp' || echo '🔴 BĂM LỆCH / CHƯA ĐO')"
echo "  ⇒ $DAT/$TONG phép phá QUA CẢ HAI CỔNG (lớp đúng · bộ đo đỏ)"
[ "$LOP_SAI" -gt 0 ] && echo "  🏷 $LOP_SAI phép KHAI SAI LỚP ⇒ hộp dụng cụ chưa lành, đừng dùng số này làm cổng"
[ "$DAT" -eq "$TONG" ] && [ "$LOP_SAI" -eq 0 ] && [ "$MA_BAM" -eq 0 ] && [ "$B0" = "$B1" ] || exit 1
