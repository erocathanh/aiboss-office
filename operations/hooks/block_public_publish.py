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


def _is_non_readonly_method_spec(options_text: str) -> bool:
    """Return True if options_text specifies an HTTP method that is POST/PUT/DELETE/PATCH or non-readonly."""
    for m in re.finditer(r"\bmethod\s*[:=]\s*(['\"]?[A-Za-z0-9_$.]+['\"]?)", options_text, re.I):
        val = m.group(1).strip().strip("'\"").upper()
        if val not in ("GET", "HEAD", "OPTIONS"):
            return True
    return False


def _find_code_http_write_url_exprs(text: str) -> list[str | None]:
    """
    F19b (S17e): Detect HTTP write calls in Python/JS using balanced parenthesis argument lists
    so nested parentheses in arguments (e.g. `fetch(new URL('/ingest','https://example.net'), {method:'POST',body:'x'})`)
    never truncate detection.
    Returns a list of raw URL argument expressions (or None when an HTTP write call has no extractable URL arg).
    """
    url_exprs: list[str | None] = []

    # 1. Explicit write verbs: requests/httpx/axios/got/client/session . (post|put|delete|patch)(...)
    for call_args in bash_parser._extract_call_arg_lists(
        text, r"\b(?:requests|httpx|axios|got|client|session)\s*\.\s*(?:post|put|delete|patch)\s*\("
    ):
        if not call_args:
            url_exprs.append(None)
            continue
        url_expr = None
        for extra in call_args:
            s_extra = extra.strip()
            if s_extra.startswith("url") and "=" in s_extra:
                url_expr = s_extra.split("=", 1)[1].strip()
                break
        if url_expr is None:
            url_expr = call_args[0].strip()
        url_exprs.append(url_expr or None)

    # 2. (requests|httpx|client|session).request(method, url, ...)
    for call_args in bash_parser._extract_call_arg_lists(
        text, r"\b(?:requests|httpx|client|session)\s*\.\s*request\s*\("
    ):
        if not call_args:
            continue
        method_arg = call_args[0].strip().strip("'\"").upper()
        rest_text = " , ".join(call_args[1:])
        is_write = method_arg not in ("GET", "HEAD", "OPTIONS") or bool(
            re.search(r"\b(?:data|json|files|content)\s*=", rest_text)
        )
        if not is_write:
            continue
        url_expr = None
        for extra in call_args:
            s_extra = extra.strip()
            if s_extra.startswith("url") and "=" in s_extra:
                url_expr = s_extra.split("=", 1)[1].strip()
                break
        if url_expr is None and len(call_args) >= 2:
            url_expr = call_args[1].strip()
        url_exprs.append(url_expr or None)

    # 3. fetch(resource, options?) — inspect balanced args so new URL(...) in arg 0 never breaks parsing
    for call_args in bash_parser._extract_call_arg_lists(text, r"\bfetch\s*\("):
        if not call_args:
            continue
        first_arg = call_args[0].strip()
        opts_text = " , ".join(call_args[1:])
        combined_opts = f"{first_arg} , {opts_text}" if first_arg.startswith("new Request") else opts_text
        has_write_method = _is_non_readonly_method_spec(combined_opts)
        has_body = bool(
            re.search(r"\bbody\s*:", combined_opts)
            or re.search(r"\{\s*(?:[A-Za-z0-9_]+\s*,\s*)*body\s*(?:,|\})", combined_opts)
        )
        if has_write_method or has_body:
            url_exprs.append(first_arg or None)

    # 4. axios(config_or_url, config?) / axios.request(config)
    for call_args in bash_parser._extract_call_arg_lists(
        text, r"\baxios(?:\s*\.\s*request)?\s*\("
    ):
        if not call_args:
            continue
        joined_args = " , ".join(call_args)
        has_write = _is_non_readonly_method_spec(joined_args) or bool(
            re.search(r"\b(?:data|body)\s*:", joined_args)
        )
        if not has_write:
            continue
        first_arg = call_args[0].strip()
        if first_arg.startswith("{"):
            m_url = re.search(r"\burl\s*:\s*([^,}]+)", first_arg)
            url_exprs.append(m_url.group(1).strip() if m_url else None)
        else:
            url_exprs.append(first_arg or None)

    # 5. Node http.request(...) / https.request(...)
    for call_args in bash_parser._extract_call_arg_lists(
        text, r"\bhttps?\s*\.\s*request\s*\("
    ):
        if not call_args:
            url_exprs.append(None)
            continue
        joined_args = " , ".join(call_args)
        explicit_readonly = bool(
            re.search(r"\bmethod\s*:\s*['\"](?:GET|HEAD|OPTIONS)['\"]", joined_args, re.I)
        ) and not bool(re.search(r"\.write\s*\(", text))
        if explicit_readonly:
            continue
        first_arg = call_args[0].strip()
        url_exprs.append(first_arg or None)

    # 6. Python urllib.request.Request(...) / urlopen(...)
    for call_args in bash_parser._extract_call_arg_lists(
        text, r"\b(?:urllib\.request\.)?(?:Request|urlopen)\s*\("
    ):
        if not call_args:
            continue
        joined_args = " , ".join(call_args)
        has_kw_write = _is_non_readonly_method_spec(joined_args) or bool(
            re.search(r"\bdata\s*=", joined_args)
        )
        has_pos_data = False
        if len(call_args) >= 2:
            second = call_args[1].strip()
            if second != "None" and not re.match(r"^(?:timeout|cafile|capath|cadefault|context|headers|origin_req_host|unverifiable)\s*=", second):
                has_pos_data = True
        if has_kw_write or has_pos_data:
            url_expr = None
            for extra in call_args:
                s_extra = extra.strip()
                if s_extra.startswith("url") and "=" in s_extra:
                    url_expr = s_extra.split("=", 1)[1].strip()
                    break
            if url_expr is None:
                url_expr = call_args[0].strip()
            url_exprs.append(url_expr or None)

    return url_exprs


