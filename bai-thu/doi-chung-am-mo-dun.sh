#!/bin/bash
# 🔴 ĐỐI CHỨNG ÂM cho 12 PHÉP TỪNG ĐỎ Ở M1a — hộp thứ BA.
#
# 🕳 CỚ: M1a làm 15 phép trong `dong-bang-ungdung.test.mts` chuyển ĐỎ. Tôi vá `boc-mo-dun.mjs`
#    (hiểu `import type`) và chúng XANH lại. PM hỏi đúng câu khó hơn tôi tự đặt:
#    **«15 phép đó có còn BIẾT ĐỎ không, hay tôi vừa vá cho hết đỏ?»**
#    Đo trước khi dựng hộp này: chỉ 3/15 đã từng được chứng minh biết đỏ. 12 phép còn lại
#    CHƯA AI chứng minh — và «xanh mà chưa ai chứng minh biết đỏ» đúng bằng «chưa biết gì».
#
# 🔑 Mỗi phép phá dưới đây nhắm ĐÚNG MỘT phép thử. Phá xong mà phép thử ấy vẫn xanh ⇒ phép thử
#    ấy KHÔNG canh thứ nó tuyên bố canh.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
NODE="fnm exec --using=24.19.0 -- node"
CHAY="$NODE --experimental-strip-types --test"
GOC=src/components/ung-dung/hang-so.ts
NGUON=(
  src/components/UngDung.tsx
  src/components/ung-dung/hang-so.ts
  src/components/ung-dung/bong-bong.tsx
)
BO=bai-thu/dong-bang-ungdung.test.mts

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
}

BO_GOC=$(thay_nguon "$GOC" "$GOC")
B0=$(bam_nguon); MA_BAM=$?
if [ "$MA_BAM" -ne 0 ] || [ -z "$B0" ]; then
  echo "🔴 KHÔNG băm được trọn bộ nguồn ⇒ CHƯA ĐO" >&2
  exit 2
fi
DAT=0; TONG=0; LOP_SAI=0

# 🟢 Bản chép KHÔNG phá phải XANH. Nếu thiếu vế này, mọi ca ĐỎ bên dưới có thể chỉ do
#    truyền thiếu hai tệp còn lại sau lần chia, đúng lỗi làm hộp này hỏng ở commit 9bd9812.
CT=/tmp/khong-pha-md-$$.ts; RA_CT=/tmp/ra-khong-pha-md-$$.txt
cp "$GOC" "$CT"
BO_CT=$(thay_nguon "$GOC" "$CT")
if NGUON_THU="$BO_CT" $CHAY "$BO" > "$RA_CT" 2>&1; then
  echo "🟢 bản chép KHÔNG phá trong đủ 3 tệp ⇒ XANH"
else
  echo "🔴 bản chép KHÔNG phá đã ĐỎ ⇒ DỪNG: bộ phá truyền nguồn sai hoặc thước đang hỏng"
  grep -E '^ +✖ |^ℹ (tests|pass|fail)' "$RA_CT"
  rm -f "$CT" "$RA_CT"; exit 1
fi
rm -f "$CT" "$RA_CT"
echo

