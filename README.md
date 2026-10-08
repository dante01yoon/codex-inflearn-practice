# 단테의 코덱스 완벽 가이드 입문 — 강의 실습 파일

인프런 강의 「단테의 코덱스 완벽 가이드 입문」의 GPT6.1 업데이트 수업에서 **실제로 촬영할 때 코덱스가 만든 파일**을 모아 둔 저장소입니다.
코덱스의 결과는 같은 프롬프트라도 매번 조금씩 다릅니다. 내 결과가 영상과 다르거나 파일 이름이 다르면, 이 저장소의 파일부터 받아서 다음 수업을 진행하면 됩니다.

- 촬영 환경: 챗GPT 데스크톱 앱(macOS)의 코덱스, GPT-6.1 Sol Medium, 2026-10-08
- 인증키가 들어 있는 `.env`는 올리지 않았습니다. `.env.example`을 `.env`로 복사하고, 공공데이터포털에서 받은 내 인증키를 넣어 쓰세요.

## 섹션 14. 오픈 API와 웹 크롤링

| 폴더 | 내용 | 수업 |
|---|---|---|
| [sec14-openapi/ev-map](sec14-openapi/ev-map/) | 자세한 프롬프트로 만든 충전소 API 스크립트(`fetch_chargers.py`) → 서울 충전소 지도(`index.html`, `data/seoul.json`) → MapLibre·OpenFreeMap 3D 건물 지도 개선까지. **3강이 끝난 상태** | 2강, 3강 |
| [sec14-openapi/ev-map-short-prompt](sec14-openapi/ev-map-short-prompt/) | 같은 일을 짧은 프롬프트로 맡긴 결과(비교용) | 2강 |
| [sec14-openapi/books-crawl](sec14-openapi/books-crawl/) | 크롤링 연습 사이트 books.toscrape.com 첫 3페이지 책 목록 크롤러(`crawl_books.py`)와 결과 `books.csv`. robots.txt 확인, 요청 사이 1초 대기 | 4강 |

### 실행

```sh
cd sec14-openapi/ev-map
cp .env.example .env   # DATA_GO_KR_KEY= 뒤에 내 인증키
python3 fetch_chargers.py
```

지도 실행 방법은 [ev-map/README.md](sec14-openapi/ev-map/README.md)를 보세요.

## 데이터 출처

`data/*.json`은 공공데이터포털 「한국환경공단_전기자동차 충전소 정보」(https://www.data.go.kr/data/15076352/openapi.do)에서 2026-10-08에 조회한 일부입니다. 이용허락범위: 공공저작물 출처표시(제1유형). 지도 바탕은 © OpenStreetMap 기여자.