def has_code_http_write(cmd: str) -> bool:
    if any(p.search(cmd) for p in CODE_HTTP_WRITE_PATTERNS):
        return True
    return len(_find_code_http_write_url_exprs(cmd)) > 0


def is_http_write_command(cmd: str) -> bool:
    if re.search(r"\bcurl\b", cmd) and is_curl_write(cmd):
        return True
    if re.search(r"\bwget\b", cmd) and any(p.search(cmd) for p in WGET_WRITE_PATTERNS):
        return True
    if has_code_http_write(cmd):
        return True
    return False


CURL_FLAGS_WITH_VALUE = {
    "-X", "--request",
    "-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode",
    "-F", "--form", "--form-string", "--json",
    "-H", "--header",
    "-u", "--user",
    "-A", "--user-agent",
    "-e", "--referer",
    "-o", "--output",
    "-T", "--upload-file",
    "-b", "--cookie",
    "-c", "--cookie-jar",
    "-D", "--dump-header",
    "-w", "--write-out",
    "-m", "--max-time", "--connect-timeout",
    "-x", "--proxy",
    "--resolve", "--cacert", "--cert", "--key", "--proto",
}

WGET_FLAGS_WITH_VALUE = {
    "--post-data", "--post-file", "--body-data", "--body-file", "--method",
    "--header", "-O", "--output-document", "-o", "--output-file",
    "-P", "--directory-prefix", "-U", "--user-agent", "--referer",
    "-T", "--timeout", "-t", "--tries",
}

_STRICT_STATIC_URL_LITERAL_RE = re.compile(r"""^(['"])(https?://[^'"$`{}\s]+)\1$""")


def _validate_static_target_url(raw_url: str, allowed_hosts: set[str]) -> str:
    clean_url = (raw_url or "").strip().strip("'\"").rstrip(".,;:")
    if (
        not clean_url
        or any(ch in clean_url for ch in ("$", "`", "{", "}", "\n", "\r", " ", "\t"))
        or not clean_url.lower().startswith(("http://", "https://"))
    ):
        return f"Outbound HTTP write with dynamic or non-literal target URL ({raw_url}) is blocked fail-closed by Hook 2.1."
    try:
        parsed = urlparse(clean_url)
        host = (parsed.hostname or "").lower()
    except Exception:
        host = ""
    if not host:
        return f"Outbound HTTP write with unparseable target URL ({clean_url}) is blocked fail-closed by Hook 2.1."
    if host in GRAPH_DOMAINS or any(host.endswith("." + d) for d in GRAPH_DOMAINS):
        return "Writing or posting to Meta Graph API (POST/DELETE/PUT or data/form payload) is blocked by Hook 2.1."
    if host not in allowed_hosts:
        return f"Outbound HTTP write to non-whitelisted host '{host}' is blocked fail-closed by Hook 2.1."
    return ""


