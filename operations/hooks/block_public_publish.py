#!/usr/bin/env python3
"""Hook 2.1: block_public_publish.py
Hard gate blocking public publishing, customer replies, outbound HTTP writes, and Facebook/Meta token reads:
1. Fail-closed outbound HTTP write gate: blocks any curl/wget/fetch/requests/httpx/axios/urllib write request
   (POST/PUT/DELETE/PATCH or data/form/json payload) unless all destination URLs are static literal URLs
   whose hostname is in the office whitelist (localhost / 127.0.0.1 / ::1 or allowedWriteDomains in config/office.json).
   Dynamic URLs ($VAR, string concatenation) or external hosts (graph.facebook.com, redirectors, etc.) are blocked.
2. Blocks any skill publish/reply/send command (any command with --dong-y, or fanpage/publish skills with write/reply flags even without --dong-y).
3. Blocks reading Facebook/Meta token files (~/.config/aiboss-office/meta-*, ~/.meta-token-fanpage, ~/.fb-user-token-long, .config/opc-business-harness/meta-page-token) via Read/Edit/Write or Bash (cat/python/node/etc.).
4. Inspects script files executed via bash/sh/python/python3/node (up to 200 KB; fail-closed if > 200 KB, dynamic path, or unreadable).
Follows the OPC harness convention: exit 2 with a single-sentence stderr message on block, exit 0 on allow.
"""

from __future__ import annotations

import json
import os
import re
import sys
from urllib.parse import urlparse

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
if HOOKS_DIR not in sys.path:
    sys.path.insert(0, HOOKS_DIR)

import bash_parser
import office_root

HOOK_NAME = "block_public_publish"
MAX_SCRIPT_INSPECT_BYTES = 200 * 1024
MAX_SCRIPT_DEPTH = 4

DEFAULT_ALLOWED_WRITE_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}

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

WGET_WRITE_PATTERNS = [
    re.compile(r"--post-(?:data|file)\b", re.I),
    re.compile(r"--body-(?:data|file)\b", re.I),
    re.compile(r"--method[\s=]+['\"]?(?:POST|PUT|DELETE|PATCH)\b", re.I),
]

CODE_HTTP_WRITE_PATTERNS = [
    re.compile(r"\b(?:requests|httpx|axios|got)\s*\.\s*(?:post|put|delete|patch)\s*\(", re.I),
    re.compile(r"\b(?:urllib\.request\.)?(?:Request|urlopen)\s*\([^)]*\b(?:data|method)\s*=", re.I),
    re.compile(r"\bfetch\s*\([^)]*method\s*:\s*['\"](?:POST|PUT|DELETE|PATCH)['\"]", re.I),
    re.compile(r"\.request\s*\(\s*['\"](?:POST|PUT|DELETE|PATCH)['\"]", re.I),
]

GRAPH_SPECIFIC_MUTATION_PATTERNS = [
    re.compile(r"\b(?:daily_budget|lifetime_budget)\b", re.I),
    re.compile(r"\bstatus\s*[=:]\s*['\"]?(?:PAUSED|ACTIVE|ARCHIVED|DELETED)\b", re.I),
    re.compile(r"(?:batch\s*=|relative_url)", re.I),
]

URL_CONCAT_PATTERNS = [
    re.compile(r"""['"]https?://[^'"]*['"]\s*\+""", re.I),
    re.compile(r"""\+\s*['"][^'"]*(?:facebook\.com|fb\.com|graph\.)""", re.I),
    re.compile(r"""['"]https?://['"]\s*\+""", re.I),
]

STATIC_URL_RE = re.compile(r"https?://[^\s'\"`<>)\]]+", re.I)

SKILL_SCRIPTS = (
    "doc-comment-fanpage",
    "doc-comment.py",
    "tra-loi-inbox-fanpage",
    "inbox.py",
    "dang-bai-fanpage",
)

SKILL_WRITE_FLAGS = re.compile(
    r"(?:^|[\s'\"=])--(?:dong-y|tra-loi|gui|gui-tin|dang|dang-bai|binh-luan|xoa|an|reply|send|publish|post)\b"
)


def is_hook_2_1_disabled() -> bool:
    """F3b: AIBOSS_DISABLE_HOOK_2_1=1 only works when AIBOSS_TEST_MODE=1 and NODE_ENV != 'production'."""
    return (
        os.environ.get("AIBOSS_DISABLE_HOOK_2_1") == "1"
        and os.environ.get("AIBOSS_TEST_MODE") == "1"
        and os.environ.get("NODE_ENV", "").strip().lower() != "production"
    )


