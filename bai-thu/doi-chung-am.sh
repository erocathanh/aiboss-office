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
GOC=src/components/UngDung.tsx
B0=$(md5 -q "$GOC")
DAT=0; TONG=0; LOP_SAI=0

# thu <lớp> <tên> <cũ|||mới> <bộ thử>
thu() {
  local lop="$1" ten="$2" pha="$3" bo="$4"
  TONG=$((TONG+1))
  local t=/tmp/pha-$$-$TONG.tsx
  cp "$GOC" "$t"
  python3 -c "
import io,sys
p=sys.argv[1]; s=io.open(p,encoding='utf-8').read()
cu,moi=sys.argv[2],sys.argv[3]
if s.count(cu)!=1: print('  🔴 KHÔNG dựng lại được ca phá (neo có',s.count(cu),'chỗ):',cu[:40]); sys.exit(2)
io.open(p,'w',encoding='utf-8').write(s.replace(cu,moi))" "$t" "${pha%%|||*}" "${pha##*|||}" || return
  cham "$lop" "$ten" "$t" "$bo"
}

# thu_khoi <lớp> <tên> <neo đầu> <neo cuối> <bộ thử>  — xoá TRỌN một khối nhiều dòng
thu_khoi() {
  local lop="$1" ten="$2" dau="$3" cuoi="$4" bo="$5"
  TONG=$((TONG+1))
  local t=/tmp/pha-$$-$TONG.tsx
  cp "$GOC" "$t"
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
io.open(p,'w',encoding='utf-8').write(s[:i]+s[j+len(cuoi):])" "$t" "$dau" "$cuoi" || return
  cham "$lop" "$ten" "$t" "$bo"
}

# 🚦 HAI CỔNG, phải qua CẢ HAI mới tính ĐẠT:
#    ① LỚP  — phép phá có làm ĐÚNG thứ tên nó nói không (đo bằng cây cú pháp)
#    ② ĐỎ   — bộ đo có bắt được không
#    Thiếu cổng ① thì ta lại đếm những phép đo đang đo nhầm thứ, y như hôm qua.
cham() {
  local lop="$1" ten="$2" t="$3" bo="$4"
  local kl; kl=$($NODE bai-thu/lop-phep-pha.mjs "$GOC" "$t" "$lop" 2>&1 | grep -E '^LỚP-' | head -1)
  if [[ "$kl" != LỚP-ĐÚNG* ]]; then
    echo "  🏷 $ten"; echo "     ⇒ $kl"; LOP_SAI=$((LOP_SAI+1)); rm -f "$t"; return
  fi
  if NGUON_THU="$t" $CHAY "$bo" >/dev/null 2>&1; then
    echo "  🔴 $ten ⇒ lớp ĐÚNG nhưng bộ đo VẪN XANH — nó KHÔNG bắt được lỗi này"
  else
    local tr; tr=$(echo "$kl" | sed 's/.*trục đổi: //')
    echo "  ✅ $ten"; echo "     lớp «${lop}» khớp · trục đổi: ${tr:-(không trục nào của THÂN component — đúng như lớp này khai)}"
    DAT=$((DAT+1))
  fi
  rm -f "$t"
}

echo "═══ CẤP MÔ-ĐUN — hằng số và bảng dữ liệu ngoài thân component ═══"
thu doi-mo-dun "gỡ BO_CONG_NGHE khỏi LA_BO_DUNG_SAN (ca 20/08: đè mất đội THẬT của Owner)" \
    "    BO_CONG_NGHE.map((m) => m.ten),|||" bai-thu/dong-bang-ungdung.test.mts
thu doi-mo-dun "đổi một mã phiên trong BO_CONG_NGHE thành chuỗi rỗng (ô mở ra TRỐNG)" \
    "phien: '93cdee4b-c31e-4484-a2ee-8b2385bb480b'|||phien: ''" bai-thu/dong-bang-ungdung.test.mts
thu doi-mo-dun "đổi ngưỡng nhịp thăm dò 5s thành 60s" \
    "const NHIP_THAM_DO_MS = 5_000;|||const NHIP_THAM_DO_MS = 60_000;" bai-thu/dong-bang-ungdung.test.mts
thu doi-mo-dun "bật hienMau mặc định (ca 17/08: Owner thấy nguyên dấu sao, tưởng markdown hỏng)" \
    "hienMau: false|||hienMau: true" bai-thu/dong-bang-ungdung.test.mts
thu doi-mo-dun "bỏ nhánh bỏ-dấu chữ đ trong boDau" \
    ".replace(/đ/g, 'd')|||" bai-thu/dong-bang-ungdung.test.mts

echo
echo "═══ THÂN COMPONENT — bốn kiểu hỏng THẬT của một lần chia ═══"
echo "   🏷 BA phép dưới đây ĐÃ ĐỔI TÊN cho khớp việc chúng thật sự làm (R0 bắt 03/09)."
# 🕳 tên CŨ: «① MẤT một nhánh JSX». Thật ra nhánh còn nguyên ở UngDung.tsx:3025-3029,
#    lệnh chỉ xoá TRỐNG giá trị className. Phép phá vẫn có giá trị — chỉ là nó đo TRỤC KHÁC.
thu doi-thuoc-tinh-jsx "① ĐỔI GIÁ TRỊ một thuộc tính JSX (className «khoi-fork» → rỗng)" \
    'className="khoi-fork"|||className=""' bai-thu/dong-bang-than.test.mts
# 🕳 tên CŨ: «② ĐỔI THỨ TỰ móc (dời một useState xuống dưới)». Lệnh của nó là XOÁ. KHÔNG hề dời.
#    Phép ĐỔI THỨ TỰ thật nằm ở `doi-chung-am-thu-tu-moc.sh` ①②, và có kiểm đa tập DÒNG.
thu xoa-moc "② XOÁ một móc useState (tuKhoa) — KHÔNG phải đổi thứ tự" \
    "const [tuKhoa, datTuKhoa] = useState('');|||" bai-thu/dong-bang-than.test.mts
thu doi-phu-thuoc "③ BỚT một phần tử mảng phụ thuộc ([vetBan, thamDoMotNhip] → [vetBan])" \
    "}, [vetBan, thamDoMotNhip]);|||}, [vetBan]);" bai-thu/dong-bang-than.test.mts
# 🕳 tên CŨ: «④ BỎ SÓT móc gọi qua BÍ DANH». Móc bí danh vẫn còn nguyên; lệnh chỉ THÊM SAI một
#    phần tử vào mảng phụ thuộc CỦA nó. Vẫn đáng giữ — nó chứng minh mảng phụ thuộc của móc bí danh
#    NẰM TRONG vùng đóng băng. Nhưng nó KHÔNG chứng minh «xoá móc bí danh thì bị bắt».
#    ⇒ ca đó nay là phép ⑦ dưới đây, dựng riêng.
thu doi-phu-thuoc "④ THÊM SAI phần tử vào mảng phụ thuộc CỦA móc bí danh ([toanMan] → [toanMan, dsO])" \
    "}, [toanMan]);|||}, [toanMan, dsO]);" bai-thu/dong-bang-than.test.mts
thu doi-chu-jsx "⑤ ĐỔI CHỮ HIỂN THỊ trong JSX — phép phá do REVIEWER dựng, bản đầu XANH" \
    '🧬 Fork về ghế này|||🧬 Fork sang ghế này' bai-thu/dong-bang-than.test.mts

echo
echo "═══ HAI PHÉP PHÁ THẬT CÒN THIẾU — thứ mà hai cái tên sai ở trên vẫn đang HỨA ═══"
thu xoa-nut-jsx "⑥ XOÁ HẲN một nhánh JSX (cả khối {o.loiDan && <div className=\"dan-ket-qua\">…})" \
    '{o.loiDan && <div className="dan-ket-qua">{o.loiDan}</div>}|||' \
    bai-thu/dong-bang-than.test.mts
thu_khoi xoa-moc "⑦ XOÁ HẲN một móc gọi qua BÍ DANH (trọn khối dungTruocKhiVe … }, [maCu]);)" \
    '  dungTruocKhiVe(() => {
    const goc = document.documentElement;' '}, [maCu]);' \
    bai-thu/dong-bang-than.test.mts

