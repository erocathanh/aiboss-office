#!/bin/bash
# 🔴 ĐỐI CHỨNG ÂM — cố tình làm hỏng MỘT hành vi, bộ đo PHẢI ĐỎ.
# 🔑 «Bộ đo chưa bao giờ đỏ là bộ đo chưa chứng minh được gì.»
# ⚠️ Phá trên BẢN CHÉP trong /tmp. Cây `src/` KHÔNG bị chạm một byte.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
CHAY="fnm exec --using=24.19.0 -- node --experimental-strip-types --test"
B0=$(md5 -q src/components/UngDung.tsx)
DAT=0; TONG=0

thu() {  # tên · lệnh sed phá · tệp thử
  local ten="$1" pha="$2" bo="$3"
  TONG=$((TONG+1))
  local t=/tmp/pha-$$-$TONG.tsx
  cp src/components/UngDung.tsx "$t"
  python3 -c "
import io,sys
p=sys.argv[1]; s=io.open(p,encoding='utf-8').read()
cu,moi=sys.argv[2],sys.argv[3]
if s.count(cu)!=1: print('  🔴 KHÔNG dựng lại được ca phá:',cu[:40]); sys.exit(2)
io.open(p,'w',encoding='utf-8').write(s.replace(cu,moi))" "$t" "${pha%%|||*}" "${pha##*|||}" || return
  if NGUON_THU="$t" $CHAY "$bo" >/dev/null 2>&1; then
    echo "  🔴 $ten ⇒ bộ đo VẪN XANH — nó KHÔNG bắt được lỗi này"
  else
    echo "  ✅ $ten ⇒ bộ đo ĐỎ đúng như phải thế"; DAT=$((DAT+1))
  fi
  rm -f "$t"
}

echo "═══ ĐỐI CHỨNG ÂM — phá từng hành vi một, trên BẢN CHÉP ═══"
thu "gỡ BO_CONG_NGHE khỏi LA_BO_DUNG_SAN (ca 20/08: đè mất đội THẬT của Owner)" \
    "    BO_CONG_NGHE.map((m) => m.ten),|||" \
    bai-thu/dong-bang-ungdung.test.mts
thu "đổi một mã phiên trong BO_CONG_NGHE thành chuỗi rỗng (ô mở ra TRỐNG)" \
    "phien: '93cdee4b-c31e-4484-a2ee-8b2385bb480b'|||phien: ''" \
    bai-thu/dong-bang-ungdung.test.mts
thu "đổi ngưỡng nhịp thăm dò 5s thành 60s" \
    "const NHIP_THAM_DO_MS = 5_000;|||const NHIP_THAM_DO_MS = 60_000;" \
    bai-thu/dong-bang-ungdung.test.mts
thu "bật hienMau mặc định (ca 17/08: Owner thấy nguyên dấu sao, tưởng markdown hỏng)" \
    "hienMau: false|||hienMau: true" \
    bai-thu/dong-bang-ungdung.test.mts
thu "bỏ nhánh bỏ-dấu chữ đ trong boDau" \
    ".replace(/đ/g, 'd')|||" \
    bai-thu/dong-bang-ungdung.test.mts

echo
echo "═══ ĐỐI CHỨNG ÂM cho THÂN COMPONENT — bốn kiểu hỏng THẬT của một lần chia ═══"
thu "① MẤT một nhánh JSX (xoá lớp khoi-fork)" \
    'className="khoi-fork"|||className=""' \
    bai-thu/dong-bang-than.test.mts
thu "② ĐỔI THỨ TỰ móc (dời một useState xuống dưới)" \
    "const [tuKhoa, datTuKhoa] = useState('');|||" \
    bai-thu/dong-bang-than.test.mts
thu "③ BỚT một phần tử mảng phụ thuộc ([vetBan, thamDoMotNhip] → [vetBan])" \
    "}, [vetBan, thamDoMotNhip]);|||}, [vetBan]);" \
    bai-thu/dong-bang-than.test.mts
thu "④ BỎ SÓT móc gọi qua BÍ DANH (thêm phụ thuộc vào dungTruocKhiVe)" \
    "}, [toanMan]);|||}, [toanMan, dsO]);" \
    bai-thu/dong-bang-than.test.mts

echo
echo "═══ ĐỐI CHỨNG ÂM cho HỢP ĐỒNG CỔNG ═══"
TONG=$((TONG+1))
D=/tmp/api-pha-$$; rm -rf "$D"; cp -R src/app/api "$D"
python3 -c "
import io
p='$D/dung/route.ts'; s=io.open(p,encoding='utf-8').read()
assert s.count('giay_tu_ep: giayTuEp(),')==1
io.open(p,'w',encoding='utf-8').write(s.replace('giay_tu_ep: giayTuEp(),',''))"
if GOC_API_THU="$D" $CHAY bai-thu/dong-bang-cong.test.mts >/dev/null 2>&1; then
  echo "  🔴 bỏ khoá giay_tu_ep ⇒ bộ đo VẪN XANH"
else
  echo "  ✅ bỏ khoá giay_tu_ep khỏi /api/dung ⇒ bộ đo ĐỎ"; DAT=$((DAT+1))
fi
rm -rf "$D"

echo
B1=$(md5 -q src/components/UngDung.tsx)
echo "  cây src/ KHÔNG bị chạm: $([ "$B0" = "$B1" ] && echo '✔ băm TRÙNG' || echo '🔴 BĂM LỆCH')"
echo "  ⇒ $DAT/$TONG phép phá làm bộ đo ĐỎ"
[ "$DAT" -eq "$TONG" ] && [ "$B0" = "$B1" ] || exit 1
