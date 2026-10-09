#!/usr/bin/env bash
# PreToolUse: stdin JSON only; never execute the command being inspected.
# Allow: exit 0, no output. Deny: exit 2, Korean reason on stderr.
set -u

deny() {
  printf '%s\n' "$1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || deny '차단: 훅 검사에 필요한 jq가 없습니다.'
payload=$(cat) || deny '차단: 훅 입력을 읽을 수 없습니다.'

# -s ensures exactly one JSON object. Do not print raw input or jq errors:
# the pending command might contain a real credential.
if ! printf '%s' "$payload" | jq -se '
  length == 1 and (.[0] | type == "object")
' >/dev/null 2>&1; then
  deny '차단: 훅 입력은 하나의 JSON 객체여야 합니다.'
fi

reason=$(printf '%s' "$payload" | jq -r '
  # Normalize dot segments in patch paths before checking directory names.
  def protected_path:
    gsub("\\\\"; "/")
    | split("/")
    | reduce .[] as $part ([];
        if $part == "" or $part == "." then .
        elif $part == ".." then .[0:([length - 1, 0] | max)]
        else . + [$part] end)
    | index("tests") != null;

  # This is a text guard, not a shell parser or filesystem sandbox.
  # Only unambiguous, single read commands may reference protected paths.
  def simple_read:
    test("^\\s*(/[^\\s]+/)?(cat|rg|grep|ls|head|tail|wc|diff|pwd|stat)\\b")
    and (test("[<>;|&`$()\\n\\r]") | not)
    and (test("--(pre|hostname-bin)(=|\\s|$)") | not);

  .tool_name as $tool
  | if ($tool | type) != "string" then
      "차단: 훅 입력에 tool_name 문자열이 필요합니다."
    elif ($tool | test("(^|[.:])(apply_patch|Bash|bash|shell|shell_command|exec_command|Edit|Write)$") | not) then
      ""
    else
      .tool_input as $input
      | (if ($input | type) == "string" then $input
         elif ($input | type) == "object" then
           ($input.command // $input.cmd // $input.patch // null)
         else null end) as $command
      | if ($command | type) != "string" then
          "차단: 검사할 명령 또는 패치 문자열이 없습니다."
        elif ($command | test("live_(g?sk|g?ck)_")) then
          "차단: 토스페이먼츠 실제 키가 명령 또는 패치에 포함되어 있습니다. 이 프로젝트에서는 테스트 키만 사용하세요."
        elif ($tool | test("(apply_patch|Edit|Write)$")) then
          if ($command | split("\n") | any(.[];
            select(test("^\\*\\*\\* (Add File|Update File|Delete File|Move to): "))
            | sub("^\\*\\*\\* (Add File|Update File|Delete File|Move to): "; "")
            | sub("\\r$"; "") | protected_path)) then
            "차단: tests/ 폴더의 파일 추가·수정·삭제·이동은 허용하지 않습니다. 구현 코드에서 문제를 해결하세요."
          else "" end
        else
          (if ($input | type) == "object" then
             ($input.workdir // $input.cwd // .cwd // "")
           else .cwd // "" end) as $workdir
          | if (($command | test("(^|[^A-Za-z0-9_.-])tests([/\\\\]|[^A-Za-z0-9_.-]|$)"))
                or ($workdir | protected_path))
               and ($command | simple_read | not) then
              "차단: tests/ 경로에 영향을 줄 수 있는 셸 명령입니다. tests/ 변경은 금지하며, 조회는 cat·rg·ls 등 단순 읽기 명령으로 실행하세요."
            else "" end
        end
    end
' 2>/dev/null) || deny '차단: 훅 입력을 안전하게 검사하지 못했습니다.'

if [[ -n "$reason" ]]; then
  deny "$reason"
fi
exit 0
