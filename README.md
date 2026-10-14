# AIBOSS Office

Autonomous AI operations workspace and management interface for AI-powered departments.

## Overview
AIBOSS Office is a standalone workspace platform providing org charts, multi-seat agent orchestration, and execution dashboards for small businesses and agencies.

- **Port:** `http://127.0.0.1:4330`
- **Initial MVP:** Marketing Department (Track A: 8 seats + Owner)
- **Timezone:** Europe/London

## Getting Started

1. **Bootstrap & Health Checks:**
   ```bash
   ./setup.sh
   ```

2. **Environment & Authentication:**
   Configure `PHONGBAN_USER` and `PHONGBAN_PASS` in `.env` (or environment).

3. **Development Server:**
   ```bash
   pnpm dev
   ```

4. **Production Build & Run:**
   ```bash
   pnpm build
   pnpm start
   ```
   Access the dashboard at `http://127.0.0.1:4330`.

5. **Run as a Service (macOS LaunchAgent):**
   Install and run AIBOSS Office as a background daemon with auto-recovery on port 4330:
   ```bash
   ./operations/scripts/service-install.sh
   ./operations/scripts/service-status.sh
   ```
   To uninstall:
   ```bash
   ./operations/scripts/service-uninstall.sh
   ```
   See [operations/README.md](operations/README.md) for detailed service and runner operations.

6. **Fresh Machine Setup (Hướng dẫn cài máy mới):**
   For a comprehensive step-by-step setup guide on a fresh Mac machine, refer to:
   👉 **[operations/README-cai-may-moi.md](operations/README-cai-may-moi.md)** (Tiếng Việt chi tiết: cài đặt Node, pnpm, Claude CLI OAuth, cấu hình ngân sách, khắc phục Session History).

## Repository Structure

- `config/` - Core office configuration (`office.json`).
- `departments/` - Department structures and seats (`departments/marketing/seats/<seat_id>/`).
- `data/` - Static seat and department manifests (`seats.json`, `departments.json`).
- `packs/` - Operational packs (`core`, `company-facts`, `funnel-method`, `connector-map`, `measurement-budget`).
- `operations/` - Automation scripts, hooks, templates, and runtime state (`data/`).
- `projects/` - Work project containers and active initiatives.
