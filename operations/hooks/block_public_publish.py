#!/usr/bin/env python3
"""Hook 2.1: block_public_publish.py
Hard gate blocking public publishing, customer replies, Graph API writes, and Facebook/Meta token reads:
1. Blocks any write request to Meta Graph API (graph.facebook.com / graph-video.facebook.com with POST/DELETE/PUT or write data).
2. Blocks any skill publish/reply/send command (any command with --dong-y, or fanpage/publish skills with write/reply flags even without --dong-y).
3. Blocks reading Facebook/Meta token files (~/.config/aiboss-office/meta-*, ~/.meta-token-fanpage, ~/.fb-user-token-long, .config/opc-business-harness/meta-page-token) via Read/Edit/Write or Bash (cat/python/node/etc.).
Follows the OPC harness convention: exit 2 with a single-sentence stderr message on block, exit 0 on allow.
"""

import json
import os
import re
import sys

HOOK_NAME = "block_public_publish"

FB_TOKEN_PATTERNS = [
    re.compile(r"(?:^|[/\s'\"`=:(])(?:\.meta-token-fanpage|\.fb-user-token(?:-long)?)\b"),
    re.compile(r"\.config/aiboss-office/meta-[A-Za-z0-9_.-]*"),
    re.compile(r"\.config/opc-business-harness/meta-page-token\b"),
    re.compile(r"(?:^|[/\s'\"`=:(])meta-page-token\b"),
]

GRAPH_DOMAINS = ("graph.facebook.com", "graph-video.facebook.com")

CURL_ALWAYS_WRITE_FLAGS = [
    re.compile(r"-X\s*['\"]?(?:POST|PUT|DELETE|PATCH)\b", re.I),
    re.compile(r"--request[\s=]+['\"]?(?:POST|PUT|DELETE|PATCH)\b", re.I),
    re.compile(r"(?:^|\s)-[A-Za-z]*[FTK](?:\b|@|'|\")"),
    re.compile(r"--(?:form|form-[\w-]+|json|upload-file|config)\b", re.I),
    re.compile(r"[?&]method=(?:post|put|delete|patch)\b", re.I),
]

CURL_DATA_FLAGS = [
    re.compile(r"(?:^|\s)-[A-Za-z]*d(?:\b|@|'|\")"),
    re.compile(r"--(?:data|data-[\w-]+)\b", re.I),
]

CURL_GET_FLAG = re.compile(r"(?:^|\s)(?:-[A-Za-z]*G\b|--get\b)")
CURL_NEXT_FLAG = re.compile(r"(?:^|\s)(?:--next|-:)\b")

GRAPH_CODE_WRITE_PATTERNS = [
    re.compile(r"\b(?:requests|httpx|axios|got)\s*\.\s*(?:post|put|delete|patch)\s*\(", re.I),
    re.compile(r"\burllib\.request\.(?:Request|urlopen)\s*\([^)]*\b(?:data|method)\s*=", re.I),
    re.compile(r"\bfetch\s*\([^)]*method\s*:\s*['\"](?:POST|PUT|DELETE|PATCH)['\"]", re.I),
    re.compile(r"\b(?:daily_budget|lifetime_budget)\b", re.I),
    re.compile(r"\bstatus\s*[=:]\s*['\"]?(?:PAUSED|ACTIVE|ARCHIVED|DELETED)\b", re.I),
    re.compile(r"(?:batch\s*=|relative_url)", re.I),
]

SKILL_SCRIPTS = (
    "doc-comment-fanpage",
    "doc-comment.py",
    "tra-loi-inbox-fanpage",
    "inbox.py",
    "dang-bai-fanpage",
)

SKILL_WRITE_FLAGS = re.compile(
    r"(?:^|\s)--(?:dong-y|tra-loi|gui|gui-tin|dang|dang-bai|binh-luan|xoa|an|reply|send|publish|post)\b"
)


