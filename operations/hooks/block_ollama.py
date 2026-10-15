#!/usr/bin/env python3
"""Hook: block_ollama.py
Blocks any command that starts or calls Ollama (ollama CLI, port 11434, OLLAMA_HOST, or ollama-xac-nhan).
Follows the OPC harness convention: exit 2 with a single-sentence stderr message on block, exit 0 on allow.
"""

import json
import os
import re
import sys

HOOK_NAME = "block_ollama"

WRAPPERS = {
    "nohup", "sudo", "exec", "time", "caffeinate", "setsid", "nice",
    "env", "then", "do", "command", "builtin", "timeout", "gtimeout",
}
RUNNERS = {"python3", "python", "bash", "sh", "zsh", "source", ".", "node"}
READ_ONLY_PROCS = {"pgrep", "ps", "ls", "which", "echo", "printf"}


def strip_heredocs(cmd: str) -> str:
    out = []
    lines = cmd.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_-]*)['\"]?", line)
        out.append(line)
        i += 1
        if m:
            tag = m.group(1)
            while i < len(lines) and lines[i].strip() != tag:
                i += 1
            i += 1
    return "\n".join(out)


def strip_quotes(s: str) -> str:
    return re.sub(r"\$'(?:\\.|[^'\\])*'|'[^']*'|\"(?:\\.|[^\"\\])*\"", ' " " ', s)


def is_ollama_bin(tok: str) -> bool:
    cleaned = re.sub(r"^.*/", "", tok.strip("\"'\\"))
    return cleaned == "ollama"


def check_ollama(tool_name: str, tool_input: dict) -> str:
    if tool_name != "Bash":
        return ""
    raw = (tool_input or {}).get("command") or ""
    if not raw or not raw.strip():
        return ""

    body = strip_heredocs(raw)
    inner_shells = " \n ".join(
        m.group(2)
        for m in re.finditer(r"(?:bash|sh|zsh|python3?|node)\s+-[A-Za-z]*[ce]\s+(['\"])(.*?)\1", body, re.S)
    )
    scanned = strip_quotes(body) + "\n" + inner_shells

    for seg in re.split(r"[;&|()\n]|`", scanned):
        toks = seg.strip().split()
        while toks and (
            toks[0] in WRAPPERS
            or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0])
            or toks[0].startswith("-")
        ):
            toks.pop(0)
        if not toks:
            continue
        first_base = re.sub(r"^.*/", "", toks[0].strip("\"'\\"))
        if first_base in READ_ONLY_PROCS:
            continue
        if is_ollama_bin(toks[0]):
            return "Calling the ollama CLI is blocked by the office safety floor because it freezes the host machine."
        for tok in toks:
            if "ollama-xac-nhan" in tok:
                return "Running the Ollama confirmation script is restricted to the human owner and blocked for seats."

    if re.search(r"(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])\s*:\s*11434\b", body) or re.search(
        r"(?:^|[\s;&|])OLLAMA_HOST=", scanned
    ):
        return "Connecting to Ollama on port 11434 or setting OLLAMA_HOST is blocked by the office safety floor."

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

        violation = check_ollama(tool_name, tool_input)
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