def _extract_curl_target_urls(words: list[str]) -> tuple[list[str], str]:
    urls: list[str] = []
    i = 1
    n = len(words)
    while i < n:
        w = words[i]
        if w in ("-K", "--config") or w.startswith("-K") or w.startswith("--config="):
            return ([], "Outbound HTTP write using curl -K/--config is blocked fail-closed by Hook 2.1.")
        if w == "--url":
            if i + 1 >= n:
                return ([], "Outbound HTTP write with missing --url value is blocked fail-closed by Hook 2.1.")
            urls.append(words[i + 1])
            i += 2
            continue
        if w.startswith("--url="):
            urls.append(w.split("=", 1)[1])
            i += 1
            continue
        if w in CURL_FLAGS_WITH_VALUE:
            i += 2
            continue
        if w.startswith("-"):
            i += 1
            continue
        urls.append(w)
        i += 1
    return (urls, "")


def _extract_wget_target_urls(words: list[str]) -> tuple[list[str], str]:
    urls: list[str] = []
    i = 1
    n = len(words)
    while i < n:
        w = words[i]
        if w in ("-i", "--input-file") or w.startswith("--input-file="):
            return ([], "Outbound HTTP write using wget -i/--input-file is blocked fail-closed by Hook 2.1.")
        if w in WGET_FLAGS_WITH_VALUE:
            i += 2
            continue
        if w.startswith("-"):
            i += 1
            continue
        urls.append(w)
        i += 1
    return (urls, "")


def _extract_code_http_write_target_urls(text: str) -> tuple[list[str], str]:
    urls: list[str] = []
    raw_exprs = _find_code_http_write_url_exprs(text)
    if not raw_exprs:
        return ([], "Outbound HTTP write without resolvable target URL argument is blocked fail-closed by Hook 2.1.")
    for url_expr in raw_exprs:
        if not url_expr:
            return ([], "Outbound HTTP write without target URL argument is blocked fail-closed by Hook 2.1.")
        m = _STRICT_STATIC_URL_LITERAL_RE.match(url_expr)
        if not m:
            return ([], f"Outbound HTTP write with dynamic or concatenated target URL ({url_expr}) is blocked fail-closed by Hook 2.1.")
        urls.append(m.group(2))
    return (urls, "")


def check_outbound_http_write_text(cmd: str, allowed_hosts: set[str]) -> str:
    """F3a, F9a & F19b: Fail-closed outbound HTTP write verification on command/script text."""
    low = cmd.lower()

    # Check specific Meta Graph mutations even if disguised
    if any(d in low for d in GRAPH_DOMAINS):
        if is_curl_write(cmd) or has_code_http_write(cmd) or any(p.search(cmd) for p in GRAPH_SPECIFIC_MUTATION_PATTERNS):
            return "Writing or posting to Meta Graph API (POST/DELETE/PUT or data/form payload) is blocked by Hook 2.1."

    # Block string concatenation of URLs in write requests
    if is_http_write_command(cmd):
        for pat in URL_CONCAT_PATTERNS:
            if pat.search(cmd):
                return "Outbound HTTP write with dynamically concatenated URL is blocked fail-closed by Hook 2.1."

    if has_code_http_write(cmd):
        urls, err = _extract_code_http_write_target_urls(cmd)
        if err:
            return err
        if not urls:
            return "Outbound HTTP write without a static literal whitelisted target URL is blocked fail-closed by Hook 2.1."
        for u in urls:
            v = _validate_static_target_url(u, allowed_hosts)
            if v:
                return v

    return ""


