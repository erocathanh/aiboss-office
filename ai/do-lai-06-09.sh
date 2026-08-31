#!/bin/bash
# do-lai-06-09.sh — ĐỌC SỐ sau 1 tuần chạy S1, để chốt: v3 (lease/ack) hay P0-2b (máy chủ tự chạy) lên trước.
# 🗓 HẸN: 06/09/2026 · người giữ: claude-aiboss-app-pm
# ⚠️ Việc này SINH RA vì 30/08 cả nhà soi SÁU VÒNG một cơ chế mà ⛔ ai hỏi
#    «bệnh đó có phải bệnh đang giết ta ⛔». Đừng lặp lại: ĐỌC SỐ RỒI HÃY QUYẾT.
set -e
SO="${1:-$HOME/Operations/dem-cua-mat-tin.jsonl}"
echo "🗓 ĐỌC SỐ — hẹn 06/09/2026 · chạy lúc $(date '+%F %H:%M')"
if [ ! -f "$SO" ]; then
  echo "🔴 ⛔ có sổ đếm: $SO"
  echo "   ⇒ S1 CHƯA chạy, hoặc chạy mà ⛔ ghi được. ĐI KIỂM S1 TRƯỚC, ⛔ quyết vội."
  exit 1
fi
N=$(wc -l < "$SO" | tr -d ' ')
echo "📊 tổng ca mất tin ghi được: $N"
if [ "$N" -eq 0 ]; then
  echo "🟡 0 ca trong 1 tuần ⇒ ⛔ bệnh nào đủ lớn ⇒ HOÃN CẢ v3 LẪN P0-2b, làm việc khác."
  exit 0
fi
python3 - "$SO" <<'PYEOF'
import json, sys, collections
c = collections.Counter(); dong = 0
for line in open(sys.argv[1]):
    dong += 1
    try: c[str(json.loads(line).get('cua', 'thieu-cua'))] += 1
    except Exception: c['dong-hong'] += 1
tong = sum(c.values())
ten = {'1':'⛔ có poller (trình duyệt đóng)', '2':'tab ẩn', '3':'quá hạn',
       '4':'claim-rồi-bỏ', '5':'đổi ghế', '6':'hai máy chủ'}
print()
print("  đếm theo CỬA:")
for k, v in c.most_common():
    print(f"    cửa {k:12} {v:5}  {100*v/tong:5.1f}%   {ten.get(k,'')}")
p12 = sum(v for k, v in c.items() if k in ('1','2'))
p45 = sum(v for k, v in c.items() if k in ('4','5'))
print()
print(f"  cửa ①② (CHỈ P0-2b chữa)   : {p12} = {100*p12/tong:.0f}%")
print(f"  cửa ④⑤ (v3 lease/ack chữa): {p45} = {100*p45/tong:.0f}%")
print()
print("  ⇒ QUYẾT: " + ("P0-2b LÊN TRƯỚC" if p12 > p45 else "v3 LÊN TRƯỚC"))
print()
print("  ⚠️ ĐỐI CHỨNG DƯƠNG — tổng cửa phải BẰNG tổng dòng sổ.")
print(f"     tổng cửa {tong} · tổng dòng {dong} · " +
      ("KHỚP ⇒ tin được" if tong == dong else "🔴 LỆCH ⇒ ⛔ tin tỉ lệ trên"))
if c.get('thieu-cua') or c.get('dong-hong'):
    print(f"     🔴 thiếu-cửa {c.get('thieu-cua',0)} · dòng-hỏng {c.get('dong-hong',0)} ⇒ S1 ghi CHƯA đủ")
PYEOF
echo
echo "📌 Ghi quyết định vào ai/DECISION_LOG.md NGAY hôm nay, kèm bảng số trên."
