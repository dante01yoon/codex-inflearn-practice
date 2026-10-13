---
name: factory-repro
description: 팩토리 라인의 재현 공정. 바로 수정으로 분류된 이슈를 실패하는 테스트로 먼저 고정한다. 라인 스크립트가 부를 때만 쓴다.
---
# 재현 공정

입력: `.factory/issue.json` (이슈 번호·제목·본문·분류 근거)

1. 이슈의 재현 입력과 기대 결과를 그대로 검사하는 테스트를 `tests/rules/issue-<번호>.test.ts` 한 파일에만 쓴다. 기존 테스트 파일은 건드리지 않는다.
2. 이 단계에서는 `src/`를 고치지 않는다. 테스트는 지금 코드에서 **실패해야** 한다. `npx vitest run tests/rules/issue-<번호>.test.ts`로 실패를 직접 확인한다.
3. 테스트는 `src/rules`의 순수 함수만 불러온다. 화면·API 코드(`src/preview`)는 타입 검사 범위 밖이라 불러오지 않는다. 판정 로직이 아직 `src/rules`에 없으면, 있어야 할 파일과 함수 이름(AGENTS.md: 판정 로직은 `src/rules`의 순수 함수)으로 불러와서 "함수 없음"으로 실패하게 두고 그렇게 보고한다.
4. 화면 증거를 찍을 동작을 `.factory/shot.json`에 JSON 배열로 남긴다. 형식은 `scripts/shot.mjs` 맨 위 주석을 따른다.

마지막 응답: 테스트 파일 경로, 실패 확인 명령과 실패 내용 한두 줄. 한국어로 쓴다.