def check_sc_outbound_http_write(sc: bash_parser.SimpleCommand, allowed_hosts: set[str]) -> str:
    """F9a & F15a: Verify the actual positional target URL of curl/wget/fetch/requests on a parsed SimpleCommand."""
    text_v = check_outbound_http_write_text(sc.raw_str, allowed_hosts)
    if text_v:
        return text_v

    exe = sc.executable
    is_sc_curl_write = exe == "curl" and is_curl_write(sc.raw_str)
    is_sc_wget_write = exe == "wget" and any(p.search(sc.raw_str) for p in WGET_WRITE_PATTERNS)

    if getattr(sc, "via_xargs", False) and (is_sc_curl_write or is_sc_wget_write or is_http_write_command(sc.raw_str)):
        return "Outbound HTTP write via xargs (dynamic stdin target/arguments) is blocked fail-closed by Hook 2.1."

    if is_sc_curl_write:
        urls, err = _extract_curl_target_urls(sc.words)
        if err:
            return err
        if not urls:
            return "Outbound curl write without a positional or --url target URL is blocked fail-closed by Hook 2.1."
        for u in urls:
            v = _validate_static_target_url(u, allowed_hosts)
            if v:
                return v

    if is_sc_wget_write:
        urls, err = _extract_wget_target_urls(sc.words)
        if err:
            return err
        if not urls:
            return "Outbound wget write without a positional target URL is blocked fail-closed by Hook 2.1."
        for u in urls:
            v = _validate_static_target_url(u, allowed_hosts)
            if v:
                return v

    for hd_body in getattr(sc, "heredoc_bodies", []):
        hd_v = check_outbound_http_write_text(hd_body, allowed_hosts)
        if hd_v:
            return hd_v

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


TRUSTED_EXEMPT_SKILL_RELPATHS = (
    "doc-comment-fanpage/scripts/doc-comment.py",
    "tra-loi-inbox-fanpage/scripts/inbox.py",
    "dang-bai-fanpage/scripts/dang-bai.py",
)


def _has_symlink_between(base_dir: str, target_path: str) -> bool:
    """Return True if target_path or any component between base_dir and target_path is a symlink."""
    norm_base = os.path.normpath(base_dir)
    norm_target = os.path.normpath(target_path)
    try:
        rel = os.path.relpath(norm_target, norm_base)
    except ValueError:
        return True
    if rel == ".." or rel.startswith(".." + os.sep):
        return True
    cur = norm_base
    if os.path.islink(cur):
        return True
    if rel == ".":
        return False
    for part in rel.split(os.sep):
        cur = os.path.join(cur, part)
        if os.path.islink(cur):
            return True
    return False


def _matches_trusted_script_containment(resolved: str, base_root: str, trusted_dir_rel: str, script_rel: str) -> bool:
    """
    F15b: Verify that:
    1. No path component from base_root down to the script is a symlink.
    2. The realpath of resolved lies strictly inside the realpath of the trusted directory
       (<REPO_ROOT>/tools/inbox-reader or $HOME/.claude/skills/<skill>/scripts), which itself
       lies strictly inside realpath(base_root).
    """
    if not base_root:
        return False
    norm_root = os.path.normpath(os.path.expanduser(base_root))
    real_root = os.path.realpath(norm_root)

    expected_norm = os.path.normpath(os.path.join(norm_root, script_rel))
    expected_real = os.path.normpath(os.path.join(real_root, script_rel))
    if resolved not in (expected_norm, expected_real):
        return False

    if _has_symlink_between(norm_root, expected_norm) or _has_symlink_between(real_root, expected_real):
        return False

    trusted_dir_norm = os.path.normpath(os.path.join(norm_root, trusted_dir_rel))
    expected_trusted_dir_real = os.path.normpath(os.path.join(real_root, trusted_dir_rel))
    actual_trusted_dir_real = os.path.realpath(trusted_dir_norm)
    if actual_trusted_dir_real != expected_trusted_dir_real:
        return False

    real_p = os.path.realpath(resolved)
    if real_p != expected_real:
        return False

    try:
        if os.path.commonpath([real_p, expected_trusted_dir_real]) != expected_trusted_dir_real:
            return False
        if os.path.commonpath([real_p, real_root]) != real_root:
            return False
    except ValueError:
        return False

    return True


