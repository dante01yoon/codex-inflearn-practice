# ev-booking 하네스 구성

현재 폴더의 파일·설정을 기준으로 정리한다. 구성 파일의 존재, 직접 실행 결과, Codex의 자동 훅 호출은 별도 증거이다. 제품 정책의 원문은 PRD·수용 기준·작업 목록을 따른다.

| 구성 | 파일·명령 | 역할 | 현재 범위·한계 |
|---|---|---|---|
| 작업 지침 | [AGENTS.md](../AGENTS.md) | 필수 문서 읽기, 정책 확인, 도메인 규칙, 검증·중단 기준의 짧은 진입점 | 훅 차단 시 우회 없이 `BLOCKED`. 정책에 따른 테스트 변경은 사용자에게 인계. 같은 테스트 세 번 연속 실패 시 중단 |
| 제품 정책 | [prd.md](prd.md) | 로컬 시연 범위, 예약·결제·환불·시간·상태 정책과 열린 질문 | 미정 정책을 임의로 구현하지 않음. 외부 배포·실제 결제 금지 |
| 수용 기준 | [acceptance.md](acceptance.md) | US별 AC, GIVEN/WHEN/THEN과 금액·시간 경계 | 조건부 AC는 답변 전 미확정. 문서의 기준 자체는 테스트 통과 증거가 아님 |
| 작업·선행 조건 | [tasks.md](tasks.md) | T-01~T-49의 범위·완료 조건·선행과 C-01~C-11의 확인 항목 | 문서의 작업 번호만으로 구현 완료를 판정하지 않음. C-10 기술 구성은 부분 확정 |
| 프로젝트 헌법 | [.specify/memory/constitution.md](../.specify/memory/constitution.md) | 문서 기반 정책, 테스트 우선, 데이터 보호, 검증 증거의 공통 원칙 | AC별 테스트 작성 → 사용자 확인 → 실제 실패 확인 → 구현. 구현 중 승인된 테스트 수정 금지 |
| Spec Kit 작업 도구 | [.agents/skills](../.agents/skills), [.specify/scripts/bash](../.specify/scripts/bash), [.specify/templates](../.specify/templates) | specify·clarify·plan·tasks·analyze·checklist·constitution·converge·implement·taskstoissues의 10개 스킬, 스크립트·템플릿 | 설치된 절차 도구이며 모든 단계를 실행했다는 증거는 아님 |
| Spec Kit 설정·워크플로 | [.specify/integration.json](../.specify/integration.json), [.specify/init-options.json](../.specify/init-options.json), [.specify/workflows/speckit/workflow.yml](../.specify/workflows/speckit/workflow.yml) | Codex skills 통합, 순차 기능 번호, specify → 명세 검토 → plan → 계획 검토 → tasks → implement 흐름 | 로컬 초기화 설정은 Spec Kit 1.1.0. 워크플로 자동 실행 여부는 별도 확인 필요 |
| 기능별 설계·증거 | [specs/001-reservation-compatibility-rules](../specs/001-reservation-compatibility-rules) | spec·plan·tasks·research·data-model·contracts·quickstart·checklists·validation·evidence 보관 | [validation.md](../specs/001-reservation-compatibility-rules/validation.md)에 겹침 테스트 승인·Red·Green 기록이 있음. 전체 예약 서비스 완료 증거로 확대하지 않음 |
| 규칙 구현 경계 | [src/rules](../src/rules) | 화면·API와 분리한 TypeScript 순수 함수 | 겹침 판정, 일반 예약 체크인 시간 판정, 사용자 취소 환불·중복 효과 방지 구현. 체크인 권한·상태 전이, 외부 환불·승계 실행은 이 함수들의 범위 밖 |
| 규칙 테스트 | [tests/rules/overlap.test.ts](../tests/rules/overlap.test.ts), [checkin.test.ts](../tests/rules/checkin.test.ts), [refund.test.ts](../tests/rules/refund.test.ts) | AC를 추적하는 경계·중복·입력 불변성 검증 | `npm run test:rules`로 실행. 테스트 통과는 모바일 화면·토스 실연결 통과와 별개 |
| 실행 환경·테스트 수집 | [package.json](../package.json), [package-lock.json](../package-lock.json), [vitest.config.ts](../vitest.config.ts) | Node.js 24, TypeScript 7.0.2, Vitest 5.0.3의 버전·명령 고정 | Vitest는 Node 환경에서 `tests/rules/**/*.test.ts`를 수집. 테스트가 없으면 실패 |
| 타입 검사 | [tsconfig.json](../tsconfig.json), `npm run typecheck` | strict·noEmit·NodeNext 설정으로 규칙 코드·규칙 테스트·Vitest 설정 검사 | 타입 검사 성공만으로 제품 동작을 검증한 것은 아님 |
| 훅 등록 | [.codex/hooks.json](../.codex/hooks.json) | PreToolUse에 `guard.sh`, Stop에 `verify.sh` 등록 | 현재 PreToolUse matcher는 `Bash`·`apply_patch`. 설정 존재만으로 이 채팅에서 자동 호출됐다고 보고하지 않음 |
| 실행 전 가드 | [.codex/guard.sh](../.codex/guard.sh) | stdin JSON의 도구·명령·패치 검사. 차단 시 종료 코드 2와 한국어 이유 반환 | 프로젝트 루트의 일반 파일 `.codex/TEST_WRITING`이 있을 때만 `tests/` 쓰기 허용. 스위치 추가·수정·삭제·이동은 존재 여부와 관계없이 차단. 읽기 명령의 복합 실행은 구간별 허용 목록 검사. 토스 실제 키 차단 유지. 텍스트 검사이며 셸 파서·파일시스템 샌드박스가 아님 |
| 가드 직접 검증 | [scripts/validate-guard.py](../scripts/validate-guard.py), [guard-validation.json](guard-validation.json) | `python3 scripts/validate-guard.py`로 가드 구문과 stdin 허용·차단 판정 검증 | 임시 프로젝트 복사본에서 스위치 없음·일반 파일·디렉터리·심볼릭 링크를 시험. 검사용 명령·패치는 실행하지 않고 실제 프로젝트 스위치는 변경하지 않음. 자동 훅의 전체 실행 증거와 구분 |
| 종료 전 검증 | [.codex/verify.sh](../.codex/verify.sh) | 규칙 테스트와 타입 검사 모두 실행. 통과 메시지 또는 실패 테스트 이름·타입 오류를 JSON으로 반환 | `stop_hook_active=true` 재진입에서는 검사 없이 `{}` 반환. 현재 훅은 한 번 수정 요청하며 영속 실패 횟수 카운터가 없음. 차단 응답을 받으면 AGENTS.md의 즉시 중단 규칙을 우선 |
| 훅 직접 검증 기록 | [.codex/verify-validation.json](../.codex/verify-validation.json) | 정상 통과·오류 주입·재진입·다음 응답 재검사·복구·하위 폴더 실행의 기존 기록 | 기록에는 정상 55개 통과 및 차단 사례 확인이 있음. 임시 복사본에 오류 주입한 과거 직접 실행 결과이며, 신뢰 설정·Codex 자동 호출은 `NOT_RUN` |
| 생성물·비밀값 제외 | [.gitignore](../.gitignore) | 의존성·생성물·로그·환경 파일을 Git 추적 대상에서 제외 | 키 값은 `.env`에만 보관. ignore 규칙만으로 이미 추적된 비밀값까지 보호하지는 않음 |

