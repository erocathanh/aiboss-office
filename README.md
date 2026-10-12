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

## Repository Structure

- `config/` - Core office configuration (`office.json`).
- `departments/` - Department structures and seats (`departments/marketing/seats/<seat_id>/`).
- `data/` - Static seat and department manifests (`seats.json`, `departments.json`).
- `packs/` - Operational packs (`core`, `company-facts`, `funnel-method`, `connector-map`, `measurement-budget`).
- `operations/` - Automation scripts, hooks, templates, and runtime state (`data/`).
- `projects/` - Work project containers and active initiatives.
