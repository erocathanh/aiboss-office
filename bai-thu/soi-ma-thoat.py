#!/usr/bin/env python3
"""🔎 SOI BẪY MÃ-THOÁT-SAU-ĐƯỜNG-ỐNG trong tệp vỏ lệnh.

🕳 CỚ SINH RA (03/09): ba người, NĂM lần, một ngày, cùng một bẫy — SAU KHI đã có luật bằng chữ.
   claude-aiboss-app-exe 1 lần · claude-aiboss-app-pm 4 lần. Hai lần suýt vu cho người khác
   một lỗi KHÔNG có, vì đọc phải mã của `cut`/`sed` chứ không phải của lệnh thật.
🔑 Kết luận rút được: **luật bằng chữ KHÔNG chữa được bẫy này.** Và một HÀM VỎ DÙNG CHUNG cũng
   chưa đủ — nó là tuỳ chọn, tức là một lời dặn viết bằng mã. Ai quên gọi thì nó im.
   Thứ bắt được là một cái MÁY ĐỌC MÃ và nói KHÔNG.

⚠️ KHAI SỨC ĐỦ:
   · đây là phép soi theo CHUỖI, không phải cây cú pháp của bash. Nó có thể bỏ sót (biến gián tiếp,
     `eval`, hàm bọc nhiều lớp) và có thể kêu oan (dấu | trong chuỗi phức tạp).
   · nó KHÔNG kiểm ngữ nghĩa: `cmd | tee x` rồi đọc $? vẫn bị kêu, dù có ca người ta CỐ Ý muốn
     mã của lệnh cuối. Ca đó hiếm, và khai rõ bằng chú thích `# co-y-lay-ma-lenh-cuoi` thì bỏ qua.
"""
import re, sys, pathlib

NHAY_CA_HAI = re.compile(r"""'[^']*'|"[^"]*\"""")
NHAY_DON = re.compile(r"'[^']*'")
CHO_PHEP = 'co-y-lay-ma-lenh-cuoi'

def go_nhay(dong: str) -> str:
    """Xoá MỌI phần trong nháy — dùng để tìm dấu | , cho `sed 's/|/-/'` khỏi bị kêu oan."""
    return NHAY_CA_HAI.sub(lambda m: ' ' * len(m.group()), dong)

def go_nhay_don(dong: str) -> str:
    """Chỉ xoá nháy ĐƠN — dùng để tìm `$?`.

    🕳 CA CẮN NGAY LÚC TỰ NGHIỆM THU (03/09): bản đầu dùng CHUNG một phép xoá nháy cho cả hai
       việc, nên `echo "[mã $?]"` bị xoá mất và máy soi BỎ SÓT đúng dòng đã cắn tôi ĐẦU TIÊN
       trong ngày.
    🔑 Xoá nháy để bớt kêu oan ở dấu `|` thì nó làm MÙ luôn phép tìm `$?`. **Một phép chuẩn hoá
       dựng cho trục này, đem dùng cho trục kia, sẽ im lặng cắt mất bằng chứng của trục kia.**
    ⚖️ Nháy ĐƠN thì `$?` KHÔNG được vỏ lệnh thay giá trị ⇒ vô hại, xoá được.
       Nháy KÉP thì `$?` CÓ thay ⇒ phải giữ."""
    return NHAY_DON.sub(lambda m: ' ' * len(m.group()), dong)

def co_ong(sach: str) -> bool:
    """Có đường ống THẬT không — bỏ qua || (hoặc) và |& ."""
    i = 0
    while i < len(sach):
        if sach[i] == '|':
            if i + 1 < len(sach) and sach[i+1] in '|&': i += 2; continue
            if i > 0 and sach[i-1] == '|': i += 1; continue
            return True
        i += 1
    return False

def soi(duong: pathlib.Path):
    loi = []
    truoc_la_ong = False
    for so, tho in enumerate(duong.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
        sach = go_nhay(tho)                      # để tìm dấu |
        khong_chu_thich = sach.split('#', 1)[0]
        de_tim_ma = go_nhay_don(tho).split('#', 1)[0]   # để tìm $?  (giữ nháy kép)
        if CHO_PHEP in tho:
            truoc_la_ong = co_ong(khong_chu_thich); continue

        if 'PIPESTATUS' in khong_chu_thich:
            loi.append((so, 'PIPESTATUS', tho.strip()))
        elif co_ong(khong_chu_thich) and re.search(r'\$\?', de_tim_ma[khong_chu_thich.index('|'):]):
            loi.append((so, 'đọc $? SAU đường ống, CÙNG dòng', tho.strip()))
        elif truoc_la_ong and re.search(r'\$\?', de_tim_ma):
            loi.append((so, 'đọc $? ngay SAU một dòng có đường ống', tho.strip()))

        if khong_chu_thich.strip():
            truoc_la_ong = co_ong(khong_chu_thich)
    return loi

def main(argv):
    if len(argv) < 2:
        print('dùng: soi-ma-thoat.py <tệp .sh hoặc thư mục>…', file=sys.stderr); return 2
    tep = []
    for a in argv[1:]:
        p = pathlib.Path(a)
        if p.is_dir(): tep += sorted(p.rglob('*.sh'))
        elif p.exists(): tep.append(p)
        else: print(f'LỖI: không có {a} ⇒ TỪ CHỐI, đừng coi là sạch', file=sys.stderr); return 2
    if not tep:
        print('LỖI: KHÔNG có tệp nào để soi ⇒ CHƯA ĐO, không phải ĐẠT', file=sys.stderr); return 2
    tong = 0
    for t in tep:
        for so, vi, noi in soi(t):
            tong += 1
            print(f'{t}:{so}: {vi}\n      {noi[:110]}')
    print(f'⇒ soi {len(tep)} tệp · {tong} chỗ dính bẫy mã-thoát-sau-ống')
    return 1 if tong else 0

if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
