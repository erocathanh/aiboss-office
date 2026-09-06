# BÀN GIAO ⑭ — BẬT CỔNG LINT ĐÃ TẮT SUỐT (Owner giao 06/09/2026 07:55 BST)

> 🔴 Số trong tệp này đo lúc soạn, cây SỐNG — tự đo lại trước khi tin.
> ⚠️ Loại trừ `/Volumes/*`.

## 🎯 MỤC TIÊU (Owner nói thẳng: «sao không cài cái này đi»)

`package.json` khai `"lint": "next lint"`, nhưng **khôngcó gói eslint, khôngcó tệp cấu hình**.
Cả nhà tin là đang có người canh, thực ra cổng đó **chưa từng nổ**.
**Việc của bạn: làm cho lệnh lint chạy được thật và cho ra một con số tra lại được.**
Cách làm là của bạn — chọn gói, chọn dạng cấu hình, chọn bộ luật.

## 📐 SỐ THÔ — tôi đo, cố ý KHÔNG kết luận
```
next            15.5.4
package.json    chỉ có "lint": "next lint" — khôngcó eslint trong dependencies
node_modules/eslint  KHÔNG có   (đối chứng dương: node_modules CÓ tồn tại)
tệp cấu hình    khôngcó .eslintrc* lẫn eslint.config.*
quy mô sẽ bị soi  39 tệp .ts/.tsx · 9.786 dòng
```

## 🔴 RÀNG BUỘC CỨNG
```
· LƯỢT NÀY KHÔNG COMMIT, KHÔNG next build. Chỉ làm + đo + báo số.
  Lý do: commit chạm package.json ⇒ cổng dựng ④ áp ⇒ phải có verdict ĐẠT trước (luật dựng ②),
  mà người soi đang bận việc ㉒. Làm xong thì ĐỂ NGUYÊN trong cây, báo kênh, chờ soi.
· KHÔNG sửa hàng loạt mã nguồn để «cho hết lỗi». Lần chạy đầu ra nhiều lỗi là NỢ CŨ LỘ RA,
  khôngphải hỏng mới. Nhiệm vụ lượt này là ĐẾM, khôngphải DỌN.
· KHÔNG tắt luật cho số đẹp. Tắt một luật thì phải ghi rõ tắt cái nào và VÌ SAO.
  🔑 Bật một cổng rồi tắt hết luật của nó = vẫn khôngcó cổng, mà lại trông như có.
· KHÔNG đụng bai-thu/ — đang có hai việc khác nằm ở đó (㉒ đang soi, ⑱ đang treo).
```

## ✅ PHẢI BÁO ĐƯỢC NHỮNG SỐ NÀY
```
① lệnh lint chạy được: dán NGUYÊN VĂN lệnh + mã thoát
② tổng số lỗi và tổng số cảnh báo — ĐẾM, đừng ước lượng
   ⚠️ đếm qua iconv: ... 2>&1 | iconv -f utf-8 -t utf-8 -c | grep -c '<mẫu>'
      thiếu iconv thì một byte hỏng làm phép đếm CÂM và trả RỖNG ⇒ rỗng đọc thành 0 (sổ bẫy)
③ ĐỐI CHỨNG DƯƠNG BẮT BUỘC: gieo một lỗi CHẮC CHẮN SAI vào một tệp tạm ⇒ lint phải BẮT được.
   Bắt được rồi thì xoá tệp tạm. **Thiếu vế này thì con số 0 hay 300 đều vô nghĩa** —
   ta khôngbiết cái cổng có thật sự nhìn thấy gì không.
④ top 10 loại lỗi theo số lần xuất hiện — để biết nợ nằm ở đâu trước khi quyết dọn
⑤ nếu `next lint` khôngdùng được ở Next 15.5.4 thì NÓI RA và nêu đường bạn chọn thay
```

## 📂 BỐI CẢNH
```
~/Projects/aiboss-app-chat/AGENTS.md · ai/MASTER-PLAN.md mục ⑭
~/Operations/SO-BAY-DO.md — nhất là mục 92 (nuốt lỗi lệnh đo) và 87 (cổng mù tầng trên)
```
🔴 Xong thì GHI KÊNH ngay, đừng chờ gom.
