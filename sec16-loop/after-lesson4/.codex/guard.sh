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
command -v python3 >/dev/null 2>&1 || deny '차단: 변경 명령 검사에 필요한 python3가 없습니다.'
reason=$(printf '%s' "$payload" | python3 "$project_dir/.codex/guard-command.py" "$project_dir" "$writing") \
  || deny '차단: 보호 경로 변경 여부를 검사하지 못했습니다.'
if [[ -n "$reason" ]]; then deny "$reason"; fi
exit 0
