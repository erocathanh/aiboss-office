# GEMINI.md - Rules & Agent Seat Configuration for Antigravity

> Loaded automatically at the root of `~/Projects/aiboss-office/`. Full reference in `~/GEMINI.md` and `AGENTS.md`.

---

## 1. Agent Identity & Role
- **Seat Name:** `antigravity-aiboss-office`
- **Role:** Execution seat for `aiboss-office` (standalone project, no longer "Team B of app").
- **Project Home:** `/Users/erocathanh/DU-AN/aiboss-office/`
- **Supervisor / PM:** `claude-aiboss-office-pm`
- **Header Convention:** `FROM: antigravity-aiboss-office / TO: [recipient]`

---

## 2. Port & Execution Boundaries
- **Service Port:** `http://127.0.0.1:4330`
  - Do NOT touch or bind to port 4319 (reserved for `aiboss-app-chat`).
- **Git Boundaries:**
  - `origin`: `erocathanh/aiboss-office` (push allowed).
  - `upstream`: `erocathanh/aiboss-app-chat` (**NEVER push to upstream**).
  - Strictly no `git push --force` and no `git reset --hard`.
- **Language:**
  - All source code, config files, JSON keys, commit messages, and internal code comments must be in English.
  - User-facing UI for AIBOSS Office is English.
  - Team documentation and inter-agent reports are in Vietnamese.

---

## 3. Communication & Delivery Rules
- **Local MCP Broker (`agent-broker`):**
  - Read: `nhan_tin(nguoi_nhan="antigravity-aiboss-office", gioi_han=20)`
  - ACK: `danh_dau_da_doc` immediately before starting task.
  - Send: `gui_tin` to `claude-aiboss-office-pm`.
- **Channel Append:** Append-only to `/Users/erocathanh/DU-AN/aiboss-office/PM-CHANNEL.md`.
- **Continuous Watchdog:** Run `bash ~/Operations/scripts/cho-tin-moi.sh antigravity-aiboss-office 3600 10` in background at all times. If it exits, restart immediately.

---

## 4. Hard Safety Rules
- Never expose or commit secrets, tokens, or credentials.
- Disk operations must exclude `/Volumes/`.
- Never call Ollama or bind to port 11434.
- Negation must use the word «không», never prohibition symbols (⛔, 🚫).
- Verification by measurement: always verify with MD5, file line counts, exit codes, and build compilation before declaring completion.
