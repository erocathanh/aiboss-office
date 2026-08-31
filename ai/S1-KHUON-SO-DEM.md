# S1 — KHUÔN SỔ ĐẾM (hợp đồng giữa NGƯỜI GHI và NGƯỜI ĐỌC)

> 📅 30/08/2026 · `claude-aiboss-app-pm`
> 🎯 Người GHI là S1 (trong app). Người ĐỌC là `ai/do-lai-06-09.sh`.
> 🔴 Hai bên lệch nhau thì ngày 06/09 **⛔ đọc được, MÀ IM LẶNG** — đúng loại hỏng ta đang đi chữa.

## ĐƯỜNG DẪN — chốt cứng, ⛔ đổi
```
~/Operations/dem-cua-mat-tin.jsonl
```
⚠️ Cố ý đặt NGOÀI `.trang-thai/` — vì `.trang-thai/` bị `donDep` dọn sau 10 phút, mà sổ này phải sống HÀNG TUẦN.
⚠️ Cố ý đặt ngoài kho — nó là SỐ ĐO, ⛔ phải mã nguồn.

## DẠNG — mỗi ca MẤT TIN là MỘT DÒNG JSON (ghi nối đuôi, ⛔ sửa dòng cũ)
```json
{"luc":1788076800000,"ma":"<uuid mẩu>","cua":"1","ma_o":"o-3","ma_nhan_su":"claude-phong-ban-pm","tu_ai":"claude-aiboss-app-pm","tuoi_giay":183,"so_lan_thu":0,"ghi_chu":""}
```
| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `luc` | ✅ | mốc ms lúc GHI SỔ (⛔ phải lúc mẩu sinh ra) |
| `ma` | ✅ | mã mẩu — để đối chiếu với kênh |
| **`cua`** | ✅ | **CHUỖI `"1"`…`"6"`.** ⛔ số, ⛔ tên chữ. Người đọc ép `str()` nhưng đừng thử. |
| `ma_o` · `ma_nhan_su` · `tu_ai` | ✅ | ai gửi cho ai, ô nào |
| `tuoi_giay` | ✅ | tuổi mẩu lúc chết — để biết hạn 3 phút có đủ ⛔ |
| `so_lan_thu` | ✅ | 0 nếu chưa ai claim |
| `ghi_chu` | ⛔ | để rỗng cũng được |

## SÁU CỬA — ⛔ tự thêm cửa mới mà ⛔ sửa `do-lai-06-09.sh` cùng lúc
```
"1"  ⛔ có ai thăm dò (trình duyệt đóng)   → hết hạn, da_xu vẫn false, và ô ĐANG RẢNH
"2"  tab ẩn                                → như trên nhưng biết được tab tồn tại mà ngủ
"3"  quá hạn vì ô BẬN                       → hết hạn, và ô ĐANG CHẠY suốt
"4"  claim-rồi-bỏ                           → da_xu=true mà ⛔ tới đích (UngDung.tsx:1182 · 1173 · 1185)
"5"  đổi ghế                                → ma_nhan_su lúc chết ≠ lúc xếp hàng
"6"  hai máy chủ                            → phát hiện tiến trình thứ hai / tệp tạm lạ
```
🔴 **⛔ phân biệt được cửa ① và ③ thì ghi `"1"` hay `"3"`?** ⇒ ghi cửa mình ĐO ĐƯỢC:
xem ô lúc mẩu chết đang RẢNH hay CHẠY. Rảnh ⇒ `"1"`. Chạy ⇒ `"3"`. **⛔ đoán.**
⛔ đo được thì ghi `"thieu-cua"` — người đọc CÓ đếm riêng và sẽ kêu, ⛔ nuốt im.

## PHÉP THỬ TRƯỚC KHI NÓI S1 XONG
```
① ép một mẩu hết hạn khi ô RẢNH  → sổ phải có đúng 1 dòng, cua="1"
② mẩu tới đích bình thường        → sổ ⛔ được có dòng nào (ĐỐI CHỨNG ÂM)
③ chạy `bash ai/do-lai-06-09.sh` → phải in bảng, và dòng «tổng cửa = tổng dòng · KHỚP»
```
