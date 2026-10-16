# 2강 · 치수를 바꾸고 수정 전후 검증하기

목표: 변경 조건과 유지 조건을 나누고 파일에서 측정해 비교한다.

## 준비

기존 강의 저장소의 `ai-cad/lesson-02/start/`를 별도 작업 폴더로 복사하세요. 상위 README의 Python3.12 가상환경·설치를 마친 뒤 `python environment_check.py`를 실행합니다. `준비 완료`와 설치 버전을 확인합니다.

코덱스 앱에서 이 강의의 `start/` 폴더를 열거나, 해당 폴더의 터미널에서 `codex`를 실행하고 `PROMPTS.md`의 요청을 입력합니다. 필요한 코드 작성·실행·검사를 같은 대화에서 진행합니다. 생성된 파일과 실행 결과를 직접 확인한 뒤 다음 요청으로 넘어갑니다.

별도 웹 입력창, `workshop.py`, 로컬 웹 서버, Codex CLI 설치는 앱 실습의 필수 조건이 아닙니다. CLI를 이미 사용한다면 같은 폴더에서 동일한 요청을 보낼 수 있습니다. 생성 코드가 예시와 달라도 요구 치수와 독립 검사 결과로 성공을 판단합니다.

## 1. 시작 상태 확인

start에는 model.py와 outputs/before가 있습니다. 먼저 before의 구멍6·두께3을 독립 검사합니다. 첫 강의 결과를 이어 써도 됩니다.

## 2. 변경 요청

> 구멍 지름만8mm, 두께만5mm로 바꿔줘. 가로·세로와 구멍 중심, 고정구멍, 전면틈은 유지해. 수정전은 outputs/before에 남기고 수정후는 outputs/after에 저장할 run_after.py도 만들어줘.

검토: 판의 외곽 크기까지 늘리지는 않았는가? 단위mm와 지름/반지름이 일치하는가? 현재 디렉터리와 출력 경로가 맞는가?

## 3. 실행 결과 확인

```sh
python model.py --hole 8 --thickness 5 --out outputs/after
python verify_one.py --file outputs/after/organizer.step --hole 8 --thickness 5 --report outputs/after/verified.json
```

PASS와[80,30,5], hole_mm=8을 확인합니다. 화면에서 같은 방향으로 수정전과후를 바꿔보고, 위에서는 구멍·옆에서는두께를 비교합니다. 유지 조건도 모두 PASS여야 합니다.

## 4. 과제 실행 예시

```sh
python model.py --hole 7 --thickness 4 --out outputs/exercise
python verify_one.py --file outputs/exercise/organizer.step --hole 7 --thickness 4 --report outputs/exercise/verified.json
```

정답 파일을 먼저 복사하지 말고 직접 실행한 파일과 solutions/를 대조하세요.


## 코덱스 앱에서 실행시키기

아래 명령은 직접 입력해야 하는 별도 학습 목표가 아니라, 코덱스가 실제로 무엇을 실행했는지 대조하는 참고입니다. “이 명령을 현재 가상환경으로 실행하고, 종료 코드와 검사 결과를 보여줘”라고 요청해도 됩니다. 완료 답변만 보고 넘어가지 말고 생성 파일·실제 실행 출력·검사 JSON을 함께 확인합니다.

## 화면에서 짚어 볼 부분

요청에서는 바꿀 치수·유지 조건·출력 폴더를 구분해 읽습니다. 실행 후에는 코덱스가 실제 실행한 명령과 종료 코드, 검사 JSON을 확인합니다. 결과 뷰어는 입체를 보는 용도이고 프롬프트는 계속 코덱스에서 입력합니다.
