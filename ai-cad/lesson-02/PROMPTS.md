# 코덱스에서 입력할 요청

영상은 실제 코덱스 CLI입니다. 코덱스 앱에서도 동일한 시작 폴더와 요청을 사용합니다. 요청을 한 개씩 보내고 실제 결과를 확인한 뒤 다음으로 넘어갑니다.

## 요청 1

outputs/before/organizer.step이 구멍6mm·두께3mm인지 verify_one.py로 실제 검사해줘. before는 보존해. 측정값을 짧게 보여줘.

## 요청 2

구멍 지름만8mm, 두께만5mm로 바꿔줘. 가로·세로·구멍 위치·고정 구멍·틈은 유지하고 before는 보존해. run_after.py를 만들어 outputs/after에 실제 생성하고 verify_one.py로 검사해. 바뀐 값·유지한 값과 결과를 보여줘.

## 요청 3

같은 모델로 구멍7mm·두께4mm 과제를 outputs/exercise에 생성해줘. 원본 코드와 before·after는 보존하고 verify_one.py로 검사해. 실행 결과와 측정값을 짧게 보여줘.

## 새 환경 준비가 필요한 경우

이 폴더의 README와 requirements.txt를 읽고 운영체제에 맞는 Python3.12 가상환경을 만들어줘. 전역 환경은 바꾸지 말고 이 폴더 안에만 설치해. environment_check.py를 실제 실행하고 설치 버전과 결과를 보여줘.