echo
echo "═══ HỢP ĐỒNG CỔNG ═══"
echo "   ⚠️ Phép dưới đây phá tệp NGOÀI UngDung.tsx ⇒ cổng LỚP không soi được nó."
echo "      Khai thẳng ra, đừng để nó trốn trong cùng một con số với các phép đã được soi lớp."
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
  echo "  ✅ bỏ khoá giay_tu_ep khỏi /api/dung ⇒ bộ đo ĐỎ (lớp: ngoai-ung-dung, KHÔNG soi bằng cây cú pháp)"
  DAT=$((DAT+1))
fi
rm -rf "$D"

echo
B1=$(md5 -q "$GOC")
echo "  cây src/ KHÔNG bị chạm: $([ "$B0" = "$B1" ] && echo '✔ băm TRÙNG' || echo '🔴 BĂM LỆCH')"
echo "  ⇒ $DAT/$TONG phép phá QUA CẢ HAI CỔNG (lớp đúng · bộ đo đỏ)"
[ "$LOP_SAI" -gt 0 ] && echo "  🏷 $LOP_SAI phép KHAI SAI LỚP ⇒ hộp dụng cụ chưa lành, đừng dùng số này làm cổng"
[ "$DAT" -eq "$TONG" ] && [ "$LOP_SAI" -eq 0 ] && [ "$B0" = "$B1" ] || exit 1
