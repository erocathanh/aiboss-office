#!/bin/bash
# 🎭 CLAUDE GIẢ — đứng thay `claude` thật cho BẢN DEV. KHÔNG gọi mạng, KHÔNG tiêu một xu.
#
# 🔑 VÌ SAO GIẢ MÀ KHÔNG PHẢI CẤM: PM chốt «bản dev CHỈ-XEM, không sinh tiến trình claude»,
#    và nêu cái giá: «không thử được nút Gửi». Bản giả này trả cái giá ấy lại —
#    nút Gửi CHẠY THẬT, chữ chảy thật, nút Dừng thử được — mà vẫn KHÔNG tiêu tiền,
#    vì tiến trình sinh ra là TỆP NÀY, không phải `claude`.
# 📌 Chốt nằm ở CƠ CHẾ: bản dev chạy với DUONG_DAN_CLAUDE trỏ vào đây. Nó KHÔNG có đường
#    nào chạm tới nhị phân thật — không phải vì ai đó nhớ đừng bấm.
#
# Giao thức: `--output-format stream-json --verbose` ⇒ mỗi dòng stdout là một JSON.
# Khuôn lấy từ src/lib/chay-agent.ts:339-360 (session_id · stream_event · result).
set -u
cat > /dev/null &                     # nuốt stdin (câu hỏi đi bằng stdin), không chặn
MA="gia-$(date +%s)-$$"
printf '{"type":"system","subtype":"init","session_id":"%s"}\n' "$MA"
CHU='Đây là BẢN DEV — tôi là claude GIẢ, không tiêu tiền của anh. '
CHU+='Nút Gửi, dòng chảy chữ và nút Dừng đều chạy thật để anh thử giao diện. '
CHU+='Muốn nói chuyện thật thì dùng cổng 4319.'
for (( i=0; i<${#CHU}; i+=12 )); do
  python3 -c "
import json,sys
print(json.dumps({'type':'stream_event','session_id':sys.argv[1],
  'event':{'type':'content_block_delta','delta':{'type':'text_delta','text':sys.argv[2]}}}))" \
    "$MA" "${CHU:$i:12}"
  sleep 0.05
done
printf '{"type":"result","subtype":"success","session_id":"%s","is_error":false,"result":"xong"}\n' "$MA"
