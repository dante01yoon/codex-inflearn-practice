# 코덱스에서 입력할 요청

영상은 실제 코덱스 CLI입니다. 코덱스 앱에서도 동일한 시작 폴더와 요청을 사용합니다. 요청을 한 개씩 보내고 실제 결과를 확인한 뒤 다음으로 넘어갑니다.

## 요청 1

python reopen_and_edit.py로 outputs/after/organizer.step을 다시 읽어줘. 기존 SMLib 생성 코드를 재실행하지 말고 저장한 STEP을 읽어. 정상 솔리드1개와 가로80·세로30·두께5mm를 확인해줘.

## 요청 2

다시 연 STEP에 x=0,y=-8,지름5mm 관통 구멍을 추가해줘. 기존 모양은 유지해. reopen_and_edit.py의 --input,--out,--diameter를 유지하고 outputs/edited에 STEP·STL을 실제 저장해. 제거 부피·원기둥 공식·저장 STEP 재열기와 verify_edited.py 검사를 실행해. 결과를 짧게 보여줘.

## 요청 3

동일한 원본 STEP에서 추가 구멍 지름4mm 변형을 outputs/exercise-edit에 생성해줘. 기존 외곽과 구멍 위치는 유지하고 제거 부피·저장 후 재열기·verify_edited.py 검사까지 실제 실행해. 결과를 짧게 보여줘.

## 새 환경 준비가 필요한 경우

이 폴더의 README와 requirements.txt를 읽고 운영체제에 맞는 Python3.12 가상환경을 만들어줘. 전역 환경은 바꾸지 말고 이 폴더 안에만 설치해. environment_check.py를 실제 실행하고 설치 버전과 결과를 보여줘.
