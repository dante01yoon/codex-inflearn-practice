#!/usr/bin/env bash
# PreToolUse: inspect stdin only; never execute the proposed command.
set -u
deny() { printf '%s\n' "$1" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || deny '차단: 훅 검사에 필요한 jq가 없습니다.'
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P) || deny '차단: 프로젝트 경로를 확인할 수 없습니다.'
writing=false
# Only the real project file enables writing, never cwd or caller-provided flags.
if [[ -f "$project_dir/.codex/TEST_WRITING" && ! -L "$project_dir/.codex/TEST_WRITING" ]]; then writing=true; fi
payload=$(cat) || deny '차단: 훅 입력을 읽을 수 없습니다.'
if ! printf '%s' "$payload" | jq -se 'length == 1 and (.[0] | type == "object")' >/dev/null 2>&1; then
  deny '차단: 훅 입력은 하나의 JSON 객체여야 합니다.'
fi
command -v python3 >/dev/null 2>&1 || deny '차단: 따옴표 검사에 필요한 python3가 없습니다.'
read_only=$(printf '%s' "$payload" | python3 -c '
import json
import os
import sys

def lex(command):
    # Return typed words/operators: quoted pipe characters remain words.
    tokens, word = [], []
    active, quote, i = False, None, 0
    def flush():
        nonlocal active
        if active:
            tokens.append(("word", "".join(word)))
            word.clear()
            active = False
    while i < len(command):
        ch = command[i]
        if quote == "single":
            if ch == chr(39):
                quote = None
            else:
                word.append(ch)
        elif quote == "double":
            if ch == chr(34):
                quote = None
            elif ch in "$`":
                return None
            elif ch == "\\":
                i += 1
                if i == len(command):
                    return None
                following = command[i]
                if following in "$`" + chr(34) + "\\":
                    word.append(following)
                elif following != "\n":
                    word.extend(["\\", following])
            else:
                word.append(ch)
        elif ch in (chr(39), chr(34)):
            quote = "single" if ch == chr(39) else "double"
            active = True
        elif ch == "\\":
            i += 1
            if i == len(command):
                return None
            if command[i] != "\n":
                active = True
                word.append(command[i])
        elif ch in "$`<>()":
            return None
        elif ch == "#" and not active:
            while i < len(command) and command[i] != "\n":
                i += 1
            continue
        elif ch in " \t\r":
            flush()
        elif ch in ";|&\n":
            flush()
            op = ch
            if ch in "|&" and command[i:i+2] == ch * 2:
                op = ch * 2
                i += 1
            if op == "&":
                return None
            tokens.append(("op", op))
        else:
            active = True
            word.append(ch)
        i += 1
    if quote is not None:
        return None
    flush()
    return tokens

def safe_segment(words):
    if not words:
        return False
    name = os.path.basename(words[0])
    if name not in {"cat", "rg", "grep", "ls", "head", "tail", "wc", "diff", "pwd", "stat", "git"}:
        return False
    if any(arg in {"--pre", "--hostname-bin"} or arg.startswith(("--pre=", "--hostname-bin=")) for arg in words[1:]):
        return False
    if name != "git":
        return True
    if len(words) < 2:
        return False
    if words[1] in {"status", "ls-files"}:
        return True
    return (words[1] == "diff" and "--no-ext-diff" in words and "--no-textconv" in words
            and not any(arg in {"--output", "--ext-diff", "--textconv", "--exec-path"}
                        or arg.startswith(("--output=", "--ext-diff=", "--textconv=", "--exec-path=")) for arg in words[2:]))

def read_only(command):
    if not isinstance(command, str):
        return False
    tokens = lex(command)
    if not tokens:
        return False
    words, seen, waiting = [], False, False
    for kind, value in tokens:
        if kind == "word":
            words.append(value)
            waiting = False
        elif words:
            if not safe_segment(words):
                return False
            words = []
            seen = True
            waiting = value in {"|", "&&", "||"}
        elif value not in {"\n", ";"} or waiting:
            return False
    if waiting:
        return False
    return safe_segment(words) if words else seen

try:
    payload = json.load(sys.stdin)
    source = payload.get("tool_input")
    command = source if isinstance(source, str) else (source.get("command", source.get("cmd")) if isinstance(source, dict) else None)
    print("true" if read_only(command) else "false")
except (ValueError, TypeError, AttributeError):
    print("false")
') || deny '차단: 읽기 명령을 안전하게 검사하지 못했습니다.'
reason=$(printf '%s' "$payload" | jq -r --argjson writing "$writing" --arg project "$project_dir" --argjson read_only "$read_only" '
  def parts:
    gsub("\\\\"; "/") | split("/")
    | reduce .[] as $p ([]; if $p == "" or $p == "." then .
      elif $p == ".." then .[0:([length - 1, 0] | max)] else . + [$p] end);
  def protected_path: parts | index("tests") != null;
  def switch_path: parts | .[-1] == "TEST_WRITING";
  def patch_paths:
    split("\n") | .[] | select(test("^\\*\\*\\* (Add File|Update File|Delete File|Move to): "))
    | sub("^\\*\\*\\* (Add File|Update File|Delete File|Move to): "; "") | sub("\\r$"; "");
  # Read-only classification is quote-aware and computed above.
  def ancestor_operand($cwd):
    ($project + "/.codex/TEST_WRITING" | parts) as $marker
    | [gsub("[\\x27\\\"\\\\]"; "") | splits("[[:space:];|&]+")
      | select(. != "" and (startswith("-") | not))
      | (if startswith("/") then . else
          (if $cwd == "" then $project elif ($cwd | startswith("/")) then $cwd else $project + "/" + $cwd end) + "/" + . end)
      | parts] | any(.[]; . as $operand
        | ($operand | length) <= ($marker | length) and $marker[0:($operand | length)] == $operand);
  .tool_name as $tool
  | if ($tool | type) != "string" then "차단: 훅 입력에 tool_name 문자열이 필요합니다."
    elif ($tool | test("(^|[.:])(apply_patch|Bash|bash|shell|shell_command|exec_command|Edit|Write)$") | not) then ""
    else .tool_input as $input
      | (if ($input | type) == "string" then $input
         elif ($input | type) == "object" then
           ($input.command // $input.cmd // $input.patch //
             (if ($tool | test("(Edit|Write)$")) then ($input.content // $input.new_string // "") else null end))
         else null end) as $command
      | (if ($input | type) == "object" then ($input.workdir // $input.cwd // .cwd // "") else .cwd // "" end) as $workdir
      | (if ($input | type) == "object" then ($input.file_path // $input.path // "") else "" end) as $file
      | if ($command | type) != "string" then "차단: 검사할 명령 또는 패치 문자열이 없습니다."
        elif ($command | test("live_(g?sk|g?ck)_")) then "차단: 토스페이먼츠 실제 키가 명령 또는 패치에 포함되어 있습니다. 이 프로젝트에서는 테스트 키만 사용하세요."
        elif ($tool | test("(apply_patch|Edit|Write)$")) then
          ([$command | patch_paths] + (if $file != "" then [$file] else [] end)) as $paths
          | if any($paths[]; switch_path) then "차단: TEST_WRITING 스위치는 사용자만 만들거나 수정·삭제·이동할 수 있습니다."
            elif ($writing | not) and any($paths[]; protected_path) then "차단: tests/ 변경은 .codex/TEST_WRITING 파일이 있을 때만 허용합니다. 스위치는 사용자가 직접 관리하세요."
            else "" end
        elif $read_only then ""
        # Protect the marker and its parent from shell writes even while ON.
        elif ($command | gsub("[\\x27\\\"\\\\]"; "") | test("TEST_WRITING|(^|[^A-Za-z0-9_])\\.codex([/[:space:]]|$)"))
          or ($workdir | parts | index(".codex") != null) then
          "차단: 스위치 또는 .codex/ 경로를 변경할 수 있는 셸 명령입니다. TEST_WRITING은 사용자만 관리하세요."
        elif ($command | ancestor_operand($workdir)) then
            "차단: 프로젝트·스위치의 상위 경로를 변경할 수 있는 명령입니다."
          elif ($command | test("(^|[;|&\\n])\\s*(rm|rmdir)\\s+.*(^|\\s)(\\.|\\.\\.|/)(/|\\s|$)"))
          or ($command | test("(^|[;|&\\n])\\s*git\\s+(clean|reset|checkout|restore)\\b")) then
          "차단: 프로젝트·스위치를 제거하거나 복원할 수 있는 광범위한 명령입니다."
        elif ($writing | not) and (($command | gsub("[\\x27\\\"\\\\]"; "") | test("(^|[^A-Za-z0-9_.-])tests(/|[^A-Za-z0-9_.-]|$)")) or ($workdir | protected_path)) then
          "차단: tests/ 경로에 영향을 줄 수 있는 셸 명령입니다. .codex/TEST_WRITING 없이 쓰기는 금지하며 읽기 명령만 허용합니다."
        else "" end
    end
' 2>/dev/null) || deny '차단: 훅 입력을 안전하게 검사하지 못했습니다.'
if [[ -n "$reason" ]]; then deny "$reason"; fi
exit 0
