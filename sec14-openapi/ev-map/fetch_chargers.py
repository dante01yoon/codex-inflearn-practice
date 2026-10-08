#!/usr/bin/env python3
"""서울 충전기 최대 500개 조회 및 충전소별 집계. 인증키는 출력하지 않습니다."""

import json
import re
import shlex
import sys
import xml.etree.ElementTree as ET
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, unquote, urlencode
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent
ENDPOINT = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo'
PARAMS = {'pageNo': '1', 'numOfRows': '10', 'zcode': '11', 'dataType': 'JSON'}


def load_key(path):
    """.env의 지정된 값만 읽습니다. 환경변수 대체나 명령 실행은 하지 않습니다."""
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if line.startswith('export '):
            line = line[7:].lstrip()
        name, separator, value = line.partition('=')
        if separator and name.strip() == 'DATA_GO_KR_KEY':
            tokens = shlex.split(value, comments=True)
            if len(tokens) == 1 and tokens[0]:
                return tokens[0]
            break
    raise ValueError('DATA_GO_KR_KEY 설정을 확인해 주세요.')


def build_url(key, mode, limit=10):
    if not 1 <= limit <= 500:
        raise ValueError('충전기는 최대 500개까지 요청할 수 있습니다.')
    params = {**PARAMS, 'numOfRows': str(limit)}
    # unquote_plus는 사용하지 않습니다: 디코딩 키의 +를 공백으로 바꾸기 때문입니다.
    decoded = unquote(key)
    if mode == 'encoded':
        # 이미 인코딩한 키는 urlencode에 다시 넣지 않습니다.
        return ENDPOINT + '?serviceKey=' + quote(decoded, safe='') + '&' + urlencode(params)
    if mode == 'decoded':
        return ENDPOINT + '?' + urlencode({'serviceKey': decoded, **params})
    raise ValueError('지원하지 않는 키 전달 방식입니다.')


def redact(value, key):
    """서버가 키를 되돌려 주더라도 파일에 기록하지 않습니다."""
    decoded = unquote(key)
    encoded = quote(decoded, safe='')
    secrets = sorted({key, decoded, encoded, encoded.lower(), quote(encoded, safe='')},
                     key=len, reverse=True)
    if isinstance(value, str):
        for secret in secrets:
            value = value.replace(secret, '[REDACTED]')
        return value
    if isinstance(value, list):
        return [redact(item, key) for item in value]
    if isinstance(value, dict):
        return {redact(name, key): redact(item, key) for name, item in value.items()}
    return value


def parse_response(raw):
    """JSON 응답과 XML 응답/게이트웨이 오류를 처리합니다."""
    try:
        payload = json.loads(raw)
        root = payload.get('response', payload)
        header = root.get('header', root)
        body = root.get('body', root)
        items = body.get('items', {})
        rows = items.get('item', []) if isinstance(items, dict) else items
        return payload, str(header.get('resultCode', '')), rows
    except json.JSONDecodeError:
        root = ET.fromstring(raw)
        code = root.findtext('.//resultCode') or root.findtext('.//returnReasonCode') or ''
        rows = [{child.tag: child.text or '' for child in item}
                for item in root.findall('.//items/item')]
        payload = {
            'header': {'resultCode': code, 'resultMsg': root.findtext('.//resultMsg', '')},
            'numOfRows': root.findtext('.//numOfRows', ''),
            'pageNo': root.findtext('.//pageNo', ''),
            'totalCount': root.findtext('.//totalCount', ''),
            'items': {'item': rows},
        }
        return payload, code, rows


