# 3강 · STEP 파일 다시 열고 추가 가공하기

목표: 다른 엔진으로 STEP을 읽고 새 구멍을 가공한 뒤 저장·재열기까지 확인한다.

## 준비

기존 강의 저장소의 `ai-cad/lesson-03/start/`를 별도 작업 폴더로 복사하세요. 상위 README의 Python3.12 가상환경·설치를 마친 뒤 `python environment_check.py`를 실행합니다. `준비 완료`와 설치 버전을 확인합니다.

코덱스 앱에서 이 강의의 `start/` 폴더를 열거나, 해당 폴더의 터미널에서 `codex`를 실행하고 `PROMPTS.md`의 요청을 입력합니다. 필요한 코드 작성·실행·검사를 같은 대화에서 진행합니다. 생성된 파일과 실행 결과를 직접 확인한 뒤 다음 요청으로 넘어갑니다.

별도 웹 입력창, `workshop.py`, 로컬 웹 서버, Codex CLI 설치는 앱 실습의 필수 조건이 아닙니다. CLI를 이미 사용한다면 같은 폴더에서 동일한 요청을 보낼 수 있습니다. 생성 코드가 예시와 달라도 요구 치수와 독립 검사 결과로 성공을 판단합니다.

## 1. 다시 열기

start/outputs/after/organizer.step이 시작 파일입니다. start/reopen_and_edit.py는 파일 읽기와 치수 확인까지만 들어 있습니다.

```sh
python reopen_and_edit.py
```

기본 시작 파일의 정상 여부와[80,30,5]를 확인합니다. SMLib로 만든 STEP을 CadQuery/OpenCASCADE로 읽습니다. 원래 피처 이력이 모두 복원되는 뜻은 아닙니다.

## 2. 가공 요청

> 다시 연 STEP 모델에 추가구멍 하나를 뚫어줘. 중심은x=0,y=-8, 지름5mm. 기존 형상은 유지해줘. --input,--out,--diameter 인자를 받고, 실제 제거부피와 원기둥 공식이 같은지 검사해. 저장한 STEP을 다시 열어 정상 솔리드와 부피도 확인해줘.

## 3. 실행 결과 확인

```sh
python reopen_and_edit.py --input outputs/after/organizer.step --diameter 5 --out outputs/edited
```

뒤쪽 중앙에 추가구멍5mm가 생겨야 합니다. 반지름2.5·두께5의 원기둥부피 π×2.5²×5≈98.174770mm³와 실제 줄어든 부피를 비교합니다. 출력 result.json의 result=PASS, added_hole_diameter_mm=5, removed_volume_mm3와expected_removed_volume_mm3 일치를 확인합니다.

## 4. 과제

```sh
python reopen_and_edit.py --input outputs/after/organizer.step --diameter 4 --out outputs/exercise-edit
```

π×2²×5≈62.831853mm³가 기준입니다. 기존 구멍과 판 외곽은 유지합니다. STEP 재열기와 STL 저장도 확인하세요.


## 추가 독립 검사

```sh
python verify_edited.py --file outputs/edited/organizer.step --diameter 5 --report outputs/edited/independent.json
python verify_edited.py --file outputs/exercise-edit/organizer.step --diameter 4 --report outputs/exercise-edit/independent.json
```

추가구멍의 위치·지름과 주변재료, 기존케이블·고정구멍, 외곽크기까지 검사합니다.

## 코덱스 앱에서 실행시키기

아래 명령은 직접 입력해야 하는 별도 학습 목표가 아니라, 코덱스가 실제로 무엇을 실행했는지 대조하는 참고입니다. “이 명령을 현재 가상환경으로 실행하고, 종료 코드와 검사 결과를 보여줘”라고 요청해도 됩니다. 완료 답변만 보고 넘어가지 말고 생성 파일·실제 실행 출력·검사 JSON을 함께 확인합니다.

## 화면에서 짚어 볼 부분

요청에서는 바꿀 치수·유지 조건·출력 폴더를 구분해 읽습니다. 실행 후에는 코덱스가 실제 실행한 명령과 종료 코드, 검사 JSON을 확인합니다. 결과 뷰어는 입체를 보는 용도이고 프롬프트는 계속 코덱스에서 입력합니다.
