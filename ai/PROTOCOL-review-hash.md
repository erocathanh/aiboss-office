# PROTOCOL: REVIEW-HASH  ·  v1.5

> 🇻🇳 Một câu: **verdict phải dán vào một BẢN CỤ THỂ.** Mã đổi sau verdict thì verdict hết hiệu lực
> với phần đổi — soi DELTA, đừng soi lại từ đầu, và đừng dựng bản chưa ai soi.
> 📅 02/09/2026 · đặt bởi `claude-aiboss-app-pm` sau khi lặp lỗi 2 lần trong 1 giờ · Owner duyệt.

---

## WHY (read this first — the rule is useless without the failure mode)

A verdict names a QUALITY. It does not name a VERSION.
So "APPROVED" survives edits that invalidate it, and nothing complains.

```
12:12  review build A  →  author patches to A'   ⇒ A' reviewed by NOBODY
12:43  review build B  →  author patches to B'   ⇒ B' reviewed by NOBODY
```

This is dangerous precisely because **it looks like a healthy process**: there is a reviewer,
a verdict, and the word APPROVED. The gap is invisible from every side.
The fix turns "has this been reviewed?" from a MEMORY question into a STRING COMPARISON.

---

## RULES

**R1 — A verdict MUST pin the artifact.**
Every verdict ends with a hash block, split into TWO lists:
```
READ @ 2026-09-02T11:59Z          # opened and read, line by line
  src/lib/kho-tien-trinh.ts      3f9a1c…
  src/components/UngDung.tsx     b71e04…
TRACKED (hashed, NOT read)        # change-detection only — carries NO review claim
  src/app/api/dung/route.ts      a7a752…
```
Files in neither list = not reviewed. Do not infer coverage from prose.

**R1a — A hash proves "unchanged". It does NOT prove "read".**
Running `md5` on a file is trivial; opening it is not. Listing a hashed-but-unread file under
READ manufactures a review that never happened — and a tidy hash block makes the two look
identical. This exact substitution occurred within 9 minutes of v1.0 being written: a reviewer
listed a file as reviewed on the strength of its hash alone, and opening it later revealed a
real defect. **A protocol against self-deception can itself become the vehicle for it.**

**R2 — Editing after a verdict voids that verdict FOR THE EDITED PART ONLY.**
Do not re-review from scratch. Review the DELTA.
Cheap enough that nobody is tempted to skip it — that is the point.

**R3 — Compare hashes before building. Mismatch + no delta review ⇒ DO NOT BUILD.**

**R4 — FREEZE before review. The author declares "done + hashes", THEN review starts.**
Reviewing a file that is still being edited is chasing a shadow: every edit silently voids the
work already done, and each wasted pass costs a real run.
```
02/09 measured: kho-tien-trinh.ts changed 4× during one 11-minute review
  8222cbfd → ce62a7c9 → 2a93dd45 → 55d25fb1
The reviewer had finished auditing 4 fingerprints on 8222cbfd. That build no longer existed.
```
R2 protects the VERDICT from going stale. R4 protects the reviewer's TIME.
They are different failures — R2 alone still burns the work.
**Corollary:** an external reviewer (different vendor, expensive) MUST get a frozen tree.
A drifting tree turns their whole pass into noise.
```bash
md5 -q <file>        # compare against the value in the latest verdict
```

---

## MECHANICS

```bash
# author, when handing off for review
for f in <changed files>; do printf '%-42s %s\n' "$f" "$(md5 -q "$f")"; done

# reviewer, in the verdict — list ONLY files actually opened
# builder, before `next build`
```

**R5 — A mismatch is a QUESTION, not a verdict. Answer it with a measurement.**
`md5` cannot tell a comment edit from a behaviour edit. So on mismatch the author must not merely
*assert* "only comments changed" — that forces the reader to trust. Prove it:
```bash
# 1. reconstruct the old bytes, confirm the hash matches exactly
#    ⇒ proves NO other change was silently included
# 2. strip comments from both versions, hash both
#    identical ⇒ runtime behaviour is unchanged; the whole delta is commentary
```
Measured example (02/09): stripped hashes `fbbd90d6…`, 2911 chars, both sides ⇒ reviewer's earlier
conclusions carried over intact and no re-read was needed.
**Turning "trust me" into "here is the number" is the entire point of this protocol.**

**R6 — VERIFY THE ANCHOR ITSELF. Generating a hash is not the same as pinning a correct one.**
R1-R5 all govern how a hash is *used*. Nothing governed the act of *writing it down* — and that is
where it broke.
```
02/09 15:3x: a brief was pinned with 6 hashes. 5 matched. The 6th (a7405480…) matched NO file
on disk — not the working copy, not any backup, not any stash. Its origin could not be
reconstructed from mtime or git state. The anchor was simply wrong.
```
The producer trusted the production step. Same family as "printing numbers is not measuring".
**Read the anchor BACK from the document and diff it against disk before sending:**
```bash
# after writing the brief, verify what is actually IN it
grep -oE '^ *[0-9a-f]{32}  .*' brief.md | while read h f; do
  [ "$(md5 -q "$f")" = "$h" ] || echo "🔴 ANCHOR WRONG: $f"
done
echo "checked $(grep -cE '^ *[0-9a-f]{32}' brief.md) anchors"   # print the COUNT, not just failures
```
⚠️ Impact is asymmetric: a wrong anchor that matches NOTHING is loud (the reviewer reports a
mismatch). A wrong anchor that matches a STALE COPY is silent — the reviewer reads the wrong bytes
and reports success. **The loud failure is the lucky one.**

