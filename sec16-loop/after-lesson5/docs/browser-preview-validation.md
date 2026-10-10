# 브라우저 예약 화면 검증

기록일: 2026-10-09 (사용자 클라이언트 날짜). 서버 주소 `http://localhost:4173`.

## 구현과 실행

- `npm run dev`: Node.js 24, `--env-file=.env`, `src/preview/server.ts`.
- Node 내장 HTTP 서버·런타임 TS 타입 제거, HTML/CSS/JavaScript, SVG 좌표 지도.
  추가 설치·배포 없음. 도로 배경이 있는 지도와 구분해 화면에 표시한다.
- 기본은 `../ev-map/data`, 없으면 원래 수업 폴더
  `~/Documents/Codex/2026-10-05/ev-map/data`를 읽는다. `EV_DATA_DIR`로 지정 가능.
  원본 JSON은 읽기만 하며 서버 시작 시 상태 변경분을 병합한다.
- `.local/preview-state.json`에 원본과 분리한 시연 상태를 저장한다. Git에서 제외한다.
- 최종 실행 전 이번 검증에서 생성한 미승인 주문만 있음을 확인하고 상태 파일을
  `.local/browser-validation-state-<시각>.json`에 보존했다. 빈 초기 상태로 서버를 다시 실행했다.
  제품에 초기화 버튼이나 정책을 추가하지 않았다.
- 시연 시계는 수동 진행한다. 실제 컴퓨터 시간·토스 외부 시간은 변경하지 않는다.
- 서버는 `127.0.0.1`에만 바인딩한다. 동일 출처 POST와 세션 소유자를 검사하고
  확보·결제·시계 명령을 직렬 처리한다. 실제 운영 인증이 아닌 테스트 계정 선택이다.
- 기존 `src/rules/overlap.ts`, `payment.ts`, `checkin.ts`, `no-show-succession.ts`를 직접 import한다.
  규칙·기존 테스트·검사 설정·훅은 변경하지 않았다. 새 테스트 파일 작성 없음.

## 실제 검증 기록

| 검사·관련 AC | 상태 | 범위·결과 |
|---|---|---|
| 기존 규칙 회귀 검사 | PASS | `npm run test:rules`: 6개 파일, 114개 통과. 화면·HTTP·토스 실연결과 구분 |
| 기존 타입 검사 | PASS | `npm run typecheck`, 종료 코드 0 |
| 새 서버 타입 검사 | PASS | 아래 명령, 종료 코드 0 |
| 새 브라우저 JS 구문 | PASS | `node --check src/preview/public/app.js`, `checkout.js` |
| AC-01-1·02-4 조회 부분 | PASS | HTTP에서 13,000곳·75,891대 확인. 충전소 선택·사양·수집 시각·상태 갱신 시각 표시 |
| AC-01-2 | PASS (화면) | 실제 이용·주차면·충전량 미보장, 로컬 학습용 안내 |
| AC-02-6 일치 부분 | PASS (브라우저) | 낙성대동주민센터 DC콤보 선택 후 예약 진입 버튼 활성화 |
| AC-03-1·04 소유권 부분 | PASS (HTTP·브라우저) | A/B 전환, 본인 외 예약/없는 ID의 노쇼 명령 거절. 운영자 범위는 미구현 |
| AC-04-2 | PASS (HTTP 일부) | 45분 길이·유효하지 않은 시작 요청 거절. 모든 기간 경계의 통합 검사는 NOT_RUN |
| AC-04-3 점유 부분 | PASS (브라우저 내 HTTP) | A의 임시 점유에 B가 같은 충전기·겹치는 구간 주문을 요청하면 400과 충돌 사유. 확정 예약 실연결은 NOT_RUN |
| AC-05-1 | PASS (브라우저 실연결) | 토스 SDK v2 실제 위젯 로드, 테스트 모드 안내·3,000원·환불 안내·카드 선택 확인 |
| 카드 인증창 | PASS (호출) / BLOCKED (인증 완료) | 국민카드 창 호출 후 `customer.kbcard.com` 주소 해석 실패. 비씨카드 창은 외부 페이북 인증/QR 단계로 이동. 개인정보 입력·실제 결제 없음 |
| AC-05-2·05-5 승인·환불 통합, T-47 | BLOCKED | 외부 카드 인증 미완료. 승인 완료·환불 완료를 모의 성공으로 대신하지 않음 |
| AC-16·11·17 노쇼·승계 | PASS (기존 순수 테스트) / NOT_RUN (결제 이후 브라우저 통합) | 노쇼 API는 본인 일반 확정 예약의 체크인 기한으로 시계를 진행해 기존 reducer 호출. 승인된 예약이 없으므로 실제 UI 클릭 이후 결과를 검증했다고 주장하지 않음 |
| 모바일·데스크톱 레이아웃 | PASS | Playwright 1360×1000, 390×844. 화면 캡처 시각 검사, 모바일 document.scrollWidth=390 |
| 원본·규칙·테스트 불변 | PASS (Git·정적) | `git diff -- src/rules tests package-lock.json` 출력 없음. 원본 파일 변경 코드 없음 |

새 서버 타입 검사:

```sh
./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --types node src/preview/server.ts
```

TypeScript 7은 파일 인자와 tsconfig 공존 시 `--ignoreConfig`를 요구했다.
첫 명령의 TS5112는 검사 호출 오류이며 제품 타입 오류가 아니다. 올바른 명령으로 다시 실행해 통과했다.
기본 `npm run typecheck`는 기존 규칙만 검사하므로 새 서버 명령을 별도로 실행했다.

