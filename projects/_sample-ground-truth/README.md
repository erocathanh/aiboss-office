# Sample Ground Truth Project (`_sample-ground-truth`)

This directory serves as the immutable reference and ground-truth sample project for AIBOSS Office.

## Directory Structure

- `inputs/`: Read-only raw inputs (e.g. raw message exports, inquiries). Agents are prohibited from modifying files here (enforced by `lock_raw_inputs` hook and settings deny rules).
- `wip/`: Work-in-progress workspace. Drafts and interim working files belong here.
- `outputs/`: Finalized deliverables. Files here (and any files ending in `_final.md`) are immutable once written (enforced by `protect_final_outputs` hook).
- `references/`: Reference documentation, facts, guidelines. Read-only for agents.
- `templates/`: Standard reusable templates. Read-only for agents.

## Safety & Harness Rules

1. **Immunity**: The entire `_sample-ground-truth` project is protected against modification or deletion by safety hooks (`protect_final_outputs.py`).
2. **PII Protection**: Any sensitive Personally Identifiable Information (customer phone numbers, unmasked emails, bank accounts) written outside `inputs/` is blocked by `guard_customer_pii.py`.
3. **Append-Only Channel**: Project activity records in `CHANNEL.md` can only be appended to, never overwritten.
