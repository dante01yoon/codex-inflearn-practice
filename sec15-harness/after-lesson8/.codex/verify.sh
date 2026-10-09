#!/usr/bin/env bash
# Stop: stdout is JSON only. Block once; the continuation may finish.
set -u

block() {
  jq -n --arg reason "$1" '{decision: "block", reason: $reason}'
  exit 0
}

command -v jq >/dev/null 2>&1 || {
  printf '%s\n' 'Stop 검증에 필요한 jq가 없습니다. 설치 후 다시 검증하세요.' >&2
  exit 2
}
payload=$(cat) || block 'Stop 입력을 읽을 수 없습니다. 훅 입력을 확인하세요.'
if ! printf '%s' "$payload" | jq -se '
  length == 1 and (.[0] | type == "object")
  and (.[0].stop_hook_active | type == "boolean")
' >/dev/null 2>&1; then
  block 'Stop 입력의 stop_hook_active는 boolean이어야 합니다. 훅 입력을 확인하세요.'
fi

# No persistent marker: each new user turn gets its own first verification.
if [[ $(printf '%s' "$payload" | jq -r '.stop_hook_active') == true ]]; then
  printf '%s\n' '{}'
  exit 0
fi

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd) \
  || block '프로젝트 경로를 확인할 수 없습니다.'
cd -- "$project_dir" || block '프로젝트 폴더로 이동할 수 없습니다.'
command -v npm >/dev/null 2>&1 || block 'npm이 없습니다. Node.js 24 실행 환경을 확인하세요.'
scratch_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-stop-verify.XXXXXX") \
  || block 'Stop 검증용 임시 폴더를 만들 수 없습니다.'
trap 'rm -rf -- "$scratch_dir"' EXIT

# Run both checks even if tests fail. Never mix runner output into hook JSON.
test_rc=0
npm run test:rules -- --reporter=json --outputFile="$scratch_dir/tests.json" \
  >"$scratch_dir/tests.log" 2>&1 || test_rc=$?
type_rc=0
npm run typecheck -- --pretty false \
  >"$scratch_dir/typecheck.log" 2>&1 || type_rc=$?

if [[ $test_rc == 0 && $type_rc == 0 ]]; then
  jq -n '{systemMessage: "Stop 검증 PASS: 규칙 테스트와 타입 검사 통과."}'
  exit 0
fi

reason='Stop 검증 FAIL. 다음 실패를 구현 코드에서 수정하고 테스트와 타입 검사를 다시 실행하세요. tests/의 기대값을 바꾸지 마세요. 해결할 수 없으면 남은 실패와 이유를 보고하세요. 이 훅은 한 번만 수정을 요청합니다.'
if [[ $test_rc != 0 ]]; then
  failed_names=$(jq -r '
    .testResults[]? as $suite
    | $suite.assertionResults[]?
    | select(.status == "failed")
    | "- " + $suite.name + " > " + (.fullName // .title // "이름 없음")
  ' "$scratch_dir/tests.json" 2>/dev/null) || failed_names=''
  if [[ -n "$failed_names" ]]; then
    reason+=$'\n\n실패한 테스트:\n'"$failed_names"
  else
    # Import errors, missing dependencies and runner failures may have no test name.
    reason+=$'\n\n테스트 실행 실패 (종료 코드 '"$test_rc"$'): 개별 테스트 결과를 얻지 못했습니다. npm run test:rules로 원인을 확인하세요.'
  fi
fi
if [[ $type_rc != 0 ]]; then
  diagnostics=$(tail -n 60 "$scratch_dir/typecheck.log")
  reason+=$'\n\n타입 검사 실패 (종료 코드 '"$type_rc"$'):\n'"$diagnostics"
fi

# Redact Toss key-shaped strings even if they appear in a test name/diagnostic.
safe_reason=$(printf '%s' "$reason" | jq -Rs '
  gsub("(test|live)_(g?sk|g?ck)_[A-Za-z0-9_-]+"; "[REDACTED_TOSS_KEY]")
')
jq -n --argjson reason "$safe_reason" '{decision: "block", reason: $reason}'
