# 서울 전기차 충전소 조회

Python 3 표준 라이브러리만 사용합니다. 별도 패키지 설치는 필요 없습니다.

프로젝트의 `.env`에 `DATA_GO_KR_KEY`를 설정한 뒤 실행합니다.
공공데이터포털의 Encoding 키와 Decoding 키 모두 지원합니다.
환경변수에 같은 이름을 설정하면 `.env`보다 우선합니다.

```bash
python3 fetch_seoul_chargers.py
```

기본 결과: `data/seoul_chargers.json` (스크립트가 있는 폴더 기준).
서울 지역 코드 `11`로 모든 페이지를 조회합니다.
API의 각 행은 **충전기 1대**입니다. 같은 충전소에 여러 충전기가 있을 수 있습니다.
`stationCount`는 고유 충전소 ID 개수, `chargerCount`는 충전기 행 개수입니다.
`items`는 충전소 이름(`statNm`), 주소(`addr`), 좌표(`lat`, `lng`),
충전기 ID/타입/상태 등의 원본 필드를 보존합니다.
원본 필드 값은 문자열이며 빈 값은 빈 문자열로 저장합니다.

```bash
python3 fetch_seoul_chargers.py --output data/seoul.json --page-size 1000 --timeout 60
```

조회 실패 시 종료 코드 1을 반환하고 기존 JSON을 보존합니다.
인증키와 요청 URL, 원문 오류 응답은 로그에 출력하지 않습니다.
API 오류가 발생하면 해당 서비스의 활용신청 승인 여부, 인증키, 일일 호출 한도를 확인하세요.
조회 중 데이터가 변할 수 있으므로 중복이나 불완전한 페이지 응답은 저장하지 않고 오류로 처리합니다.

출처 및 명세: [한국환경공단_전기자동차 충전소 정보](https://www.data.go.kr/data/15076352/openapi.do)
(`getChargerInfo`, XML 응답).
