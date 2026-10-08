# 책 목록 크롤링 연습

## JavaScript 명언 크롤러

`quotes.toscrape.com/js/`의 첫 2페이지에서 명언·저자·태그를 수집합니다.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python crawl_quotes.py
```

robots.txt 확인 → 일반 요청으로 두 페이지 파싱 및 개수 출력 → 명언이 없는
페이지가 있으면 Playwright로 두 페이지 렌더링 → `quotes.csv` 저장 및 다시 읽어
검증합니다. 페이지 요청 사이에는 최소 1초를 쉽니다. robots.txt가 더 긴
간격을 지시하면 이를 따르며, 404/410 이외의 요청 오류나 금지 규칙은 중단합니다.
일반 요청이 성공하면 Playwright는 `NOT_RUN`으로 표시합니다.

CSV 열은 `quote,author,tags`이며, 태그는 한 셀에 쉼표로 구분합니다.
UTF-8 BOM으로 한글·악센트 문자를 보존합니다. 수집 결과 비교는
`quotes-report.json`에도 기록합니다. 일반 요청 개수는 응답 HTML의 실제
`.quote` 요소 개수이며, JavaScript 내부 데이터 문자열은 포함하지 않습니다.

검증: `.venv/bin/python -m unittest discover -v`

## 명언 카드 페이지

`quotes.html`을 열면 수집한 20개의 명언을 큰 카드로 볼 수 있습니다.
상단 태그 클라우드는 태그별 명언 수를 표시하며, 태그를 누르면 해당 명언만
넘겨 볼 수 있습니다. `전체`를 누르면 필터가 해제됩니다.
이전·다음 버튼과 키보드 좌우 화살표로 순환하며, 명언이 하나면 버튼이 비활성화됩니다.
모바일에서는 상단 태그 영역을 스크롤해 모든 태그를 선택할 수 있습니다.
데이터·CSS·JavaScript는 파일에 포함되어 서버나 외부 라이브러리 없이 열립니다.
페이지 데이터는 현재 `quotes.csv`의 스냅샷입니다.

전체 검증: `.venv/bin/python -m unittest discover -v`

## 일반 HTML 책 크롤러

Python 3.9 이상에서 추가 패키지 없이 실행할 수 있습니다.

```sh
python3 crawl_books.py
```

실행 순서: robots.txt 확인 → 목록 1~3페이지 수집 → books.csv 저장 → 저장한
파일을 다시 읽어 개수와 가격 상위 3권 출력. 페이지 사이에는 최소 1초를 쉽니다.
robots.txt에 더 긴 대기 규칙이 있으면 이를 따릅니다. robots.txt의 404/410은
규칙 파일 없음으로 처리하며, 그 외 요청 오류 또는 수집 금지 시 중단합니다.

CSV는 엑셀에서도 열기 쉽도록 UTF-8 BOM으로 저장합니다.

| 열 | 내용 |
|---|---|
| title | 생략되지 않은 전체 책 제목 |
| price_gbp | 파운드 가격 (숫자, 소수점 2자리) |
| rating | 1~5 별점 |
| availability | 목록에 표시된 재고 상태 (수량은 제공되지 않음) |
| image_url | 표지 이미지의 절대 HTTPS 주소 |

사이트의 가격과 별점은 연습용 데이터입니다.

## 카탈로그

`index.html`을 브라우저로 열면 표지·전체 제목·가격·별점을 볼 수 있습니다.
가격 낮은 순/높은 순 정렬, 정확히 1~5점 별점 필터를 제공합니다.
필터를 적용하면 가격대별 책 수 그래프도 해당 결과로 갱신됩니다.
가격 구간은 왼쪽 경계를 포함하고 오른쪽 경계를 제외합니다.

데이터·스타일·스크립트는 HTML에 포함되어 별도 패키지나 서버 없이 열립니다.
표지는 원본 사이트 이미지를 사용하므로 인터넷 연결이 필요합니다.
`python3 crawl_books.py`를 다시 실행하면 CSV와 HTML 데이터가 함께 갱신됩니다.

로컬 서버를 사용하려면 `python3 -m http.server 8000 --bind 127.0.0.1` 실행 후
`http://127.0.0.1:8000`을 열어 주세요.