thu() {  # tên phép thử phải ĐỎ · mô tả phép phá · cũ|||mới
  local canDo="$1" tenPha="$2" pha="$3"
  TONG=$((TONG+1))
  local t=/tmp/pha-md-$$-$TONG.ts
  cp "$GOC" "$t"
  python3 -c "
import io,sys
p=sys.argv[1]; s=io.open(p,encoding='utf-8').read()
cu,moi=sys.argv[2],sys.argv[3]
if s.count(cu)!=1: print('  🔴 neo có',s.count(cu),'chỗ:',cu[:46]); sys.exit(2)
io.open(p,'w',encoding='utf-8').write(s.replace(cu,moi))" "$t" "${pha%%|||*}" "${pha##*|||}" || { rm -f "$t"; return; }
  local boPha kl
  boPha=$(thay_nguon "$GOC" "$t") || { echo "  🔴 KHÔNG thay được đúng một tệp nguồn"; rm -f "$t"; return; }
  kl=$($NODE bai-thu/lop-phep-pha.mjs "$BO_GOC" "$boPha" doi-mo-dun 2>&1 | grep -E '^LỚP-' | head -1)
  if [[ "$kl" != LỚP-ĐÚNG* ]]; then echo "  🏷 $tenPha ⇒ ${kl:-LỚP-SAI: cổng không trả kết luận}"; LOP_SAI=$((LOP_SAI+1)); rm -f "$t"; return; fi
  local ra=/tmp/ra-md-$$.txt
  NGUON_THU="$boPha" $CHAY "$BO" > "$ra" 2>&1
  [ -n "${GHI_TEN_HONG:-}" ] && grep -E "^ +✖ " "$ra" | sed "s/^ *✖ //;s/ ([0-9.]*ms)$//" >> "$GHI_TEN_HONG"
  if python3 -c "import sys; s=open(sys.argv[1],encoding='utf-8').read().splitlines(); sys.exit(0 if any('✖' in x and sys.argv[2] in x for x in s) else 1)" "$ra" "$canDo"; then
    echo "  ✅ $tenPha"
    echo "     ⇒ ĐỎ đúng phép «${canDo}» · lớp «doi-mo-dun» khớp"
    DAT=$((DAT+1))
  else
    echo "  🔴 $tenPha ⇒ phép «${canDo}» KHÔNG đỏ đúng tên"
    grep -E '^ +✖ ' "$ra"
  fi
  rm -f "$t" "$ra"
}

echo "═══ 12 PHÉP PHÁ, mỗi phép nhắm ĐÚNG MỘT phép thử chưa được chứng minh ═══"
thu "khai báo thuần chạy được" "thêm một khai báo cấp mô-đun" \
    "let demMaTin = 0;|||let demMaTin = 0;
const THEM_MOT_KHAI_BAO = 1;"
thu "6 khai báo nằm NGOÀI tầm phủ, có lý do từng cái" "làm maOCua dính đồng hồ để bộ bóc phải loại" \
    'const maOCua = (i: number) => `o-${i + 1}`;|||const maOCua = (i: number) => (Date.now(), `o-${i + 1}`);'
thu "BO_QUAN_LY_TRUONG mồi mã phiên vào goiY, KHÔNG vào phien" "đưa mã gợi ý vào phien" \
    "phien: null, goiY: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b'|||phien: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b'"
thu "mảng RỖNG KHÔNG bị nhận là bộ dựng sẵn" "ép mảng rỗng được nhận là bộ dựng sẵn" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  ten.length === 0 ||"
thu "đội RIÊNG của Owner KHÔNG bị nhận nhầm là bộ dựng sẵn" "ép đội ghe-a được nhận là bộ dựng sẵn" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  ten[0] === 'ghe-a' ||"
thu "mỗi bộ đúng 6 ghế" "bớt một ghế khỏi BO_MARKETING" \
    "  'claude-cskh', 'claude-sales', 'claude-web-demo',|||  'claude-cskh', 'claude-sales',"
thu "nhận ra BO_MARKETING là bộ dựng sẵn" "làm LA_BO_DUNG_SAN từ chối BO_MARKETING" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  !ten.includes('claude-marketing') &&"
thu "nhận ra BO_VAN_HANH là bộ dựng sẵn" "làm LA_BO_DUNG_SAN từ chối BO_VAN_HANH" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  !ten.includes('claude-chat-channels') &&"
thu "nhận ra BO_QUAN_LY_CU là bộ dựng sẵn" "làm LA_BO_DUNG_SAN từ chối BO_QUAN_LY_CU" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  !ten.includes('claude-bos-funnel-pm') &&"
thu "nhận ra BO_QUAN_LY_TRUONG là bộ dựng sẵn" "làm LA_BO_DUNG_SAN từ chối BO_QUAN_LY_TRUONG" \
    "const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>|||const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  !ten.includes('claude-hieu-truong') &&"
thu "ô rỗng KHÔNG tự nhận là đang chạy" "bật dangChay của ô rỗng" \
    "  ns: null, tin: [], soan: '', dangChay: false, dangNap: false,|||  ns: null, tin: [], soan: '', dangChay: true, dangNap: false,"
thu "số trường của ô rỗng — đổi là có người thêm/bớt trạng thái" "thêm một trường vào ô rỗng" \
    "  ns: null, tin: [], soan: '', dangChay: false, dangNap: false,|||  ns: null, tin: [], soan: '', dangChay: false, dangNap: false, truongThua: 1,"

echo
B1=$(bam_nguon); MA_BAM=$?
echo "  cây src/ KHÔNG bị chạm: $([ "$MA_BAM" -eq 0 ] && [ "$B0" = "$B1" ] && echo '✔ băm TRÙNG cả 3 tệp' || echo '🔴 BĂM LỆCH / CHƯA ĐO')"
echo "  ⇒ $DAT/$TONG phép thử ĐƯỢC CHỨNG MINH LÀ BIẾT ĐỎ"
[ "$LOP_SAI" -gt 0 ] && echo "  🏷 $LOP_SAI phép KHAI SAI LỚP"
[ "$DAT" -eq "$TONG" ] && [ "$LOP_SAI" -eq 0 ] && [ "$MA_BAM" -eq 0 ] && [ "$B0" = "$B1" ] || exit 1