def is_curl_write(cmd: str) -> bool:
    for pat in CURL_ALWAYS_WRITE_FLAGS:
        if pat.search(cmd):
            return True
    has_data = any(pat.search(cmd) for pat in CURL_DATA_FLAGS)
    if has_data:
        is_get = bool(CURL_GET_FLAG.search(cmd)) and not bool(CURL_NEXT_FLAG.search(cmd))
        if not is_get:
            return True
    return False


def extract_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from extract_strings(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from extract_strings(item)


def has_fb_token_path(text: str) -> bool:
    if not text:
        return False
    for pat in FB_TOKEN_PATTERNS:
        if pat.search(text):
            return True
    return False


def check_public_publish(tool_name: str, tool_input: dict, cwd: str = "") -> str:
    if os.environ.get("AIBOSS_DISABLE_HOOK_2_1") == "1":
        return ""

    # 1. Non-Bash tools (Read, Edit, Write, MultiEdit, NotebookEdit, Grep, Glob) accessing Facebook token files
    if tool_name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Grep", "Glob"):
        for s in extract_strings(tool_input):
            if has_fb_token_path(s):
                return "Accessing Facebook/Meta token files (~/.meta-token-fanpage, ~/.fb-user-token-long, or meta-* credentials) is blocked by Hook 2.1."
        return ""

    if tool_name != "Bash":
        return ""

    raw_cmd = (tool_input or {}).get("command") or ""
    if not raw_cmd or not raw_cmd.strip():
        return ""

    cmd = re.sub(r"\\\s*\n", " ", raw_cmd)
    stripped = cmd.strip()

    # Allow pure echo/printf without redirections
    if re.match(r"^(?:echo|printf)\b", stripped) and not any(op in stripped for op in (">", "|", ";", "&&", "||", "`", "$(")):
        return ""

    # 2. Check for Facebook/Meta token file reads in Bash (cat, open(), readFileSync, redirections, heredocs, etc.)
    if has_fb_token_path(cmd):
        # Allow legacy fetch_page_messages.py check if it's purely the inbox-reader helper (which is separately gated by guard_bulk_send)
        if "fetch_page_messages.py" not in cmd:
            return "Reading or accessing Facebook/Meta token files via Bash/Python/Node is blocked by Hook 2.1."

    # 3. Check for --dong-y flag or fanpage skill publish/reply/send flags (with or without --dong-y)
    if re.search(r"(?:^|[\s'\"=])--dong-y(?=$|[\s'\"])", cmd):
        return "Executing a publish or customer-reply command with --dong-y is blocked for office seats by Hook 2.1."

    if any(s in cmd for s in SKILL_SCRIPTS) and SKILL_WRITE_FLAGS.search(cmd):
        return "Calling a fanpage or inbox skill with publish/reply/send flags is blocked for office seats by Hook 2.1."

    # 4. Check for writes to Meta Graph API (graph.facebook.com / graph-video.facebook.com)
    low = cmd.lower()
    if any(d in low for d in GRAPH_DOMAINS):
        if is_curl_write(cmd):
            return "Writing or posting to Meta Graph API (POST/DELETE/PUT or data/form payload) is blocked by Hook 2.1."
        for pat in GRAPH_CODE_WRITE_PATTERNS:
            if pat.search(cmd):
                return "Writing or mutating Meta Graph API via script/HTTP client is blocked by Hook 2.1."

    return ""


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input or not raw_input.strip():
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] Empty stdin payload; blocking fail-closed.\n")
            sys.exit(2)

        data = json.loads(raw_input)
        if "tool_input" not in data:
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] Missing tool_input in payload; blocking fail-closed.\n")
            sys.exit(2)

        tool_name = data.get("tool_name", "")
        tool_input = data.get("tool_input", {})
        cwd = data.get("cwd", os.getcwd())

        violation = check_public_publish(tool_name, tool_input, cwd)
        if violation:
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] {violation}\n")
            sys.exit(2)

        sys.exit(0)
    except SystemExit:
        raise
    except Exception as e:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] Internal hook error ({e}); blocking fail-closed.\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
