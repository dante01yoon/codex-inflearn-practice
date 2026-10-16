# 소프트웨어와 하드웨어를 AI로 연결하기 — CAD 기초 3강

이 폴더는 기존 인프런 강의 저장소 `codex-inflearn-practice`에 추가하는 CAD 실습입니다. 기존 저장소를 이미 받았다면 새 저장소를 만들 필요가 없습니다.

## 기존 저장소에서 시작

1. GitHub Desktop의 **Fetch origin → Pull origin** 또는 저장소 터미널에서 `git pull --ff-only`로 최신 파일을 받습니다.
2. 첫 강의는 `ai-cad/lesson-01/start` 폴더를 복사해 작업 폴더로 사용합니다. 전체 저장소 루트에서 바로 설계를 요청하지 않습니다.
3. 코덱스 앱에서 복사한 폴더를 열거나, 해당 폴더의 터미널에서 `codex`를 실행합니다.
4. 폴더 안 `PROMPTS.md`의 환경 준비 요청부터 보냅니다. 설계·실행·검사·수정도 같은 대화에서 이어갑니다.
5. 다음 강의는 앞 강의의 결과를 이어 쓰거나 해당 강의 `start` 폴더로 시작합니다.

처음 받는 경우:
```sh
git clone https://github.com/dante01yoon/codex-inflearn-practice.git
cd codex-inflearn-practice/ai-cad/lesson-01/start
```

위 Git 명령은 macOS와 Windows PowerShell에서 같습니다. Python 가상환경 실행 경로는 아래처럼 운영체제에 맞게 사용합니다. CLI는 이미 설치한 수강생을 위한 선택 경로이며, 코덱스 앱 실습은 CLI 설치가 필요하지 않습니다.

이후 강의의 시작점은 `ai-cad/lesson-02/start`, `ai-cad/lesson-03/start`입니다. 촬영은 macOS의 실제 Codex CLI 0.162.1, GPT-6.1 Sol Medium으로 진행했습니다. Windows 명령은 제공하며 Windows 실제 실행은 아직 검증하지 않았습니다.

---

# CAD 기초 3강 — 코덱스 CLI·앱 실습 자료 v3

「단테와 함께 시작하는 코덱스 완벽 가이드」 추가 섹션.

## 실습 동선

1. 각 강의 `start/` 폴더를 복사해 코덱스 앱에서 열거나 해당 폴더의 터미널에서 `codex`를 실행합니다.
2. `PROMPTS.md`의 요청을 코덱스 입력창에 보냅니다. 환경 준비 → 설계 → 실행 → 검사 → 수정도 같은 대화에서 합니다.
3. 코덱스가 실행한 명령과 종료 코드, 생성 파일, 검사 JSON을 확인합니다.
4. 입체를 회전해서 볼 때만 생성한 viewer.html 또는 STEP/STL을 여는 CAD 뷰어를 사용합니다.

HTML은 결과 확인용 선택 도구입니다. 별도 HTML 프롬프트 입력창·강의용 서버·웹 실행 버튼은 사용하지 않습니다. 이 자료에는 해당 보조 앱을 포함하지 않았습니다. Codex CLI를 이미 쓰는 수강생은 동일 폴더에서 같은 요청을 사용할 수 있습니다. 앱으로 실습하는 데 CLI 설치를 별도로 요구하지 않습니다.

## 강의별 파일

- 1강: 기본 케이블 정리대 생성·치수 검사. [튜토리얼](lesson-01/TUTORIAL.md) · [요청문](lesson-01/PROMPTS.md)
- 2강: 구멍6→8mm·두께3→5mm, 유지 조건 검사. [튜토리얼](lesson-02/TUTORIAL.md) · [요청문](lesson-02/PROMPTS.md)
- 3강: STEP 재열기·지름5mm 추가 구멍, 지름4mm 과제. [튜토리얼](lesson-03/TUTORIAL.md) · [요청문](lesson-03/PROMPTS.md)

`start/`는 시작 파일, `result/`는 예시 완료 상태, `solutions/`는 과제 정답입니다. ASSIGNMENTS.md와 SOLUTIONS.md를 함께 제공합니다. 생성 코드가 예시와 같아야 하는 것이 아니라 요구 치수·저장 파일·독립 검사로 성공을 확인합니다.

## 환경

Python3.12, smlibpy0.3.3, CadQuery2.8.0. 코덱스 계정과 모델 이용은 별도입니다. 위 환경 준비 요청으로 운영체제에 맞는 명령을 실행시킬 수 있습니다.

macOS 수동 설치 참고:
```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python environment_check.py
```

Windows PowerShell 수동 설치 참고:
```powershell
py -3.12 -X utf8 -m venv .venv
.\.venv\Scripts\python.exe -X utf8 -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -X utf8 environment_check.py
```

위 명령은 각 `start/` 안에서 실행하는 기준입니다. 가상환경을 활성화하지 않아도 실행 파일 경로를 직접 지정할 수 있습니다. 튜토리얼의 `python` 예시도 이 환경의 실행 파일로 바꾸어 사용하세요.

## 영상과 검증 범위

영상은 실제 코덱스 CLI0.162.1에서 시작 폴더를 열고 요청·실행·검사·추가 수정을 수행한 화면입니다. 앱 사용자도 같은 폴더와 요청으로 실습할 수 있습니다. 별도 HTML 프롬프트 입력창·서버는 필요하지 않습니다. HTML/CAD 뷰어는 결과를 회전해 볼 때 선택합니다.

영상에서 실제 생성한 설계·수정 코드와 결과를 반영했습니다. 2강 시작·정답의 생성 코드는 1강 마지막 결과로 통일하고 재현 검사를 별도로 수행합니다. Windows·코덱스 앱 UI 실행·실제 출력·수강생 독립 수행은 미검증입니다.

원본: https://github.com/awv-informatik/smlibpy · https://github.com/CadQuery/cadquery
