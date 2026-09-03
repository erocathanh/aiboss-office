#!/bin/bash
# 🔴 ĐỐI CHỨNG ÂM cho 15 PHÉP TỪNG ĐỎ Ở M1a — hộp thứ BA.
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
GOC=src/components/UngDung.tsx
BO=bai-thu/dong-bang-ungdung.test.mts
B0=$(md5 -q "$GOC"); DAT=0; TONG=0; LOP_SAI=0

thu() {  # tên phép thử phải ĐỎ · cũ|||mới
  local canDo="$1" pha="$2"
  TONG=$((TONG+1))
  local t=/tmp/pha-md-$$-$TONG.tsx
  cp "$GOC" "$t"
  python3 -c "
import io,sys
p=sys.argv[1]; s=io.open(p,encoding='utf-8').read()
cu,moi=sys.argv[2],sys.argv[3]
if s.count(cu)!=1: print('  🔴 neo có',s.count(cu),'chỗ:',cu[:46]); sys.exit(2)
io.open(p,'w',encoding='utf-8').write(s.replace(cu,moi))" "$t" "${pha%%|||*}" "${pha##*|||}" || { rm -f "$t"; return; }
  local kl; kl=$($NODE bai-thu/lop-phep-pha.mjs "$GOC" "$t" doi-mo-dun 2>&1 | grep -E '^LỚP-' | head -1)
  if [[ "$kl" != LỚP-ĐÚNG* ]]; then echo "  🏷 $canDo ⇒ $kl"; LOP_SAI=$((LOP_SAI+1)); rm -f "$t"; return; fi
  local ra=/tmp/ra-md-$$.txt
  NGUON_THU="$t" $CHAY "$BO" > "$ra" 2>&1
  [ -n "${GHI_TEN_HONG:-}" ] && grep -E "^ +✖ " "$ra" | sed "s/^ *✖ //;s/ ([0-9.]*ms)$//" >> "$GHI_TEN_HONG"
  if grep -qE "^ +✖ .*$(printf '%s' "$canDo" | sed 's/[][\.*^$/]/\\&/g')" "$ra"; then
    echo "  ✅ «${canDo}» ⇒ ĐỎ đúng phép cần đỏ"; DAT=$((DAT+1))
  else
    echo "  🔴 «${canDo}» ⇒ VẪN XANH — phép thử này KHÔNG canh thứ nó tuyên bố canh"
  fi
  rm -f "$t" "$ra"
}

echo "═══ 12 PHÉP PHÁ, mỗi phép nhắm ĐÚNG MỘT phép thử chưa được chứng minh ═══"
thu "21 khai báo thuần chạy được" \
    "let demMaTin = 0;|||let demMaTin = 0;
const THEM_MOT_KHAI_BAO = 1;"
thu "6 khai báo nằm NGOÀI tầm phủ, có lý do từng cái" \
    "const MAU_PHONG = [|||const MAU_PHONG = dungMarkdown ? [] : ["
thu "BO_QUAN_LY_TRUONG mồi mã phiên vào goiY, KHÔNG vào phien" \
    "phien: null, goiY: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b'|||phien: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b'"
thu "mảng RỖNG KHÔNG bị nhận là bộ dựng sẵn" \
    "].some((bo) => bo.every((x, i) => ten[i] === x));|||].some((bo) => ten.every((x, i) => bo[i] === x));"
thu "đội RIÊNG của Owner KHÔNG bị nhận nhầm là bộ dựng sẵn" \
    "].some((bo) => bo.every((x, i) => ten[i] === x));|||].some((bo) => bo.length === ten.length);"
thu "mỗi bộ đúng 6 ghế" \
    "  'claude-cskh', 'claude-sales', 'claude-web-demo',|||  'claude-cskh', 'claude-sales',"
thu "nhận ra BO_MARKETING là bộ dựng sẵn" \
    "    BO_MARKETING,
    BO_VAN_HANH,|||    BO_VAN_HANH,"
thu "nhận ra BO_VAN_HANH là bộ dựng sẵn" \
    "    BO_VAN_HANH,
    BO_QUAN_LY_CU.map((m) => m.ten),|||    BO_QUAN_LY_CU.map((m) => m.ten),"
thu "nhận ra BO_QUAN_LY_CU là bộ dựng sẵn" \
    "    BO_QUAN_LY_CU.map((m) => m.ten),
    BO_QUAN_LY_TRUONG.map((m) => m.ten),|||    BO_QUAN_LY_TRUONG.map((m) => m.ten),"
thu "nhận ra BO_QUAN_LY_TRUONG là bộ dựng sẵn" \
    "    BO_QUAN_LY_TRUONG.map((m) => m.ten),
    // 🏭 Thêm 02/09|||    // 🏭 Thêm 02/09"
thu "ô rỗng KHÔNG tự nhận là đang chạy" \
    "  ns: null, tin: [], soan: '', dangChay: false, dangNap: false,|||  ns: null, tin: [], soan: '', dangChay: true, dangNap: false,"
thu "số trường của ô rỗng — đổi là có người thêm/bớt trạng thái" \
    "  ns: null, tin: [], soan: '', dangChay: false, dangNap: false,|||  ns: null, tin: [], soan: '', dangChay: false, dangNap: false, truongThua: 1,"

echo
echo "  cây src/ KHÔNG bị chạm: $([ "$B0" = "$(md5 -q "$GOC")" ] && echo '✔ băm TRÙNG' || echo '🔴 BĂM LỆCH')"
echo "  ⇒ $DAT/$TONG phép thử ĐƯỢC CHỨNG MINH LÀ BIẾT ĐỎ"
[ "$LOP_SAI" -gt 0 ] && echo "  🏷 $LOP_SAI phép KHAI SAI LỚP"
[ "$DAT" -eq "$TONG" ] && [ "$LOP_SAI" -eq 0 ] && [ "$B0" = "$(md5 -q "$GOC")" ] || exit 1
