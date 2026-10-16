# 코덱스에서 입력할 요청

영상은 실제 코덱스 CLI입니다. 코덱스 앱에서도 동일한 시작 폴더와 요청을 사용합니다. 요청을 한 개씩 보내고 실제 결과를 확인한 뒤 다음으로 넘어갑니다.

## 요청 1

현재 폴더의 Python과 CAD 환경을 점검해줘. python environment_check.py를 실제 실행하고 버전·결과를 짧게 보여줘.

## 요청 2

SPEC.md의 기본 케이블 정리대를 smlibpy로 만들어줘. 구멍6mm·두께3mm, 추가 구멍은 제외해. model.py의 --hole,--thickness,--out과 build(hole,thickness)를 제공하고 outputs/before에 STEP·STL·viewer.html·preview.png를 저장해. CAD-API.md를 참고하고 실제 생성·verify_one.py 독립 검사를 실행해. 결과와 측정값을 보여줘.

## 요청 3

생성된 STEP·STL·코드·검사 파일의 상대 경로와 측정 치수만 간단한 목록으로 보여줘. 고정 구멍2개와 케이블 구멍4개, 요청하지 않은 중앙 구멍이 없는지도 검사 JSON으로 확인해줘.

## 요청 4

저장 파일 이름을 실습 자료와 맞춰줘. model.py가 outputs/before/organizer.step과 organizer.stl을 저장하게 고치고 다시 실행해줘. verify_one.py로 검사해서 verified.json에 남겨줘. 형상은 바꾸지 말고 실제 파일 경로와 측정값을 보여줘.

## 새 환경 준비가 필요한 경우

이 폴더의 README와 requirements.txt를 읽고 운영체제에 맞는 Python3.12 가상환경을 만들어줘. 전역 환경은 바꾸지 말고 이 폴더 안에만 설치해. environment_check.py를 실제 실행하고 설치 버전과 결과를 보여줘.