**R6a — Re-check the anchor AT DISPATCH, not at authoring. Time passes in between.**
```
02/09 measured sequence:
  15:18:34  file content = A   (author takes a backup)
  ~15:2x    PM captures hashes → A          ⇐ CORRECT at that moment
  15:24:10  author edits file → B
  15:24:08  PM sends the brief pinned to A  ⇐ now STALE, by about a minute
```
The anchor was never fabricated. It was **right when taken and wrong when used** — the same shape as
a notification that is correct when queued and stale when delivered. Verifying at authoring time
cannot catch this. **Run the R6 loop as the last step before sending, every time.**

**R7 — Publishing a hash block is a PROMISE not to touch those files.**
Whoever edits a file that appears in a live hash block must **announce before typing**, not after.
Anyone may publish a block; the freeze binds everyone, including the publisher.

**R8 — The reviewer re-measures at the START of the review and anchors the verdict to what THEY read.**
Never inherit someone else's number. This is what saved the 02/09 run: the external reviewer measured,
found the mismatch, and scoped its verdict to the bytes actually on disk.
📌 R8 was already a habit for one reviewer, but unwritten. **A good habit that lives only in one head
dies with that head's session.**

**R9 — Backup directories MUST NOT mirror the repository's path layout.**
Backups here use flattened names (`src_components_UngDung.tsx`). That flattening is what currently
prevents the worst failure: a reviewer standing in a backup directory, where a path-based hash check
would find matching files and turn green on the wrong bytes.
⚠️ **Today that protection is ACCIDENTAL** — flattening exists to avoid creating subdirectories, not
to block this. Anyone switching the backup script to `cp -R` reopens the door, silently.
Changing the backup layout ⇒ fix R6 first.

**Positive control (mandatory, else the check is theatre):**
change one byte in one file → the comparison MUST report a mismatch.
A comparison that never fails has never been shown to work.

---

## SCOPE / LIMITS

- Applies to: any patch that will be BUILT or COMMITTED in `aiboss-app-chat`.
- Hashes cover FILE CONTENT only. They do NOT cover: dependency changes, env vars,
  the running server's build, or anything outside the listed files. Do not overclaim.
- `md5` here is a CHANGE DETECTOR, not a security control. Adversarial tampering is out of scope.
- Green hashes mean "reviewed THIS text". They do NOT mean "correct".

## RELATED
- `ai/MASTER-PLAN.md` §4v-4z — cases this rule was extracted from
- `~/Operations/SO-BAY-DO.md` §51-bis, §52 — measurement traps from the same day

---

## R10 · NHẬP MỘT BẢN ĐÃ CHẤM: `--no-ff` ĐƯỢC, **`rebase` THÌ KHÔNG**
> thêm 03/09/2026 · ca thật: M1a, `git merge --ff-only` từ chối (mã 128, «Not possible to fast-forward»)

**Luật một câu: verdict neo vào MÃ BĂM. Cách nhập nào XOÁ mã băm đó thì cách ấy xoá luôn verdict.**

```
--no-ff   đẻ một commit gộp · ứng viên 771c7ef SỐNG NGUYÊN làm CHA
          ⇒ verdict vẫn neo vào ĐÚNG VẬT đã được soi                       ✅ DÙNG
rebase    viết lại thành commit MỚI, mã băm KHÁC
          ⇒ 771c7ef KHÔNG còn nằm trên main ⇒ verdict neo vào một vật KHÔNG CÓ MẶT   🔴 CẤM
```
🔑 `rebase` **không sai về mã** — mã sau rebase có thể giống hệt. Nó sai về **BẰNG CHỨNG**:
người soi đã chấm một vật có tên; rebase đổi tên vật đó; và từ giây ấy **không ai tra ngược được
verdict về vật nào nữa.** Đúng bệnh «neo ôi» mà giao thức này sinh ra để chặn.

### 🕳 CA SINH LUẬT — và nó là một vòng tròn đáng nhớ
```
14:35  bước 1 ĐỎ vì tệp ĐỀ BÀI chưa vào git  ⇒ PM commit đề bài ⇒ cổng THÔNG
16:00  merge --ff-only TỪ CHỐI, vì chính commit đề bài ấy làm main RẼ ĐÔI khỏi nền đua
```
📌 **Cái nút mở cổng lúc 14:35 chính là cái nút làm rẽ đôi lúc 16:00.** Không ai làm sai:
đề bài PHẢI vào git để bước 1 sạch, nhưng lúc commit thì nền đua ĐÃ ghim rồi.
⚠️ Cách tránh cho lần sau: **commit đề bài TRƯỚC khi ghim COMMIT_NEN**, đừng ghim rồi mới commit.

### ✅ TRƯỚC KHI `--no-ff`, ĐO HAI THỨ
```
① git merge-base main <ứng viên>  phải ĐÚNG bằng COMMIT_NEN đã công bố
② comm -12 hai danh sách tệp đổi  ⇒ 0 tệp trùng thì KHÔNG THỂ xung đột
   khác 0 ⇒ DỪNG, báo PM: có tệp chung thì «gộp sạch» KHÔNG còn là chuyện hiển nhiên
```
📌 Người LÀM BÀI KHÔNG tự chọn cách bài mình được nhập. Đó là quyết định của người giữ cổng.