def fetch(key, mode, limit=10):
    result = {'mode': mode, 'status': 'FAIL'}
    try:
        request = Request(build_url(key, mode, limit), headers={'Accept': 'application/json'})
        try:
            with urlopen(request, timeout=30) as response:
                result['http_status'] = response.status
                raw = response.read()
        except HTTPError as error:
            result['http_status'] = error.code
            raw = error.read()
        payload, code, rows = parse_response(raw)
        # 임의 서버 메시지나 요청 URL은 보고하지 않습니다.
        result['result_code'] = code if re.fullmatch(r'\d{1,4}', code) else 'UNKNOWN'
        if result['http_status'] != 200 or code not in ('00', '0000'):
            result['reason'] = 'API 오류 (활용신청·인증키·호출 한도를 확인해 주세요)'
            return result, None
        if not isinstance(rows, list) or not 1 <= len(rows) <= limit:
            result['reason'] = '응답의 충전기 개수가 요청 범위를 벗어났습니다'
            return result, None
        if any(str(item.get('zcode')) != '11' for item in rows):
            result['reason'] = '서울 지역코드 검증에 실패했습니다'
            return result, None
        result.update(status='PASS', count=len(rows))
        return result, redact(payload, key)
    except Exception:
        # 예외 문자열에는 인증키가 붙은 URL이 포함될 수 있으므로 출력 금지.
        result['reason'] = '네트워크 연결 또는 응답 파싱 실패'
        return result, None


def group_stations(rows):
    """충전소 ID로 묶고 (충전소 ID, 충전기 ID) 중복은 제외합니다."""
    if len(rows) > 500:
        raise ValueError('충전기 500개 제한을 초과했습니다.')
    stations = {}
    seen = set()
    for row in rows:
        station_id = str(row.get('statId', '')).strip()
        charger_id = str(row.get('chgerId', '')).strip()
        if str(row.get('zcode')) != '11' or not station_id or not charger_id:
            raise ValueError('서울 지역 및 충전소/충전기 ID를 확인해 주세요.')
        identity = (station_id, charger_id)
        if identity in seen:
            continue
        seen.add(identity)
        try:
            lat, lng = float(row.get('lat', '')), float(row.get('lng', ''))
            valid = math.isfinite(lat) and math.isfinite(lng) and 37.3 <= lat <= 37.8 and 126.7 <= lng <= 127.3
        except (TypeError, ValueError):
            valid = False
        if station_id not in stations:
            stations[station_id] = {
                'id': station_id, 'name': row.get('statNm') or '이름 없음',
                'address': row.get('addr') or '주소 없음',
                'lat': lat if valid else None, 'lng': lng if valid else None,
                'chargerCount': 0,
            }
        station = stations[station_id]
        station['chargerCount'] += 1
        if station['lat'] is None and valid:
            station.update(lat=lat, lng=lng)
    return {
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'source': '한국환경공단 전기자동차 충전소 정보',
        'limit': 500, 'receivedCount': len(rows), 'chargerCount': len(seen),
        'stationCount': len(stations),
        'unmappedStationCount': sum(s['lat'] is None for s in stations.values()),
        'stations': list(stations.values()),
    }


def main():
    key = load_key(BASE_DIR / '.env')
    checks = []
    sample = None
    for mode in ('encoded', 'decoded'):
        result, payload = fetch(key, mode, limit=500)
        checks.append(result)
        print(json.dumps(result, ensure_ascii=False))
        if sample is None and payload is not None:
            sample = payload
            break
    directory = BASE_DIR / 'data'
    directory.mkdir(exist_ok=True)
    (directory / 'key_check.json').write_text(
        json.dumps(checks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if sample is None:
        print('저장 실패: 유효한 서울 충전기 응답을 받지 못했습니다.')
        return 1
    _, _, rows = parse_response(json.dumps(sample))
    grouped = group_stations(rows)
    target = directory / 'seoul.json'
    temporary = directory / 'seoul.json.tmp'
    temporary.write_text(json.dumps(grouped, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(target)
    print(f"서울 충전기 {grouped['chargerCount']}개 → 충전소 {grouped['stationCount']}곳 저장 완료: data/seoul.json")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('실행 실패: .env 설정과 저장 경로를 확인해 주세요.', file=sys.stderr)
        sys.exit(1)
