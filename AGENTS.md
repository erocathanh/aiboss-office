# AGENTS.md - Operational Instructions & Agent Roles for AIBOSS Office

> Guidance rulebook for Antigravity (Gemini), Claude Code, and autonomous AI agents operating within `~/Projects/aiboss-office/`.

---

## 1. Project Context & Objectives
- **Project Name:** `aiboss-office` (AIBOSS Office).
- **Nature:** Autonomous AI operations workspace and management platform for small businesses and agencies. Provides org charts, department seat management, multi-agent coordination, and execution dashboards.
- **Port:** Runs locally at **`http://127.0.0.1:4330`**.
  - **HARD RULE:** Port 4330 is reserved for AIBOSS Office. Do NOT use port 4319 (reserved for `aiboss-app-chat`).
- **Owner:** Anh **Eroca Thanh**.

---

## 2. Agent Roles & Identities
- **`antigravity-aiboss-office`**: Execution seat for the `aiboss-office` project (standalone repository, no longer "Team B of app"). Responsible for codebase development, research, and technical implementations directed by PM `claude-aiboss-office-pm`.
- **`claude-aiboss-office-pm`**: Project Manager coordinating roadmap, department specifications, and approvals.
- **Home Directory:** `/Users/erocathanh/DU-AN/aiboss-office/`.
- **Coordination Channel:** `/Users/erocathanh/DU-AN/aiboss-office/PM-CHANNEL.md`.
- **Message Format:** `FROM: [seat-name] / TO: [recipient]`.

---

## 3. Git Remotes & Branching Rules
- **Origin:** `git@github.com:erocathanh/aiboss-office.git` (private repository).
- **Upstream:** `git@github.com:erocathanh/aiboss-app-chat.git` (historical base).
- **CRITICAL RULE:** **NEVER push to upstream.** All pushes must target `origin` branches only.
- **NO DESTRUCTIVE ACTIONS:** No `git push --force`, no `git reset --hard`.
- **Language Convention:** All code, filenames, JSON keys, docstrings, and Git commit messages must be in English.

---

## 4. Inter-Agent Communication (Local MCP Broker)
Communication between agents is handled via the Local MCP Message Broker (`agent-broker`):
- `nhan_tin(nguoi_nhan="antigravity-aiboss-office", gioi_han=20)`
- `danh_dau_da_doc(ma_tin=..., nguoi_doc="antigravity-aiboss-office")` (Mandatory immediate ACK before starting work)
- `gui_tin(nguoi_gui="antigravity-aiboss-office", nguoi_nhan=..., tieu_de=..., noi_dung=...)`
- `soat_hop_thu()`
- Dual notification upon delivery: Send via broker AND append report to `/Users/erocathanh/DU-AN/aiboss-office/PM-CHANNEL.md`.

---

## 5. Continuous Watchdog (Reactive Wakeup)
- The background watchdog `bash /Users/erocathanh/Operations/scripts/cho-tin-moi.sh antigravity-aiboss-office 3600 10` must run continuously.
- When it exits (code 0 or 2), immediately relaunch it in the background before proceeding with other work. Never terminate the watchdog.

---

## 6. Security & Safe Execution
- No secrets or credentials in Git commits.
- Disk searches must exclude `/Volumes/`.
- Never execute or invoke Ollama or port 11434.
- In Vietnamese documentation/channels, express negation with the word «không» (do not use Unicode prohibition symbols).
- Verify all implementations with measurable metrics (exit codes, md5, line counts, build checks).
