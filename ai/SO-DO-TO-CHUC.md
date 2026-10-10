# SƠ ĐỒ TỔ CHỨC — ĐỘI APP AIBOSS (`aiboss-app-chat`)

> Lập 10/10/2026 bởi `claude-aiboss-app-pm` theo lệnh anh Thanh lúc 11:31 ngày 10/10/2026.
> Bản vẽ: `ai/SO-DO-TO-CHUC.svg` (mở bằng trình duyệt). Quyết định gốc: `ai/DECISION_LOG.md` mục Q-006 · Q-007.
> Mã phiên soát Hermes KHÔNG chép vào đây; nguồn duy nhất: `/Users/erocathanh/idea/inbox/aiboss-app-noibo/SO-PHIEN-SOAT-HERMES.md`.

## 1. Sơ đồ

```
                         ┌───────────────────────────────┐          ┌───────────────────────────────┐
                         │ Anh Thanh · Owner             │◄┄báo cáo┄┤ claude-eroca-boss · TGĐ       │
                         │ quyết trang round             │          │ đọc TIEN-DO-app.md 2 giờ/lần  │
                         │ xác nhận khởi động lại 2 lần  │          └───────────────▲───────────────┘
                         └───────────────┬───────────────┘                          ┆ TIEN-DO-app.md
                                         │                                          ┆
                         ┌───────────────┴───────────────┐                          ┆
                         │ claude-aiboss-app-pm · PM     ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                         │ Claude · giữ sổ · giao việc   ├──┬─ claude-phong-ban-pm · research (không soát)
                         │ nghiệm thu · không viết mã    │  ├─ antigravity-web-noibo · dựng + đẩy trang round
                         └───────────────┬───────────────┘  ├─ claude-bos-funnel-pm · ghế terminal canh khởi động lại
                    ┌────────────────────┴────────────┐     └┄ đối tác: claude-phong-cong-nghe · claude-aiboss-office-pm
                    │                                 │
     ┌──────────────┴──────────────┐   ┌──────────────┴──────────────┐
     │ ĐƯỜNG A · đổi bản phục hồi  │   │ ĐƯỜNG B · cây git riêng     │
     │ claude-aiboss-app-exe       │   │ antigravity-aiboss-office   │
     │ Claude · DUY NHẤT dựng      │   │ Gemini · tránh 7 tệp đường A│
     └──────────────┬──────────────┘   └──────────────┬──────────────┘
                    │ nộp                             │ nộp
     ┌──────────────┴──────────────┐   ┌──────────────┴──────────────┐
     │ Hermes · phiên A            │   │ Hermes · phiên B            │
     │ gpt-6-astra · chỉ soát      │   │ gpt-6-astra · chỉ soát      │
     └─────────────────────────────┘   └─────────────────────────────┘
          hermes-aiboss-app-reviewer: một hồ sơ, hai phiên, chạy song song
```

## 2. Từng ghế

| Ghế | Vai | Mô hình (đo 10/10 11:4x) | Ai soát việc của ghế này | Gọi bằng |
|---|---|---|---|---|
| Anh Thanh | Owner: quyết trang round · xác nhận khởi động lại app hai lần liền · mở lượt ghế Antigravity | — | — | ô chat app · trang round |
| `claude-aiboss-app-pm` | PM: giữ sổ · soạn đề · giao việc · nghiệm thu · soạn câu hỏi trang round · không viết mã | claude-opus-5-5 | sổ sách tự giữ; quyết lớn trình anh | ô 2 trong app |
| `claude-aiboss-app-exe` | thợ đường A (đổi bản phục hồi) · DUY NHẤT chạy `next build`, chỉ sau verdict ĐẠT | claude-opus-5-5 | Hermes phiên A | kênh `doi-aiboss-app-chat.md` + chuông `/api/danh-thuc` |
| `antigravity-aiboss-office` | thợ đường B · cây git riêng · tránh 7 tệp đường A · không dựng | Gemini (Antigravity) | Hermes phiên B | hộp thư broker `gui_tin` + anh mở lượt trong Antigravity |
| `hermes-aiboss-app-reviewer` | người soát duy nhất · chỉ soát · `--safe-mode` chỉ đọc | gpt-6-astra (OpenAI Codex) | — | script phóng tách rời; mã phiên ở sổ phiên |
| `claude-phong-ban-pm` | research: đọc mã nhà khác, mang bằng chứng · không ra verdict | Claude | — | kênh + chuông |
| `antigravity-web-noibo` | dựng và đẩy trang round lên `aiboss-app-noibo.erocathanh.com` (PM soạn đề) | Gemini | PM đo bản live (render-test · md5 · trang bịa ra 404) | hộp thư broker + anh mở lượt |
| `claude-bos-funnel-pm` | ghế terminal (ngoài app): canh lần khởi động lại app, nhắc anh xác nhận (round-51) | Claude | — | kênh phối hợp + kênh nhà + hộp thư (không có ô nên chuông trả 404) |
| `claude-eroca-boss` | Tổng giám đốc: đọc `TIEN-DO-app.md` hai tiếng một lần, gom báo cáo cho anh · chỉ đọc | Claude | — | tự quét |
| đối tác ngoài đội | `claude-phong-cong-nghe` (công nghệ mới, yêu cầu sổ ghế) · `claude-aiboss-office-pm` (PM sản phẩm AIBOSS Office, đóng gói app) | — | — | kênh `doi-aiboss-app-chat.md` · kênh phối hợp |

## 3. Luật chạy đội (trích; bản đầy đủ ở hồ sơ ghế PM `/Users/erocathanh/claude-aiboss-app-pm/CLAUDE.md`)

1. **Người soát phải KHÁC MÔ HÌNH người làm.** Claude hoặc Gemini làm ⇒ Hermes (gpt) soát. Gpt làm ⇒ PM (Claude) soát. Đo mô hình trước mỗi lần giao.
2. **Hermes chỉ soát** (Q-007): không viết mã, không dựng trang cho dự án app. Trang round: `antigravity-web-noibo` dựng; ghế đó tắc thì PM tự dựng (đường lui cuối) và báo anh.
3. **Hai đường không chờ nhau:** mỗi đường một phiên soát riêng, nối lại đúng phiên ở lần sau.
4. **Đội B không sửa bảy tệp đường A đang giữ:** `src/lib/van-hanh.ts` · `src/lib/kho-danh-thuc.ts` · `src/app/api/chat/route.ts` · `src/lib/may-chay-nen.ts` · `src/lib/chay-agent.ts` · `src/components/UngDung.tsx` · `src/app/api/van-hanh/route.ts`.
5. **Chỉ exe chạy `next build`**, sau verdict ĐẠT. Đổi bản hay khởi động lại app cần anh xác nhận HAI LẦN liền nhau; ghế terminal canh.
6. **Bị bác ba vòng thì dừng và báo anh.** Câu cần anh quyết đi trang round, không hỏi trong ô chat.

## 4. Lịch sử

- **10/10/2026** — lập sơ đồ (bản chữ + bản vẽ). Ghế Antigravity của app đổi tên `gemini-aiboss-app-exe` → `antigravity-aiboss-office` (Q-006). Hermes chỉ soát; hai phiên soát cho hai đường (Q-007). `hermes-build-app` thôi viết mã cho dự án app.