def is_exempt_readonly_script(script_arg: str, cwd: str, project_dir: str, full_cmd: str) -> bool:
    """
    F9b & F15b: Exempt a read-only skill script ONLY when its resolved path and realpath are
    strictly contained within the trusted office directory (<REPO_ROOT>/tools/inbox-reader or
    $HOME/.claude/skills/<3 skills>/scripts) and no component along the path is a symlink.
    """
    if SKILL_WRITE_FLAGS.search(full_cmd) or re.search(r"(?:^|[\s'\"=])--dong-y(?=$|[\s'\"])", full_cmd):
        return False

    clean_arg = (script_arg or "").strip("'\"")
    if not clean_arg or "$" in clean_arg or "`" in clean_arg:
        return False

    base_cwd = cwd or project_dir or os.getcwd()
    resolved = os.path.normpath(os.path.join(base_cwd, os.path.expanduser(clean_arg)))
    if os.path.islink(resolved):
        return False

    if project_dir and _matches_trusted_script_containment(
        resolved,
        project_dir,
        os.path.join("tools", "inbox-reader"),
        os.path.join("tools", "inbox-reader", "fetch_page_messages.py"),
    ):
        return True

    home_dir = os.path.expanduser("~")
    for rel_skill in TRUSTED_EXEMPT_SKILL_RELPATHS:
        skill_dir_rel = os.path.join(".claude", "skills", os.path.dirname(rel_skill))
        script_rel = os.path.join(".claude", "skills", rel_skill)
        if _matches_trusted_script_containment(resolved, home_dir, skill_dir_rel, script_rel):
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
        return "Reading or accessing Facebook/Meta token files via Bash/Python/Node is blocked by Hook 2.1."

    # 2. Check for --dong-y flag or fanpage skill publish/reply/send flags (with or without --dong-y)
    if re.search(r"(?:^|[\s'\"=])--dong-y(?=$|[\s'\"])", cmd) or re.search(r"(?:^|[\s'\"=])--dong-y(?=$|[\s'\"])", raw_cmd):
        return "Executing a publish or customer-reply command with --dong-y is blocked for office seats by Hook 2.1."

    if (any(s in cmd for s in SKILL_SCRIPTS) or any(s in raw_cmd for s in SKILL_SCRIPTS)) and (
        SKILL_WRITE_FLAGS.search(cmd) or SKILL_WRITE_FLAGS.search(raw_cmd)
    ):
        return "Calling a fanpage or inbox skill with publish/reply/send flags is blocked for office seats by Hook 2.1."

    # 3. Check outbound HTTP writes on full command text (and heredocs)
    http_violation = check_outbound_http_write_text(cmd, allowed_hosts)
    if http_violation:
        return http_violation
    if raw_cmd != cmd:
        http_violation_raw = check_outbound_http_write_text(raw_cmd, allowed_hosts)
        if http_violation_raw:
            return http_violation_raw

    # 4. Parse bash commands to inspect sub-commands, heredocs, and executed script files
    try:
        commands, _ = bash_parser.parse_bash_script(raw_cmd, cwd)
    except bash_parser.BashParseError as e:
        return f"Bash syntax error in Hook 2.1 ({e}); blocking fail-closed."

    for sc in commands:
        sc_violation = check_sc_outbound_http_write(sc, allowed_hosts)
        if sc_violation:
            return sc_violation

        for hd_body in getattr(sc, "heredoc_bodies", []):
            hd_violation = check_command_text(hd_body, sc.cwd, project_dir, allowed_hosts, depth + 1, visited_files)
            if hd_violation:
                return hd_violation

        for script_arg in extract_candidate_script_paths(sc):
            if is_exempt_readonly_script(script_arg, sc.cwd, project_dir, raw_cmd):
                continue

            clean_script = script_arg.strip("'\"")
            if "$" in clean_script or "`" in clean_script:
                return f"Executing script via dynamic path ({script_arg}) is blocked fail-closed by Hook 2.1."

            resolved_script = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(clean_script)))
            if not os.path.lexists(resolved_script):
                return f"Script target '{clean_script}' does not exist at '{resolved_script}'; blocked fail-closed by Hook 2.1."

            real_script = os.path.realpath(resolved_script)
            if real_script in visited_files:
                continue

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
            # F9c: Relative script calls inside a script resolve against the command's cwd (sc.cwd), not dirname(real_script)
            sub_violation = check_command_text(
                script_content,
                sc.cwd,
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

