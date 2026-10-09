# 단테의 코덱스 완벽 가이드 입문 — 강의 실습 파일

인프런 강의 「단테의 코덱스 완벽 가이드 입문」의 GPT6.1 업데이트 수업에서 **실제로 촬영할 때 코덱스가 만든 파일**을 모아 둔 저장소입니다.
코덱스의 결과는 같은 프롬프트라도 매번 조금씩 다릅니다. 내 결과가 영상과 다르거나 파일 이름이 다르면, 이 저장소의 파일부터 받아서 다음 수업을 진행하면 됩니다.

- 촬영 환경: 챗GPT 데스크톱 앱(macOS)의 코덱스, GPT-6.1 Sol Medium, 2026-10-08
- 인증키가 들어 있는 `.env`는 올리지 않았습니다. `.env.example`을 `.env`로 복사하고, 공공데이터포털에서 받은 내 인증키를 넣어 쓰세요.

## 섹션 12. 코덱스 클라우드

| 폴더 | 내용 | 수업 |
|---|---|---|
| [sec12-cloud/tailscale](sec12-cloud/tailscale/) | Codex Cloud 환경에 Tailscale VPN 연결 — 정책 예시와 실습 저장소·사내 API 서버 링크 | [GPT6.1 업데이트] Codex Cloud에서 Tailscale로 사내 서버 연결하기 |

## 섹션 14. 오픈 API와 웹 크롤링

| 폴더 | 내용 | 수업 |
|---|---|---|
| [sec14-openapi/ev-map](sec14-openapi/ev-map/) | 자세한 프롬프트로 만든 충전소 API 스크립트(`fetch_chargers.py`) → 서울 충전소 지도(`index.html`, `data/seoul.json`) → MapLibre·OpenFreeMap 3D 건물 지도 개선까지. **3강이 끝난 상태** | 2강, 3강 |
| [sec14-openapi/ev-map-short-prompt](sec14-openapi/ev-map-short-prompt/) | 같은 일을 짧은 프롬프트로 맡긴 결과(비교용) | 2강 |
| [sec14-openapi/books-crawl](sec14-openapi/books-crawl/) | 크롤링 연습 사이트 books.toscrape.com 첫 3페이지 책 목록 크롤러(`crawl_books.py`)와 `books.csv`, 표지·가격대 그래프가 있는 카탈로그(`index.html`). robots.txt 확인, 요청 사이 1초 대기. 같은 폴더에 Playwright 명언 크롤러(`crawl_quotes.py`, `quotes.csv`)와 명언 페이지(`quotes.html`) — `pip install -r requirements.txt` 후 `playwright install chromium` | 4강, 5강 |

### 실행

```sh
cd sec14-openapi/ev-map
cp .env.example .env   # DATA_GO_KR_KEY= 뒤에 내 인증키
python3 fetch_chargers.py
```

지도 실행 방법은 [ev-map/README.md](sec14-openapi/ev-map/README.md)를 보세요.

## 섹션 15. 하네스 엔지니어링

| 폴더 | 내용 | 수업 |
|---|---|---|
| [sec15-harness/ev-booking-start](sec15-harness/ev-booking-start/) | 충전소 예약 서비스 시작 파일(제품 문서·환불/체크인/겹침 규칙·테스트 55개). `npm ci` 후 `npx vitest run` | 2강부터 |
| [sec15-harness/after-lesson2](sec15-harness/after-lesson2/) | 2강을 마친 AGENTS.md(예약·결제 도메인 규칙 절 추가) | 2강 |
| [sec15-harness/after-lesson3](sec15-harness/after-lesson3/) | 3강을 마친 `.codex/guard.sh`·`hooks.json`(tests/ 수정과 토스페이먼츠 실제 키 차단 PreToolUse 훅). 시작 파일 폴더에 `.codex`를 복사한 뒤 `git init`하고, 앱 설정 > Hooks에서 Trust를 눌러야 동작합니다. `jq` 필요 | 3강 |
| [sec15-harness/after-lesson4](sec15-harness/after-lesson4/) | 4강을 마친 `.codex`(3강 `guard.sh` + Stop 훅 `verify.sh`: 끝내기 전 `vitest`·`tsc` 실행, 실패하면 한 번 더 고치게 함). 새 훅이라 Hooks에서 다시 Trust 필요 | 4강 |
| [sec15-harness/after-lesson5](sec15-harness/after-lesson5/) | 5강을 마친 하네스 전체: AGENTS.md(막혔을 때의 처리 절), `docs/harness.md`(하네스 구성 표), `.codex` 훅. `docs/harness.md`의 다른 문서 링크는 시작 파일의 `docs/`를 기준으로 합니다 | 5강 |
| (보강) 하네스 효과 비교 | 하네스 있음 = `after-lesson5`, 하네스 없음 = `ev-booking-start`를 복사해 `AGENTS.md`·`.specify`를 지운 폴더. 같은 부탁 3개로 비교 | 보강 1 |
| (보강) 권한·샌드박스·되돌리기 | `after-lesson5`에서 앱 권한을 Ask for approval로 바꿔 실습(.codex 보호, Undo, git 커밋) | 보강 2 |
| [sec15-harness/after-lesson8](sec15-harness/after-lesson8/) | 하네스 점검 후 `docs/harness.md`에 변경 이력 표 추가. guard.sh 개선(복합 읽기 명령 허용)은 섹션 16에서 | 보강 3 |

## 데이터 출처

`data/*.json`은 공공데이터포털 「한국환경공단_전기자동차 충전소 정보」(https://www.data.go.kr/data/15076352/openapi.do)에서 2026-10-08에 조회한 일부입니다. 이용허락범위: 공공저작물 출처표시(제1유형). 지도 바탕은 © OpenStreetMap 기여자.
