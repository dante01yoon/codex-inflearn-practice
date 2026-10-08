# 서울 충전소 지도

Python 3 표준 라이브러리로 서울 충전기 최대 500개를 조회하고,
`index.html`에서 충전소별 점과 클릭 팝업을 표시합니다.

## 데이터 갱신

프로젝트 `.env`의 `DATA_GO_KR_KEY`를 사용합니다. 인증키를 HTML에 넣지 않습니다.

```sh
python3 fetch_chargers.py
```

`getChargerInfo`에 `zcode=11`, `pageNo=1`, `numOfRows=500`을 보내며,
첫 성공 응답을 충전소 ID(`statId`)별로 집계해 `data/seoul.json`에 저장합니다.
동일한 `(statId, chgerId)`는 한 번만 계산합니다. 첫 방식이 성공하면 추가 호출하지 않습니다.
실패하면 다른 키 전달 방식으로 재시도하며 기존 `seoul.json`은 보존합니다.
인증키·요청 URL·서버 오류 상세는 출력하지 않습니다.
기존 `data/sample.json`은 이전 10개 샘플로 유지합니다.

**충전기 수는 이번 최대 500개 조회에 포함된 수입니다.** 서울 전체 목록이나
각 충전소의 전체 보유 대수를 의미하지 않으며 마지막 충전소는 일부만 포함될 수 있습니다.
좌표가 없거나 유효하지 않은 충전소는 JSON에 남기고 지도에서 제외합니다.

## 웹페이지 실행

웹 루트에 필요한 두 파일만 복사해 실행합니다.

```sh
mkdir -p /tmp/seoul-charger-web/data
cp index.html /tmp/seoul-charger-web/
cp data/seoul.json /tmp/seoul-charger-web/data/
python3 -m http.server 4173 --bind 127.0.0.1 --directory /tmp/seoul-charger-web
```

[지도 열기](http://127.0.0.1:4173/). 점을 누르면 이름·주소·조회한 충전기 수가
열립니다. 확대·축소와 전체 보기 버튼을 사용할 수 있습니다.
지도 점은 키보드 Tab으로 선택하고 Enter 또는 Space로 열 수도 있습니다.
HTML은 상대 경로로 JSON을 읽으므로 파일 더블클릭 대신 HTTP 서버로 실행하세요.

지도는 [Leaflet](https://leafletjs.com/reference.html) 1.9.4와
[OpenStreetMap](https://www.openstreetmap.org/copyright)을 사용합니다.
라이브러리와 지도 타일을 불러오려면 인터넷 연결이 필요합니다.

## 검증

```sh
python3 -m unittest discover -v
```

키 전달·비밀값 보호·응답 파싱·500개 제한·충전소 집계·중복 제거·좌표 처리 등을 검사합니다.

출처: [한국환경공단 전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do)