## 중단과 사용자 인계

| 발생 상황 | 처리 | 남길 기록·사용자 선택지 |
|---|---|---|
| 훅 차단 | 즉시 `BLOCKED`. 다른 도구·명령·경로로 재시도하거나 훅을 수정·끄지 않음 | 훅 이름, 차단 작업·사유, 영향 범위. 사유에 맞게 요청 범위 변경, 정책·테스트의 별도 검토, 환경 문제 해결, 작업 보류 등의 선택과 영향을 제시 |
| 정책 변경에 따른 테스트 수정 필요 | 구현 중단, 테스트 파일·기대값을 직접 수정하지 않고 인계 | 기존 → 변경 기준, 문서·US·AC·T·C, 파일과 전체 테스트 이름, 현재·변경할 기대값. 사용자 결정 후 별도 테스트 작성·확인·실패 검증 단계로 복귀 |
| 같은 테스트 세 번 연속 실패 | 추가 수정·재실행 중단, `BLOCKED` 보고 | 파일 경로 + 전체 테스트 이름을 기준으로 세 번의 명령·실패 내용·수정 시도·남은 원인을 작업 검증 기록에 남기고 위치를 보고. 사용자에게 원인 검토·범위 조정·보류 선택지 인계 |

세 번 연속 실패 중단은 에이전트가 실행 이력을 기록하며 지킬 지침이다. 현재 훅에 자동 카운터가 구현되어 있다는 뜻은 아니다. 훅 차단은 실패 횟수와 무관하게 즉시 중단한다. 실패 기록에는 인증키·원시 비밀값을 포함하지 않는다.

이번 정리는 문서 갱신이다. 훅 자동 호출, 브라우저 검증, 토스 테스트 실연결은 이번 작업에서 `NOT_RUN`이다.

## 테스트 작성 스위치와 읽기 명령

