#!/usr/bin/env bash
# 루프의 뼈대만 남긴 최소 버전 (강의 설명용). 실제로는 scripts/loop.sh를 쓰세요.
# 할 일 → 실행 → 검증 → 다음 입력 → 멈출 조건
set -u
MAX=5                                   # 멈출 조건 1: 최대 바퀴
before=$(git diff --stat HEAD -- tests) # 멈출 조건 2: tests/가 바뀌면 중단

for round in $(seq 1 "$MAX"); do
  echo "바퀴 $round/$MAX"
  if npx vitest run > /tmp/loop-mini.log 2>&1; then   # 검증
    echo "PASS: 모든 테스트 통과"; exit 0
  fi
  failed=$(grep -E "FAIL|✗|×" /tmp/loop-mini.log | head -40)   # 다음 입력
  [ "$round" = "$MAX" ] && break
  codex exec --sandbox workspace-write \
    "아래 실패한 테스트를 구현 코드에서 고쳐 줘. tests/는 고치지 마.
$failed"                                                       # 실행
  if [ "$(git diff --stat HEAD -- tests)" != "$before" ]; then
    echo "중단: tests/가 바뀌었습니다"; exit 2
  fi
done
echo "중단: $MAX바퀴 안에 통과하지 못했습니다"; exit 1
