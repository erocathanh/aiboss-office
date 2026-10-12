# AIBOSS Office

Autonomous AI operations workspace and management interface for AI-powered departments.

## Overview
AIBOSS Office is a standalone workspace platform providing org charts, multi-seat agent orchestration, and execution dashboards for small businesses and agencies.

- **Port:** `http://127.0.0.1:4330`
- **Initial MVP:** Marketing Department (Track A: 8 seats + Owner)
- **Timezone:** Europe/London

## Getting Started

1. **Bootstrap Workspace & Run Health Checks:**
   ```bash
   ./setup.sh
   ```

2. **Start Development Server:**
   ```bash
   pnpm dev
   ```
   Access the dashboard at `http://127.0.0.1:4330`.

3. **Production Build & Run:**
   ```bash
   pnpm build
   pnpm start
   ```

## Repository Structure

- `config/` - Core office configuration (`office.json`).
- `departments/` - Department definitions and org structures (`marketing/`).
- `data/` - Static seat and department manifests (`seats.json`, `departments.json`).
- `agents/` - Execution seats and agent configurations.
- `packs/` - Operational packs (`core`, `company-facts`, `methods`, `connectors`).
- `operations/` - Automation scripts, hooks, templates, and runtime state (`data/`).
- `projects/` - Work project containers and active initiatives.
