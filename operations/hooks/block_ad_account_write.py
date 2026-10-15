#!/usr/bin/env python3
"""Hook: block_ad_account_write.py
Blocks ad-account write operations to Meta Graph API and Google Ads API at the seat level.
Follows the OPC harness convention: exit 2 with a single-sentence stderr message on block, exit 0 on allow.
Verified against PCN's 15-case standard (do_hook_quang_cao.py).
"""

import json
import re
import sys

HOOK_NAME = "block_ad_account_write"

ADS_DOMAINS = (
    "graph.facebook.com",
    "graph-video.facebook.com",
    "facebook_business",
    "facebookads",
    "googleads.googleapis.com",
    "google.ads.googleads",
    "googleadsclient",
)

CURL_ALWAYS_WRITE_FLAGS = [
    re.compile(r"-X\s*['\"]?(?:POST|PUT|DELETE|PATCH)\b", re.I),
    re.compile(r"--request[\s=]+['\"]?(?:POST|PUT|DELETE|PATCH)\b", re.I),
    re.compile(r"(?:^|\s)-[A-Za-z]*[FT](?:\b|@|'|\")"),
    re.compile(r"--(?:form|form-[\w-]+|json|upload-file)\b", re.I),
    re.compile(r"[?&]method=(?:post|put|delete|patch)\b", re.I),
]

CURL_DATA_FLAGS = [
    re.compile(r"(?:^|\s)-[A-Za-z]*d(?:\b|@|'|\")"),
    re.compile(r"--(?:data|data-[\w-]+)\b", re.I),
]

CURL_GET_FLAG = re.compile(r"(?:^|\s)(?:-[A-Za-z]*G\b|--get\b)")
CURL_NEXT_FLAG = re.compile(r"(?:^|\s)(?:--next|-:)\b")

CODE_WRITE_PATTERNS = [
    re.compile(r"\brequests\s*\.\s*(?:post|put|delete|patch|request)\s*\(", re.I),
    re.compile(r"\b(?:httpx|axios|got)\s*\.\s*(?:post|put|delete|patch)\s*\(", re.I),
    re.compile(r"\burllib\.request\.(?:Request|urlopen)\s*\([^)]*\b(?:data|method)\s*=", re.I),
    re.compile(r"\bfetch\s*\([^)]*method\s*:\s*['\"](?:POST|PUT|DELETE|PATCH)['\"]", re.I),
    re.compile(r"\b(?:daily_budget|lifetime_budget|adset_budgets)\b", re.I),
    re.compile(r"\bstatus\s*[=:]\s*['\"]?(?:PAUSED|ACTIVE|ARCHIVED|DELETED)\b", re.I),
    re.compile(r"\b(?:create_campaign|create_ad_set|create_ad|update_campaign|delete_campaign)\b", re.I),
]


AD_TARGET_MARKERS = re.compile(
    r"act_\d+"
    r"|/(?:campaigns|adsets|ads|adcreatives|adimages|advideos|customaudiences|adrules_library|adspixels|ad_studies|adlabels|copies)\b"
    r"|\b(?:daily_budget|lifetime_budget|spend_cap|bid_amount|bid_strategy|optimization_goal|billing_event|special_ad_categories|promoted_object|campaign_id|adset_id|creative_id|targeting|objective)\b"
    r"|\bstatus['\"]?\s*[:=]\s*['\"]?(?:ACTIVE|PAUSED|ARCHIVED|DELETED)\b"
    r"|graph(?:-video)?\.facebook\.com/(?:v\d+(?:\.\d+)?/)?\d{5,}/?(?=$|[?#'\"\s\\)])",
    re.I,
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


def is_ads_mcp_write(tool_name: str) -> bool:
    low = (tool_name or "").lower()
    if not (low.startswith("mcp__") or low.startswith("mcp_")):
        return False
    if "ads" not in low and "adwords" not in low and "admanager" not in low:
        return False
    write_verbs = (
        "create", "update", "delete", "pause", "enable", "mutate",
        "set", "remove", "post", "add", "budget", "status",
    )
    return any(v in low for v in write_verbs)


def check_ad_account_write(tool_name: str, tool_input: dict) -> str:
    if is_ads_mcp_write(tool_name):
        return f"Ad-account MCP write tool ({tool_name}) is blocked by the office safety floor."

    if tool_name != "Bash":
        return ""

    raw_cmd = (tool_input or {}).get("command") or ""
    if not raw_cmd or not raw_cmd.strip():
        return ""

    cmd = re.sub(r"\\\s*\n", " ", raw_cmd)
    low = cmd.lower()

    if not any(d in low for d in ADS_DOMAINS):
        return ""

    is_graph_only = ("graph.facebook.com" in low or "graph-video.facebook.com" in low) and not any(
        d in low for d in ("facebook_business", "facebookads", "googleads.googleapis.com", "google.ads.googleads", "googleadsclient")
    )
    if is_graph_only and not AD_TARGET_MARKERS.search(cmd):
        return ""

    # Check curl commands with write flags or write parameters targeting Graph / Ads APIs
    if is_curl_write(cmd):
        return "Ad-account write request (POST/PUT/DELETE or form/data payload) to Graph/Ads API is blocked."

    # Check inline code / scripts performing write requests or mutating budget/status
    for pat in CODE_WRITE_PATTERNS:
        if pat.search(cmd):
            return "Ad-account mutation (POST/budget/status update) to Graph/Ads API is blocked."

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

        violation = check_ad_account_write(tool_name, tool_input)
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
