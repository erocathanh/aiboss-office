#!/bin/bash
# nghiệm thu chốt worktree — BA ca, chạy trên kho TẠM, kho thật KHÔNG bị mở worktree
set -u
CONG="$1"; DAT=0; TONG=0
R=$(mktemp -d /tmp/thu-cong-XXXX); W="$R-wt"
cham() { # tên · thư mục chạy · mã mong đợi
  TONG=$((TONG+1))
  ( cd "$2" && bash "$CONG" >/tmp/o-cong.txt 2>&1 ); local ma=$?
  if [ "$ma" -eq "$3" ]; then echo "  ✅ $1 ⇒ mã $ma (đúng mong đợi)"; DAT=$((DAT+1));
  else echo "  🔴 $1 ⇒ mã $ma, mong đợi $3"; sed 's/^/       /' /tmp/o-cong.txt | head -4; fi
}
git init -q "$R" && cd "$R" && git config user.email t@t && git config user.name t
mkdir -p bai-thu ai && echo v1 > bai-thu/x.txt && echo v1 > ai/y.txt
git add -A && git commit -qm nen
git worktree add -q "$W" HEAD

echo "── ca ①: cây chính SẠCH, chạy ở worktree LIÊN KẾT ⇒ phải CHO QUA (mã 0) ──"
cham "worktree liên kết + chính sạch" "$W" 0
echo "── ca ②: cây chính BẨN, chạy ở worktree LIÊN KẾT ⇒ phải CHẶN (mã 1) ──"
echo v2 > "$R/bai-thu/x.txt"; echo moi > "$R/bai-thu/them.txt"
cham "worktree liên kết + chính bẩn" "$W" 1
( cd "$W" && bash "$CONG" 2>&1 | grep -E '^ {5}' | head -3 | sed 's/^/       chỉ tên tệp bẩn: /' )
echo "── ca ③: cùng lúc đó, chạy ở CÂY CHÍNH ⇒ chỉ NHẮC, cho qua (mã 0) ──"
cham "cây chính bẩn ⇒ nhắc, không chặn" "$R" 0
echo "── ca ④: LỆNH ĐO HỎNG — chạy ngoài mọi kho git ⇒ phải CHẶN (mã 2) ──"
mkdir -p /tmp/khong-phai-kho-$$ && cham "ngoài kho git" "/tmp/khong-phai-kho-$$" 2
echo "── ca ⑤: LỆNH ĐO HỎNG — thư mục cổng KHÔNG tồn tại ⇒ phải CHẶN (mã 2) ──"
R2=$(mktemp -d /tmp/thu-cong2-XXXX); git init -q "$R2" && cd "$R2" && git config user.email t@t && git config user.name t
echo x > z.txt && git add -A && git commit -qm nen
cham "kho không có thư mục cổng" "$R2" 2
cd /; git -C "$R" worktree remove --force "$W" 2>/dev/null; rm -rf "$R" "$R2" /tmp/khong-phai-kho-$$
echo "  ⇒ $DAT/$TONG ca đúng"
[ "$DAT" -eq "$TONG" ]
