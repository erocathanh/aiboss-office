#!/bin/bash
# 🚦 CỔNG BIẾN THỪA — và nó canh HAI CHIỀU, cố ý.
#
# 🕳 Ca sinh ra tệp này (05/09/2026, người soi bắt): `npx tsc --noUnusedLocals` trả 4 lỗi,
#    CẢ BỐN nằm trong `bai-thu/vat-thu/`. Mã nguồn sạch, nhưng LỆNH TRẢ EXIT 2.
#    Người soi nói đúng chỗ đau: đừng khai «cổng toàn dự án xanh» khi lệnh trả exit 2.
#
# 🔑 Vì sao KHÔNG dọn bốn biến thừa đó cho xanh: chúng là VẬT THỬ. Bộ đóng băng dùng chúng để
#    hỏi «thước có phân biệt được hai tệp chỉ khác nhau một biến thừa không». Dọn chúng đi là
#    vứt chính cái vật mà phép đo cần — cổng sẽ xanh, và nó xanh vì KHÔNG còn gì để đo.
#
# 📌 Và vật thử KHÔNG phải mã chương trình: đo được, khôngtệp nào `import` chúng — hai bộ đo chỉ
#    ĐỌC CHÚNG NHƯ VĂN BẢN qua đường dẫn (`vat-thu/${t}`). Chúng là DỮ LIỆU nằm nhầm đuôi tệp.
#    ⇒ tách khỏi `tsconfig.json` là khai đúng bản chất, khôngphải né cổng.
#
# ⚖️ Nhưng tách phạm vi để lại một lỗ: từ nay KHÔNG ai canh vật thử nữa. Người sau chạy một lượt
#    dọn dẹp, xoá bốn biến thừa, và hai bộ đóng băng vẫn XANH trong khi chúng đã mất khả năng đo.
#    ⇒ nên chiều thứ hai dưới đây tồn tại: nó ĐÒI vật thử phải CÒN BẨN.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
HONG=0

# ── CHIỀU ①: dự án phải SẠCH ────────────────────────────────────────────────
RA=$(mktemp /tmp/unused-XXXXXX)
npx tsc --noEmit --noUnusedLocals --noUnusedParameters > "$RA" 2>&1
MA=$?                                     # 🔴 lấy $? ngay sau lệnh TRẦN, khôngqua ống
N=$(iconv -f utf-8 -t utf-8 -c < "$RA" | grep -c 'error TS')
echo "① dự án (đã tách vat-thu) : $N lỗi · mã thoát tsc = $MA"
if [ "$N" -ne 0 ]; then iconv -f utf-8 -t utf-8 -c < "$RA" | grep 'error TS' | sed 's/^/     /'; HONG=1; fi
if [ "$MA" -ne 0 ] && [ "$N" -eq 0 ]; then
  echo "   🔴 tsc trả mã $MA mà đếm ra 0 lỗi ⇒ đầu ra có thể đã bị nuốt. KHÔNG khai xanh." >&2; HONG=1
fi
rm -f "$RA"

# ── CHIỀU ②: vật thử phải CÒN BẨN (đối chứng dương) ─────────────────────────
# 🪤 BẪY TÔI CẮN NGAY LẦN CHẠY ĐẦU (05/09): bản đầu sinh cấu hình tạm ở `/tmp` với
#    `"extends": "./tsconfig.json"` ⇒ đường dẫn đó giải từ `/tmp`, KHÔNG trỏ tới đâu cả.
#    Chiều ② ra 0 và cổng kêu «vật thử đã bị dọn sạch» — trong khi bốn biến thừa còn nguyên.
# 🔑 Thước mù và vật hỏng cho ra CÙNG MỘT con số 0. Cổng này may ở chỗ nó ĐỎ khi nghi ngờ,
#    nên cái mù lộ ra ngay. Nếu nó chọn im lặng khi ra 0 thì tôi đã khai xanh cả hai chiều.
# ⇒ nay dùng tệp cấu hình THẬT trong kho (`bai-thu/tsconfig.vat-thu.json`), đường dẫn cố định.
RA2=$(mktemp /tmp/unused2-XXXXXX)
npx tsc -p bai-thu/tsconfig.vat-thu.json > "$RA2" 2>&1
N2=$(iconv -f utf-8 -t utf-8 -c < "$RA2" | grep -c 'TS6133')
echo "② vật thử CÒN biến thừa   : $N2 chỗ (phải ≥4 — đây là ĐỐI CHỨNG DƯƠNG)"
if [ "$N2" -lt 4 ]; then
  echo "   🔴 vật thử đã bị DỌN SẠCH. Hai bộ đóng băng dựa vào chúng nay đo được ÍT HƠN mà vẫn xanh." >&2
  echo "   ⇒ khôi phục biến thừa trong bai-thu/vat-thu/, ĐỪNG sửa cổng này cho vừa." >&2
  HONG=1
fi
rm -f "$RA2"

[ "$HONG" -eq 0 ] && echo "✔ CỔNG BIẾN THỪA ĐẠT — dự án sạch VÀ vật thử còn đo được" || echo "🔴 CỔNG BIẾN THỪA ĐỎ"
exit "$HONG"
