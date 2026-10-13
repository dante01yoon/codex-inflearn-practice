# 보너스. 소프트웨어 팩토리 — 이슈가 PR이 되는 라인

[GPT6.1 업데이트] 보너스 수업에서 만든 팩토리 파일입니다. 전체 시연 저장소(이슈·PR 포함)는 https://github.com/dante01yoon/ev-booking-factory 에 있습니다.

시작 상태는 [sec16-loop/after-lesson5](../sec16-loop/after-lesson5/)의 충전소 예약 앱(하네스 포함)입니다. 이 폴더의 파일을 그 위에 복사하면 팩토리가 됩니다.

| 파일 | 역할 |
|---|---|
| `AGENTS.factory.md` | AGENTS.md 맨 아래에 붙일 「소프트웨어 팩토리 규칙」(분류 표·공통 규칙) |
| `.agents/skills/factory-*` | 공정 스킬 5개(분류·재현·수정·리뷰·스펙). `agents/openai.yaml`로 자동 호출을 꺼서 라인이 부를 때만 실행 |
| `scripts/factory.sh` | 라인. GitHub 쓰기(라벨·댓글·PR)는 스크립트가, 코드 작업은 `codex exec`가 공정 하나씩 |
| `scripts/factory/*.schema.json` | 분류·리뷰 결과를 JSON으로 받는 `--output-schema` |
| `scripts/shot.mjs` | 고치기 전(main)·고친 뒤(작업 폴더) 화면을 같은 동작으로 찍기 |

## 실행

```sh
cd sec16-loop/after-lesson5        # 내 GitHub 저장소로 올린 복사본에서
cp -R ../../bonus-factory/.agents ../../bonus-factory/scripts .
cat ../../bonus-factory/AGENTS.factory.md >> AGENTS.md
npm ci && npm i -D playwright && npx playwright install chromium
cp .env.example .env
./scripts/factory.sh triage        # 분류만 보기 (GitHub에 쓰지 않음)
./scripts/factory.sh run           # 분류 반영 → fix 전부 → spec 전부
```

`gh`(로그인)·`jq`·Codex CLI가 필요합니다. 촬영 환경: Codex CLI 0.162.1, GPT-6.1 Sol medium, 2026-10-13.
