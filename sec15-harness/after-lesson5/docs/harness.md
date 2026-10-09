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
| 실행 전 가드 | [.codex/guard.sh](../.codex/guard.sh) | stdin JSON의 도구·명령·패치 검사. 차단 시 종료 코드 2와 한국어 이유 반환 | `tests/` 변경 가능 명령·패치와 토스 실제 키 형태를 차단. 테스트 경로 조회는 제한된 단순 읽기 명령만 허용. 텍스트 검사이며 셸 파서·파일시스템 샌드박스가 아님 |
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
