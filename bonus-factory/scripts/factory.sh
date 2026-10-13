#!/usr/bin/env bash
# 소프트웨어 팩토리 라인: 이슈 → 분류 → 재현 테스트 → 수정 → 리뷰 → PR
# GitHub 쓰기(라벨·댓글·PR)는 이 스크립트가 하고, 코덱스는 공정 하나씩만 맡는다.
#
#   ./scripts/factory.sh triage            분류만 보기 (GitHub에 쓰지 않음)
#   ./scripts/factory.sh triage --apply    분류 결과를 라벨·댓글로 반영
#   ./scripts/factory.sh fix <번호>        재현 → 수정 → 리뷰 → PR
#   ./scripts/factory.sh spec <번호>       스펙 문서 → 초안 PR
#   ./scripts/factory.sh run               위 과정을 열린 이슈 전체에 한 번에
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
F=.factory
mkdir -p "$F"
say() { printf '\033[1;32m▶ %s\033[0m\n' "$*"; }
stamp() { printf '%s\t%s\t%s\n' "$(date +%s)" "$1" "$2" >> "$F/log.tsv"; }

# 코덱스 한 공정 실행. 훅 파일이 main과 같을 때만 새 작업 폴더에서도 훅을 켠다.
codex_step() {
  local dir=$1 sandbox=$2; shift 2
  git -C "$dir" diff --quiet main -- .codex || { echo "훅 파일이 main과 달라 멈춥니다."; exit 1; }
  codex exec -C "$dir" -s "$sandbox" --dangerously-bypass-hook-trust "$@" < /dev/null
}

issue_json() { gh issue view "$1" --json number,title,body,labels > "$2"; }

triage() {
  gh issue list --state open --json number,title,body,labels \
    --jq '[.[] | select([.labels[].name] | any(startswith("factory:")) | not)]' > "$F/issues.json"
  say "분류할 이슈 $(jq length "$F/issues.json")개"
  stamp triage start
  codex_step "$ROOT" read-only --output-schema scripts/factory/triage.schema.json \
    -o "$F/triage.json" '$factory-triage 로 .factory/issues.json 의 이슈를 분류해 줘.' > "$F/triage.log" 2>&1
  stamp triage end
  jq -r '.issues[] | "#\(.number)  [\(.type)]  \(.reason)"' "$F/triage.json"
  [[ ${1:-} == --apply ]] || { say "dry-run: GitHub에는 쓰지 않았습니다."; return; }
  for t in fix spec need-info human; do gh label create "factory:$t" --force >/dev/null; done
  jq -c '.issues[]' "$F/triage.json" | while read -r it; do
    n=$(jq -r .number <<<"$it"); t=$(jq -r .type <<<"$it")
    gh issue edit "$n" --add-label "factory:$t" >/dev/null
    if [[ $t == need-info || $t == human ]]; then
      gh issue comment "$n" --body "$(jq -r '"확인이 필요해요.\n\n\(.question)\n\n> 분류 근거: \(.evidence)"' <<<"$it")" >/dev/null
    fi
    say "#$n → factory:$t"
  done
}

# 이슈 하나를 위한 따로 떼어 둔 작업 폴더(worktree)
worktree() {
  local n=$1 br=$2 wt="$F/wt/issue-$1"
  [[ -d $wt ]] || git worktree add -q -B "$br" "$wt" main
  [[ -d $wt/node_modules ]] || (cd "$wt" && npm ci --silent --prefer-offline >/dev/null)
  cp .env "$wt/.env" 2>/dev/null || true
  mkdir -p "$wt/.factory"
  issue_json "$n" "$wt/.factory/issue.json"
  echo "$wt"
}

