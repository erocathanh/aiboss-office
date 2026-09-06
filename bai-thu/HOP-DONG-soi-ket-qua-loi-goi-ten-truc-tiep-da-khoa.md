# Hợp đồng hẹp — `soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa.mjs`

## Tên và ý nghĩa

Tên đầy đủ của thước là:

`bai-thu/soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa.mjs`

Tên này là một phần của hợp đồng. Thước chỉ xem các lời gọi mà callee, sau khi bóc các lớp vỏ trong
suốt đã được khóa bằng test, còn lại đúng một định danh nằm trong danh sách tên được giao. Tên này
KHÔNG nói rằng thước hiểu mọi cách JavaScript/TypeScript có thể tham chiếu hoặc gọi một hàm.

## Phạm vi được bảo đảm

Thước chỉ bảo đảm các dạng lời gọi ĐÃ KHÓA BẰNG TEST. Nguồn chuẩn của phạm vi là các mẫu cụ thể trong:

- `bai-thu/dong-bang-ket-qua-khong-roi.test.mts`: bảng `MAU`, các hồi quy ba vòng, ba trạng thái và
  bảng 27 chỗ gọi của `UngDung.tsx`.
- `bai-thu/hop-dong-hep-loi-goi-ten-truc-tiep.test.mts`: tên thước, cảnh báo đi kèm kết quả ĐẠT và
  các giới hạn biết mà cố ý chưa làm.

Một mẫu xanh chỉ bảo đảm đúng hình cú pháp được viết trong mẫu đó. KHÔNG suy từ một mẫu ra cả họ cú
pháp gần giống. Đặc biệt, không suy rộng thành mọi JavaScript/TypeScript.

Với phần đã khóa, kết quả có ba trạng thái:

- `ĐẠT`: mọi lời gọi mà thước nhận diện trong phạm vi hẹp đều được phân loại `DUNG`.
- `KHÔNG ĐẠT`: có ít nhất một lời gọi nhận diện được bị phân loại `BO-QUA`; lỗi chắc chắn này thắng
  một phần khác `KHONG-DO-DUOC`.
- `KHÔNG ĐO ĐƯỢC`: thước không thể đọc hoặc phân loại nguồn đủ tin cậy và chưa có lỗi `BO-QUA`
  chắc chắn để kết luận `KHÔNG ĐẠT`.

## Biết mà cố ý chưa làm

Thước KHÔNG bảo đảm bắt đúng các trường hợp sau:

- generic trong callee — `take(f<number>()); (f<number>)();`
- dấu phẩy trong callee — `take(f()); ((touch(),(touch(),f)))();`
- bí danh (alias)
- scope
- xuyên mô-đun
- mọi nhánh runtime

Hai dòng đầu là ca hỗn hợp: lời gọi thứ nhất là đối chứng lành mà thước nhận diện; lời gọi thứ hai là
hình callee thước cố ý chưa nhận diện. Các test hợp đồng ghi nhận số lời gọi bị thiếu thay vì im lặng
biến thiếu sót thành một cam kết rộng.

`scope` có thể gây báo đỏ oan khi hai định danh cùng chữ nhưng khác binding. `mọi nhánh runtime` có
thể gây xanh sai khi một lần đọc chỉ xảy ra trên một nhánh không chạy. Đây là các giới hạn đã biết,
KHÔNG phải bằng chứng rằng nguồn nằm trong các trường hợp ấy là lành.

## Cách đọc kết quả ĐẠT

CLI bắt buộc in toàn bộ danh sách trên mỗi khi trả `ĐẠT`. Câu đúng để đọc kết quả là:

> ĐẠT trong các dạng lời gọi tên trực tiếp đã khóa bằng test; còn sáu giới hạn đã biết không được bảo đảm.

KHÔNG rút gọn câu đó thành “kết quả hàm không rơi” hoặc “mã JavaScript/TypeScript đã an toàn”. Người
đọc kết quả không cần tìm lại tài liệu mới thấy giới hạn, vì cảnh báo đi cùng chính kết quả.

## Lệnh kiểm

```sh
export PATH="/opt/homebrew/bin:$PATH"
fnm exec --using=24.19.0 -- node --experimental-strip-types --test \
  bai-thu/dong-bang-ket-qua-khong-roi.test.mts \
  bai-thu/hop-dong-hep-loi-goi-ten-truc-tiep.test.mts
```

Bộ đầy đủ vẫn chạy bằng `bash bai-thu/chay.sh`. Lệnh này KHÔNG thay cho review độc lập và KHÔNG làm
rộng hợp đồng của thước.