- 사용자가 실제 프로젝트의 `.codex/TEST_WRITING` 파일을 직접 만들거나 지운다. 코덱스는 이 파일을 만들거나 수정·삭제·이동하지 않는다. 디렉터리나 심볼릭 링크는 쓰기 허용 스위치로 인정하지 않는다.
- 스위치가 없으면 `tests/`의 추가·수정·삭제·이동과 해당 경로에 영향을 줄 수 있는 셸 명령을 차단한다. 스위치가 있어도 테스트 작성 → 사용자 확인 → 실패 확인 → 구현의 기존 관문은 유지된다.
- `cat`, `rg`, `grep`, `ls`, `head`, `tail`, `wc`, `diff`, `pwd`, `stat`, `git status`, `git ls-files`의 읽기 구간을 `;`, `&&`, `||`, 파이프 또는 줄바꿈으로 묶을 수 있다. `git diff`는 외부 실행을 막는 `--no-ext-diff --no-textconv` 옵션이 필요하다.
- 읽기 판정은 `python3` 기반 따옴표 검사기로 수행한다. 따옴표 안의 `|`, `;`, `&` 등은 인수이며 실제 제어 연산자와 구분한다. 리다이렉션, 명령 치환, 백그라운드 실행, `rg --pre` 등 외부 실행 옵션은 읽기로 인정하지 않는다. 이스케이프된 리터럴과 인수 안의 정규식은 읽기로 검사할 수 있다. 스위치가 없으면 테스트 경로 관련 쓰기를 차단하고, 스위치가 있으면 기존 셸 쓰기 허용 기준을 적용한다.
- 스위치나 `.codex/`를 변경할 수 있는 셸 명령, 스위치 상위 경로 변경, 광범위한 Git 정리·복원 명령을 보수적으로 차단한다. 명령 문자열에 보이지 않는 별도 스크립트의 부작용이나 모든 간접 경로를 추적하는 보안 샌드박스는 아니다.

## 결제 테스트 작성 단계 (2026-10-09)

- 사용자가 스위치를 켜고 가드 수정안 반영 및 결제 테스트의 실패 확인을 명시적으로 요청했다. 실제 스위치는 사용자 소유이며 에이전트가 변경하지 않았다.
- 가드 직접 검증: `python3 scripts/validate-guard.py`, 260/260 PASS. 따옴표 정규식과 실제 파이프를 포함한 실제 읽기 도구 호출도 통과했다. 차단 명령 자체는 실행하지 않았다.
- 결제 정책·테스트 범위와 Red 실행 결과는 [payment-test-validation.md](payment-test-validation.md)에 기록한다. 결제 구현·HTTP 웹훅 서버·토스 호출은 이번 범위 밖이다.

## 변경 이력

| 날짜 | 항목 | 상태 | 점검 결과·발견한 문제 | 조치·남은 확인 |
|---|---|---|---|---|
| 2026-10-09 | 문서와 실제 구성 대조 | PASS | 나열된 구성 파일, Spec Kit 스킬 10개, 규칙 구현 범위와 검사 설정이 문서 설명과 일치. Node.js 24.14.1, TypeScript 7.0.2, Vitest 5.0.3 확인 | 확정된 구성 불일치 없음 |
| 2026-10-09 | 훅 등록·스크립트 정적 검사 | PASS | hooks.json에 PreToolUse → guard.sh, Stop → verify.sh 등록. 두 스크립트 실행 권한 및 `bash -n` 구문 검사 통과 | 등록 확인과 자동 호출 증거는 구분 |
| 2026-10-09 | PreToolUse 자동 호출·읽기 명령 차단 | BLOCKED → PASS (단순 조회 재개) | 실제 훅이 `git status --short; rg --files … src tests; cat …` 형태의 복합 읽기 명령을 차단. `simple_read`가 세미콜론을 거절하고 단일 읽기 명령만 허용하므로, 변경 없는 조회도 전체가 차단되는 사용성 문제 확인. 현재 문서의 제한과는 일치 | 최초 차단 시 중단. 사용자 재개 지시 후 단순 읽기 명령을 각각 실행해 허용 확인. guard.sh 변경은 제안만 하고 사용자가 직접 수행 |
| 2026-10-09 | 규칙 테스트·타입 검사 | PASS | `npm run test:rules`: 3개 파일, 55개 테스트 통과. `npm run typecheck`: 종료 코드 0, 오류 없음 | 이번 점검에서 실제 실행. 전체 서비스·브라우저·결제 검증으로 확대하지 않음 |
| 2026-10-09 | Stop 스크립트 직접 실행 | PASS | stdin의 `stop_hook_active=false`에서 규칙 테스트·타입 검사 통과 JSON, `true`에서 `{}` 반환 확인 | 실패 주입 사례는 기존 기록만 대조했으며 이번 재실행은 NOT_RUN |
| 2026-10-09 | Stop 자동 호출·외부 검증 | NOT_RUN | Codex 종료 시 Stop 자동 호출, 브라우저 검증, 토스 테스트 실연결은 확인하지 않음 | 직접 실행 통과를 자동 호출 통과로 간주하지 않음 |
| 2026-10-09 | 점검 기록 추가 | PASS | 점검 전후 Git 작업 트리는 깨끗했으며 점검 중 파일 수정 없음. 이후 사용자 요청으로 이 변경 이력 표만 추가 | 훅·규칙·테스트 파일은 수정하지 않음 |