fix() {
  local n=$1 br="factory/issue-$1" wt
  wt=$(worktree "$n" "$br")
  local test="tests/rules/issue-$n.test.ts"

  say "1/4 재현 테스트 (이 단계만 tests/ 쓰기 허용)"
  stamp "fix#$n" repro
  touch "$wt/.codex/TEST_WRITING"
  codex_step "$wt" workspace-write -o "$wt/.factory/repro.md" \
    "\$factory-repro 로 이슈 #$n 을 재현해 줘." > "$wt/.factory/repro.log" 2>&1
  rm -f "$wt/.codex/TEST_WRITING"
  if (cd "$wt" && npx vitest run "$test" >/dev/null 2>&1); then
    echo "재현 테스트가 지금 코드에서 통과합니다. 버그를 못 잡았으니 멈춥니다."; exit 1
  fi
  say "  $test 실패 확인 (빨강)"
  git -C "$wt" add "$test" && git -C "$wt" commit -qm "test: 이슈 #$n 재현"
  local red; red=$(git -C "$wt" rev-parse HEAD)

  for round in 1 2; do
    say "2/4 수정 (tests/ 잠금) · ${round}회차"
    stamp "fix#$n" "fix$round"
    codex_step "$wt" workspace-write -o "$wt/.factory/pr.md" \
      "\$factory-fix 로 이슈 #$n 을 고쳐 줘." > "$wt/.factory/fix.log" 2>&1
    git -C "$wt" diff --quiet "$red" -- tests || { echo "수정 단계에서 tests/가 바뀌었습니다. 멈춥니다."; exit 1; }
    if ! (cd "$wt" && npm run -s test:rules >/dev/null 2>&1 && npm run -s typecheck >/dev/null 2>&1); then
      [[ $round == 2 ]] && { gh issue edit "$n" --add-label factory:human >/dev/null; echo "테스트가 통과하지 않아 사람에게 넘깁니다."; exit 1; }
      echo "  테스트나 타입 검사가 실패합니다. 한 번 더 고칩니다."; continue
    fi
    say "  전체 테스트 통과 (초록)"
    git -C "$wt" add -A -- src docs && git -C "$wt" commit -qm "fix: 이슈 #$n" || true

    say "3/4 리뷰 (다른 세션, 읽기 전용)"
    stamp "fix#$n" "review$round"
    git -C "$wt" diff main -- src tests docs > "$wt/.factory/diff.patch"
    codex_step "$wt" read-only --output-schema "$ROOT/scripts/factory/review.schema.json" \
      -o "$wt/.factory/review.json" "\$factory-review 로 이슈 #$n 의 변경을 판정해 줘." > "$wt/.factory/review.log" 2>&1
    jq -r '"  리뷰: \(.verdict)", (.checked[] | "   · 확인 " + .), (.findings[] | "   · 지적 " + .)' "$wt/.factory/review.json"
    [[ $(jq -r .verdict "$wt/.factory/review.json") == PASS ]] && break
    [[ $round == 2 ]] && { gh issue edit "$n" --add-label factory:human >/dev/null; echo "두 번 반려되어 사람에게 넘깁니다."; exit 1; }
  done

  say "4/4 증거 화면 → PR"
  stamp "fix#$n" pr
  local ev="evidence/issue-$n" steps
  steps=$(cat "$wt/.factory/shot.json" 2>/dev/null || echo '[]')
  mkdir -p "$wt/$ev"
  node scripts/shot.mjs "$ROOT" "$wt/$ev/before.png" "$steps" >/dev/null
  node scripts/shot.mjs "$wt" "$wt/$ev/after.png" "$steps" >/dev/null
  git -C "$wt" add "$ev" && git -C "$wt" commit -qm "evidence: 이슈 #$n 전후 화면"
  git -C "$wt" push -q -u origin "$br" --force-with-lease
  local raw="https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/raw/$br/$ev"
  { cat "$wt/.factory/pr.md"
    printf '\n## 화면\n| 고치기 전 | 고친 뒤 |\n|---|---|\n| ![before](%s/before.png) | ![after](%s/after.png) |\n' "$raw" "$raw"
    printf '\n## 리뷰\n'; jq -r '"- 판정: \(.verdict)", (.checked[] | "- 확인: " + .)' "$wt/.factory/review.json"
    printf '\nFixes #%s\n' "$n"; } > "$wt/.factory/pr-body.md"
  gh pr create --head "$br" --title "$(jq -r .title "$wt/.factory/issue.json") (#$n)" \
    --body-file "$wt/.factory/pr-body.md" --label factory:fix
  stamp "fix#$n" done
}

spec() {
  local n=$1 br="factory/spec-$1" wt
  wt=$(worktree "$n" "$br")
  say "스펙 문서 (코드 수정 없음)"
  stamp "spec#$n" start
  codex_step "$wt" workspace-write -o "$wt/.factory/spec.md" \
    "\$factory-spec 로 이슈 #$n 의 스펙을 써 줘." > "$wt/.factory/spec.log" 2>&1
  git -C "$wt" diff --quiet main -- src tests || { echo "스펙 단계에서 코드가 바뀌었습니다. 멈춥니다."; exit 1; }
  git -C "$wt" add docs/specs && git -C "$wt" commit -qm "spec: 이슈 #$n"
  git -C "$wt" push -q -u origin "$br" --force-with-lease
  gh pr create --draft --head "$br" --title "[스펙] $(jq -r .title "$wt/.factory/issue.json") (#$n)" \
    --body "$(cat "$wt/.factory/spec.md")"$'\n\n'"Refs #$n" --label factory:spec
  stamp "spec#$n" done
}

case ${1:-} in
  triage) triage "${2:-}" ;;
  fix) fix "$2" ;;
  spec) spec "$2" ;;
  run)
    triage --apply
    for n in $(jq -r '.issues[] | select(.type == "fix") | .number' "$F/triage.json"); do fix "$n"; done
    for n in $(jq -r '.issues[] | select(.type == "spec") | .number' "$F/triage.json"); do spec "$n"; done ;;
  *) sed -n '2,9p' "$0" ;;
esac
