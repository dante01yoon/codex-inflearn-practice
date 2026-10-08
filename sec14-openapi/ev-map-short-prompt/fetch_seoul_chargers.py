#!/usr/bin/env python3
"""한국환경공단 API에서 서울 충전기 정보를 조회해 JSON으로 저장합니다."""

import argparse
import json
import os
import shlex
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode
from urllib.request import urlopen

BASE_DIR = Path(__file__).resolve().parent
API_URL = "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo"


def load_key(env_path):
    """환경변수 우선, 없으면 .env에서 키를 읽습니다. 키는 출력하지 않습니다."""
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not key:
        if not env_path.is_file():
            raise ValueError(".env 파일이 없습니다. DATA_GO_KR_KEY를 설정해 주세요.")
        for line in env_path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[7:].strip()
            name, sep, value = line.partition("=")
            if sep and name.strip() == "DATA_GO_KR_KEY":
                parts = shlex.split(value, comments=True)
                if len(parts) > 1:
                    raise ValueError("DATA_GO_KR_KEY 값 형식을 확인해 주세요.")
                key = parts[0] if parts else ""
                break
    if not key:
        raise ValueError("DATA_GO_KR_KEY가 비어 있습니다.")
    # 포털의 Encoding/Decoding 키 모두 한 번만 URL 인코딩하도록 정규화합니다.
    return unquote(key)


def fetch_page(key, page, page_size, timeout):
    query = urlencode({
        "serviceKey": key, "pageNo": page, "numOfRows": page_size, "zcode": "11",
    })
    try:
        with urlopen(f"{API_URL}?{query}", timeout=timeout) as response:
            raw = response.read()
    except HTTPError as exc:
        raise RuntimeError(f"API HTTP 오류 {exc.code}. 활용신청 승인과 인증키를 확인해 주세요.") from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("API 연결에 실패했습니다. 네트워크 또는 응답 시간을 확인해 주세요.") from None

    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        raise RuntimeError("API가 올바른 XML을 반환하지 않았습니다.") from None
    code = root.findtext(".//resultCode") or root.findtext(".//returnReasonCode")
    if code != "00":
        # 원문 오류 응답에는 요청 URL/키가 포함될 수 있으므로 출력하지 않습니다.
        safe_code = code if code and code.isdigit() and len(code) <= 3 else "UNKNOWN"
        raise RuntimeError(f"API 오류 코드 {safe_code}. 인증키, 활용신청 승인, 호출 한도를 확인해 주세요.")
    try:
        total = int(root.findtext(".//totalCount", ""))
        reported_page = int(root.findtext(".//pageNo", ""))
        reported_size = int(root.findtext(".//numOfRows", ""))
        if total < 0 or reported_page != page or reported_size <= 0:
            raise ValueError
    except ValueError:
        raise RuntimeError("API 페이지 정보가 올바르지 않습니다.") from None
    items = [{child.tag: child.text or "" for child in item}
             for item in root.findall(".//items/item")]
    if any(item.get("zcode") != "11" for item in items):
        raise RuntimeError("서울 이외의 데이터가 응답에 포함되어 조회를 중단했습니다.")
    return items, total, reported_size


def fetch_all(key, page_size, timeout):
    items = []
    page = 1
    while True:
        batch, total, reported_size = fetch_page(key, page, page_size, timeout)
        items.extend(batch)
        print(f"{page}페이지: {len(batch):,}건 (누적 {len(items):,} / API 총 {total:,}건)",
              file=sys.stderr)
        if len(items) >= total:
            break
        if not batch or page * reported_size >= total:
            raise RuntimeError("총 건수보다 적은 데이터가 반환되어 저장을 중단했습니다. 다시 실행해 주세요.")
        page += 1
    identities = [(item.get("statId"), item.get("chgerId")) for item in items]
    if any(not station or not charger for station, charger in identities):
        raise RuntimeError("충전소/충전기 ID가 누락되었습니다.")
    if len(set(identities)) != len(identities):
        raise RuntimeError("페이지 사이에 중복 충전기가 있습니다. 다시 실행해 주세요.")
    return {
        "source": "한국환경공단_전기자동차 충전소 정보",
        "sourceUrl": "https://www.data.go.kr/data/15076352/openapi.do",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "region": "서울특별시", "zcode": "11",
        "stationCount": len({item["statId"] for item in items}),
        "chargerCount": len(items), "apiTotalCount": total, "items": items,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, default=BASE_DIR / ".env")
    parser.add_argument("--output", type=Path, default=BASE_DIR / "data/seoul_chargers.json")
    parser.add_argument("--page-size", type=int, default=1000, help="페이지당 건수 (10~9999, 기본 1000)")
    parser.add_argument("--timeout", type=float, default=60, help="요청 제한 시간(초)")
    args = parser.parse_args()
    if not 10 <= args.page_size <= 9999 or args.timeout <= 0:
        parser.error("page-size는 10~9999, timeout은 양수여야 합니다.")
    try:
        data = fetch_all(load_key(args.env), args.page_size, args.timeout)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # 조회가 모두 성공한 후 교체하여 실패 시 기존 결과를 보존합니다.
        temporary = args.output.with_name(args.output.name + ".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(args.output)
    except (ValueError, RuntimeError) as exc:
        print(f"조회 실패: {exc}", file=sys.stderr)
        return 1
    except OSError:
        print("저장 실패: 출력 경로와 파일 권한을 확인해 주세요.", file=sys.stderr)
        return 1
    print(f"저장 완료: 충전소 {data['stationCount']:,}개 / 충전기 {data['chargerCount']:,}대 → {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