## 미정과 미연결

- 정확한 `24시간 이용가능`은 기존 AC-02-1 범위에서 사용한다. 다른 24시간 문구는 미정.
- 진행 중 커넥터 변경·버스 자격·어댑터, 동률 대기·예약 보유 첫 후보, 승계 결제 재개방,
  만료 승계 승인, 결제 중 잔여 30분 경계, 실패·환불 재시도는 미정으로 차단한다.
- 노쇼 승계 요청 후 10분 동안에도 잔여 30분 경계가 생기지 않는 구간만 승계 결제 진입을
  제공한다. 미정 사례를 결제 완료로 처리하지 않는다.
- 운영자·취소·정상 종료·승계 체크인·재노쇼 화면은 이번 요청에서 미연결.
  알려진 정책 자체를 미정으로 바꾸지 않았다.
- 시계 역행·초기화·재시작 경과 이벤트 복구 정책은 미정. 재시작 시 저장된 시연 시각을 유지한다.
- 웹훅 HTTP 수신·진위 검증은 미구현. 기존 `reducePaymentWebhook` 통과가 서버 웹훅 연결 증거가 아니다.

## 화면 검수

Playwright로 실제 localhost 페이지를 열고 화면 캡처를 `view_image`로 확인했다.
캡처: `.playwright-mcp/ev-booking-desktop.png`, `ev-booking-mobile.png`,
`ev-booking-checkout.png`, `toss-card-auth-blocked.png` (Git 제외).
지도 점·선택 강조, 목록·상세 연결, 글자 크기·간격, 예약금/CTA, 모바일 한 열 배치와
가로 넘침을 확인했다. 승인된 기능 제안에서 직접 구현한 화면이며 별도 이미지 컨셉은 만들지 않았다.
토스 iframe은 토스 제공 UI 그대로 사용한다.

공식 연결 문서:
- https://docs.tosspayments.com/sdk/v2/js/payment-widget
- https://docs.tosspayments.com/sdk/v2/js/environment
- https://docs.tosspayments.com/reference

전체 예약 서비스 완료나 모든 AC 통과 기록이 아니다.

## 시연용 가짜 승인·결제창 닫힘 추가 검증 (2026-10-10)

사용자가 새 테스트 없이 진행하도록 승인했다. 테스트 파일과 `src/rules`는 수정하지 않았다.
기존 사용자 기록을 보존하고 `/private/tmp/ev-booking-demo-33pOat`의 별도 상태,
localhost:4174 임시 서버에서 브라우저 조작·HTTP 확인을 수행했다.

| 항목 | 결과 | 근거·한계 |
|---|---|---|
| 기존 규칙 회귀 검사 | PASS | `npm run test:rules`: 6파일, 114개 통과 |
| 기존 타입 검사 | PASS | `npm run typecheck` |
| 시연 서버 타입·화면 JS 구문 | PASS | 별도 strict NodeNext 타입 검사, app.js·checkout.js `node --check` |
| AC-DEMO-05-1 가짜 승인 | PASS | 실제 버튼 클릭으로 A 예약 확정. fakePayment와 같은 카드/DONE/KRW/3000 응답을 기존 reducer에 전달 |
| AC-DEMO-05-2 표시·노쇼·승계 | PASS | A/B 화면의 시연용·토스 승인 없음 표시, A 노쇼 환불 0원, B 10분 결제 기회 및 가짜 승인 승계. 원래 종료 시각 유지 |
| AC-DEMO-05-3 닫힘·재진입 | PASS | PAY_PROCESS_CANCELED 리다이렉트 입력으로 닫힘 처리, 예약 화면 링크 재진입 및 재활성화. 새로고침 후 닫힘 확인 버튼도 확인. 동일 주문·기한 유지 |
| 닫힘 후 재개방 | PASS | launch→closed→launch→closed가 동일 주문·기한으로 처리됨 |
| 만료·승인 완료 보호 | PASS | 만료 후 closed/demo-approve는 400. 승인 완료 후 closed는 400 |
| 중복 가짜 승인·겹침 | PASS | 중복 승인 재전달 후 예약 수 동일. 승계 예약과 겹치는 새 주문은 400 |
| 토스 카드사 인증 이후 실제 테스트 승인·환불 | NOT_RUN | 가짜 승인 검증은 토스 실제 테스트 승인 검증이 아님 |
| 실제 카드사 창 닫힘 이벤트 | NOT_RUN | 취소 코드 리다이렉트 입력과 명시적 닫힘 버튼을 검증. 외부 인증 창의 실제 취소 이벤트 실연결은 실행하지 않음 |

브라우저 자동 조작을 너무 빠르게 연속 실행하여 계정 전환과 화면 버튼 대기에서
타임아웃이 발생한 실행은 PASS 근거에 포함하지 않았다. 상태 반영을 확인한 뒤
단계별 조작으로 위 결과를 확인했다. 화면 캡처는
`.playwright-mcp/demo-mock-approval-checkout.png`, `demo-mock-checkout-final.png`에 보관한다.

4173 서버는 수정본으로 재시작했으며 기존 `.local/preview-state.json`을 유지했다.
새 패키지 설치·배포·외부 결제 승인·테스트 변경은 수행하지 않았다.
닫힘 후 동일 주문 재시도만 이번 사용자 요청으로 확정되었다.
인증 실패·결과 불명·환불 실패 재시도와 기타 열린 질문은 계속 미정이다.