def load_allowed_write_hosts(project_dir: str) -> set[str]:
    hosts = set(DEFAULT_ALLOWED_WRITE_HOSTS)
    if not project_dir:
        return hosts
    cfg_path = os.path.join(project_dir, "config", "office.json")
    if os.path.isfile(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            extra = cfg.get("allowedWriteDomains") or cfg.get("allowed_write_domains") or []
            if isinstance(extra, list):
                for item in extra:
                    if isinstance(item, str) and item.strip():
                        hosts.add(item.strip().lower())
        except Exception:
            pass
    return hosts


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


def is_http_write_command(cmd: str) -> bool:
    if re.search(r"\bcurl\b", cmd) and is_curl_write(cmd):
        return True
    if re.search(r"\bwget\b", cmd) and any(p.search(cmd) for p in WGET_WRITE_PATTERNS):
        return True
    for pat in CODE_HTTP_WRITE_PATTERNS:
        if pat.search(cmd):
            return True
    return False


def check_outbound_http_write(cmd: str, allowed_hosts: set[str]) -> str:
    """F3a: Fail-closed outbound HTTP write verification."""
    low = cmd.lower()

    # Check specific Meta Graph mutations even if disguised
    if any(d in low for d in GRAPH_DOMAINS):
        if is_curl_write(cmd) or any(p.search(cmd) for p in CODE_HTTP_WRITE_PATTERNS) or any(p.search(cmd) for p in GRAPH_SPECIFIC_MUTATION_PATTERNS):
            return "Writing or posting to Meta Graph API (POST/DELETE/PUT or data/form payload) is blocked by Hook 2.1."

    if not is_http_write_command(cmd):
        return ""

    # Block string concatenation of URLs in write requests
    for pat in URL_CONCAT_PATTERNS:
        if pat.search(cmd):
            return "Outbound HTTP write with dynamically concatenated URL is blocked fail-closed by Hook 2.1."

    urls = STATIC_URL_RE.findall(cmd)
    if not urls:
        return "Outbound HTTP write without a static literal whitelisted URL is blocked fail-closed by Hook 2.1."

    for raw_url in urls:
        clean_url = raw_url.rstrip(".,;:")
        if "$" in clean_url or "`" in clean_url or "{" in clean_url or "}" in clean_url:
            return f"Outbound HTTP write with dynamic variable in URL ({clean_url}) is blocked fail-closed by Hook 2.1."
        try:
            parsed = urlparse(clean_url)
            host = (parsed.hostname or "").lower()
        except Exception:
            host = ""
        if not host:
            return f"Outbound HTTP write with unparseable URL ({clean_url}) is blocked fail-closed by Hook 2.1."
        if host in GRAPH_DOMAINS or any(host.endswith("." + d) for d in GRAPH_DOMAINS):
            return "Writing or posting to Meta Graph API (POST/DELETE/PUT or data/form payload) is blocked by Hook 2.1."
        if host not in allowed_hosts:
            return f"Outbound HTTP write to non-whitelisted host '{host}' is blocked fail-closed by Hook 2.1."

    return ""


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


def extract_candidate_script_paths(sc: bash_parser.SimpleCommand) -> list[str]:
    """Extract script file paths invoked by bash/sh/python/python3/node or direct ./script execution."""
    exe = sc.executable
    words = sc.words
    if not words:
        return []

    candidates: list[str] = []
    interpreters = {"bash", "sh", "zsh", "ksh", "dash", "python", "python3", "py", "node"}

    if exe in interpreters:
        i = 1
        while i < len(words):
            w = words[i]
            # Inline code flags (-c, -e, -lc, etc.) or module flag (-m): no script file positional arg
            if w in ("-c", "-e", "-m", "--eval", "--print", "-p") or (
                exe in ("bash", "sh", "zsh", "ksh", "dash") and w.startswith("-") and "c" in w
            ):
                return candidates
            if w in ("--import", "-r", "--require", "-W", "-X") and i + 1 < len(words):
                i += 2
                continue
            if w == "-":
                return candidates
            if w.startswith("-"):
                i += 1
                continue
            candidates.append(w)
            break
    else:
        raw_exe = sc.raw_executable.strip("'\"")
        if (
            raw_exe.startswith("./")
            or raw_exe.startswith("../")
            or raw_exe.endswith((".sh", ".py", ".js", ".mjs", ".cjs"))
        ):
            candidates.append(raw_exe)

    return candidates


def is_exempt_readonly_script(script_arg: str, full_cmd: str) -> bool:
    clean_arg = script_arg.strip("'\"")
    base = os.path.basename(clean_arg)
    if base == "fetch_page_messages.py":
        if not SKILL_WRITE_FLAGS.search(full_cmd):
            return True
    if any(s in clean_arg for s in SKILL_SCRIPTS):
        if not SKILL_WRITE_FLAGS.search(full_cmd):
            return True
    return False


def check_command_text(
    raw_cmd: str,
    cwd: str,
    project_dir: str,
    allowed_hosts: set[str],
    depth: int = 0,
    visited_files: set[str] | None = None,
) -> str:
    if depth > MAX_SCRIPT_DEPTH:
        return "Script recursion depth exceeded; blocked fail-closed by Hook 2.1."

    if visited_files is None:
        visited_files = set()

    if not raw_cmd or not raw_cmd.strip():
        return ""

    cmd = re.sub(r"\\\s*\n", " ", raw_cmd)
    stripped = cmd.strip()

    # Allow pure single-line echo/printf without redirections or subshells
    if (
        "\n" not in raw_cmd
        and re.match(r"^(?:echo|printf)\b", stripped)
        and not any(op in stripped for op in (">", "|", ";", "&&", "||", "`", "$("))
    ):
        return ""

    # 1. Check for Facebook/Meta token file reads in command text (including heredocs)
    if has_fb_token_path(raw_cmd) or has_fb_token_path(cmd):
        if "fetch_page_messages.py" not in cmd:
            return "Reading or accessing Facebook/Meta token files via Bash/Python/Node is blocked by Hook 2.1."

    # 2. Check for --dong-y flag or fanpage skill publish/reply/send flags (with or without --dong-y)
    if re.search(r"(?:^|[\s'\"=])--dong-y(?=$|[\s'\"])", cmd) or re.search(r"(?:^|[\s'\"=])--dong-y(?=$|[\s'\"])", raw_cmd):
        return "Executing a publish or customer-reply command with --dong-y is blocked for office seats by Hook 2.1."

    if (any(s in cmd for s in SKILL_SCRIPTS) or any(s in raw_cmd for s in SKILL_SCRIPTS)) and (
        SKILL_WRITE_FLAGS.search(cmd) or SKILL_WRITE_FLAGS.search(raw_cmd)
    ):
        return "Calling a fanpage or inbox skill with publish/reply/send flags is blocked for office seats by Hook 2.1."

    # 3. Check outbound HTTP writes on full command text (and heredocs)
    http_violation = check_outbound_http_write(cmd, allowed_hosts)
    if http_violation:
        return http_violation
    if raw_cmd != cmd:
        http_violation_raw = check_outbound_http_write(raw_cmd, allowed_hosts)
        if http_violation_raw:
            return http_violation_raw

    # 4. Parse bash commands to inspect sub-commands, heredocs, and executed script files
    try:
        commands, _ = bash_parser.parse_bash_script(raw_cmd, cwd)
    except bash_parser.BashParseError as e:
        return f"Bash syntax error in Hook 2.1 ({e}); blocking fail-closed."

    for sc in commands:
        sc_violation = check_outbound_http_write(sc.raw_str, allowed_hosts)
        if sc_violation:
            return sc_violation

        for hd_body in getattr(sc, "heredoc_bodies", []):
            hd_violation = check_command_text(hd_body, sc.cwd, project_dir, allowed_hosts, depth + 1, visited_files)
            if hd_violation:
                return hd_violation

        for script_arg in extract_candidate_script_paths(sc):
            if is_exempt_readonly_script(script_arg, raw_cmd):
                continue

            clean_script = script_arg.strip("'\"")
            if "$" in clean_script or "`" in clean_script:
                return f"Executing script via dynamic path ({script_arg}) is blocked fail-closed by Hook 2.1."

            resolved_script = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(clean_script)))
            real_script = os.path.realpath(resolved_script)
            if real_script in visited_files:
                continue

            if os.path.lexists(resolved_script):
                if not os.path.isfile(real_script):
                    return f"Script target '{clean_script}' is not a regular readable file; blocked fail-closed by Hook 2.1."
                try:
                    file_size = os.path.getsize(real_script)
                except OSError as e:
                    return f"Cannot stat script '{clean_script}' ({e}); blocked fail-closed by Hook 2.1."
                if file_size > MAX_SCRIPT_INSPECT_BYTES:
                    return f"Script '{clean_script}' ({file_size} bytes) exceeds 200 KB inspection limit; blocked fail-closed by Hook 2.1."
                try:
                    with open(real_script, "r", encoding="utf-8", errors="replace") as sf:
                        script_content = sf.read()
                except OSError as e:
                    return f"Cannot read script '{clean_script}' ({e}); blocked fail-closed by Hook 2.1."

                visited_files.add(real_script)
                sub_violation = check_command_text(
                    script_content,
                    os.path.dirname(real_script),
                    project_dir,
                    allowed_hosts,
                    depth + 1,
                    visited_files,
                )
                if sub_violation:
                    return sub_violation

    return ""


def check_public_publish(tool_name: str, tool_input: dict, cwd: str = "") -> str:
    if is_hook_2_1_disabled():
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

    effective_cwd = cwd or os.getcwd()
    project_dir = office_root.find_office_root(effective_cwd)
    allowed_hosts = load_allowed_write_hosts(project_dir)

    return check_command_text(raw_cmd, effective_cwd, project_dir, allowed_hosts, depth=0)


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

