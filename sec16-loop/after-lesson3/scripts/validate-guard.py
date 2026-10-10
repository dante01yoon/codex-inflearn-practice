"""Direct guard validation; never execute the inspected commands or patches.

The marker exists only in isolated fixture projects, never in this checkout.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--guard', default='.codex/guard.sh')
parser.add_argument('--report', default='docs/guard-validation.json')
args = parser.parse_args()
source = Path(args.guard).resolve()
results = []
syntax = subprocess.run(['bash', '-n', str(source)], capture_output=True, text=True)
if syntax.returncode:
    print('GUARD_SYNTAX=FAIL')
    raise SystemExit(1)
real_marker = source.parent / 'TEST_WRITING'
def marker_state():
    if not real_marker.exists() and not real_marker.is_symlink():
        return None
    data = real_marker.lstat()
    return [data.st_ino, data.st_mode, data.st_size, data.st_mtime_ns]
before_marker = marker_state()

def patch(action, path, extra=''):
    return {'tool_name': 'apply_patch', 'tool_input': {
        'patch': f'*** Begin Patch\n*** {action}: {path}\n{extra}*** End Patch\n'}}

def shell(command, cwd=None):
    data = {'command': command}
    if cwd is not None:
        data['workdir'] = cwd
    return {'tool_name': 'Bash', 'tool_input': data}

with tempfile.TemporaryDirectory(prefix='sec15-guard-fixtures-') as scratch:
    root = Path(scratch).resolve()
    project = root / 'project'
    config = project / '.codex'
    config.mkdir(parents=True)
    guard = config / 'guard.sh'
    shutil.copyfile(source, guard)
    helper = source.parent / 'guard-command.py'
    if helper.exists():
        shutil.copyfile(helper, config / helper.name)
    marker = config / 'TEST_WRITING'
    # Invalid switch types must never enable writes.
    for mode in ('absent', 'file', 'directory', 'symlink'):
        if mode == 'file':
            marker.write_text('fixture only\n')
        elif mode == 'directory':
            marker.mkdir()
        elif mode == 'symlink':
            target = root / 'ordinary-fixture'
            target.write_text('fixture only\n')
            marker.symlink_to(target)
        enabled = mode == 'file'
        cases = [
            ('source patch', patch('Update File', 'src/rules/refund.ts', '+// fixture\n'), 0),
            ('test add', patch('Add File', 'tests/rules/payment.test.ts', '+// fixture\n'), 0 if enabled else 2),
            ('test update', patch('Update File', './src/../tests/rules/payment.test.ts', '+// fixture\n'), 0 if enabled else 2),
            ('test delete', patch('Delete File', 'tests/rules/payment.test.ts'), 0 if enabled else 2),
            ('test move destination', patch('Update File', 'src/a.ts', '*** Move to: tests/a.ts\n'), 0 if enabled else 2),
            ('test move source', patch('Update File', 'tests/a.ts', '*** Move to: src/a.ts\n'), 0 if enabled else 2),
            ('test shell write', shell('touch tests/new.ts'), 0 if enabled else 2),
            ('test split quotes', shell("touch te's'ts/new.ts"), 0 if enabled else 2),
            ('test cwd write', shell('touch new.ts', str(project / 'tests')), 0 if enabled else 2),
            ('Write tool test', {'tool_name': 'Write', 'tool_input': {'file_path': 'tests/new.ts', 'content': 'fixture'}}, 0 if enabled else 2),

            ('quoted regex pipe', shell("rg -n '실패|TEST_WRITING|runtime' ~/.codex/memories/MEMORY.md"), 0),
            ('double quoted regex pipe', shell('rg -n "실패|TEST_WRITING|runtime" .codex/guard.sh'), 0),
            ('quoted operators', shell("rg ';|&><$()' tests"), 0),
            ('quoted pipe word', shell("rg '|' tests | wc -l"), 0),
            ('escaped literal pipe', shell(r"rg a\|b tests"), 0),
            ('quoted regex plus pipeline', shell("rg 'a|b' tests | head -n 2; ls tests"), 0),
            ('quoted regex plus marker write', shell("rg 'a|b' tests | touch .codex/TEST_WRITING"), 2),
            ('quoted regex plus test write', shell("rg 'a|b' tests; touch tests/new.ts"), 0 if enabled else 2),
            ('quoted regex plus redirect', shell("rg 'a|b' tests > tests/output"), 0 if enabled else 2),
            ('double quoted substitution', shell('rg "$(touch .codex/TEST_WRITING)" tests'), 2),
            ('double quoted backticks', shell('rg "`touch .codex/TEST_WRITING`" tests'), 2),
            ('escaped quote then real write', shell(r'rg "a\"|b" tests; touch .codex/TEST_WRITING'), 2),
            ('unterminated marker quote', shell("rg 'TEST_WRITING .codex/guard.sh"), 2),
            ('trailing pipe marker', shell('cat .codex/TEST_WRITING |'), 2),
            ('external pre separated', shell("rg --pre './helper' 'a|b' tests"), 0),
            ('external pre quoted flag', shell("rg '--pre=./helper' 'a|b' tests"), 0),
            ('single read', shell('cat tests/rules/refund.test.ts'), 0),
            ('semicolon reads', shell('git status --short; rg --files src tests; cat tests/rules/refund.test.ts'), 0),
            ('AND reads', shell('cat tests/a.ts && wc -l tests/a.ts'), 0),
            ('OR reads', shell('rg term tests || ls tests'), 0),
            ('pipe reads', shell('cat tests/a.ts | head -n 2'), 0),
            ('newline reads', shell('pwd\nls tests\nwc -l tests/a.ts'), 0),
            ('mixed writes', shell('cat tests/a.ts; touch tests/b.ts'), 0 if enabled else 2),
            ('read redirect write', shell('cat src/a.ts > tests/a.ts'), 0 if enabled else 2),
            ('substitution', shell('cat tests/$(touch tests/a.ts)'), 0 if enabled else 2),
            ('rg external pre', shell('rg --pre=./helper term tests'), 0),
            ('background', shell('cat tests/a.ts & touch tests/b.ts'), 0 if enabled else 2),
            ('switch read', shell('cat .codex/TEST_WRITING; ls .codex'), 0),
            ('sed numeric read', shell("sed -n '240,360p' .codex/guard.sh"), 0),
            ('sed marker read', shell("sed -n '1p' .codex/TEST_WRITING"), 0),
            ('sed absolute read', shell("/usr/bin/sed -n '1,5p' .codex/guard.sh"), 0),
            ('sed last line read', shell("sed -n '$p' .codex/guard.sh"), 0),
            ('sed multiple prints', shell("sed -n '1,5p;8p' .codex/guard.sh"), 0),
            ('sed newline prints', shell("sed -n '1p\n3p' .codex/guard.sh"), 0),
            ('sed regex read', shell("sed -n '/TEST_WRITING/p' .codex/guard.sh"), 0),
            ('sed regex operator read', shell("sed -n '/a;w .codex|b/p' .codex/guard.sh"), 0),
            ('sed regex escaped slash', shell(r"sed -n '/\.codex\/guard/p' .codex/guard.sh"), 0),
            ('sed regex range', shell("sed -n '/start/,/end/p' .codex/guard.sh"), 0),
            ('sed combined flags', shell("sed -En '1,5p' .codex/guard.sh"), 0),
            ('sed multiple expressions', shell("sed -n -e '1p' -e '3p' .codex/guard.sh"), 0),
            ('sed joined expression', shell("sed -n -e1p .codex/guard.sh"), 0),
            ('sed long expression', shell("sed --quiet --expression='1p' .codex/guard.sh"), 0),
            ('sed option terminator', shell("sed -n -- '1p' .codex/guard.sh"), 0),
            ('sed read from stdin', shell("cat .codex/guard.sh | sed -n '1,5p'"), 0),
            ('sed read in config cwd', shell("sed -n '1p' guard.sh", str(config)), 0),
            ('sed test read', shell("sed -n '1,5p' tests/a.ts"), 0),
            ('read marker in echo', shell('echo TEST_WRITING .codex/guard.sh'), 0),
            ('read marker in printf', shell("printf '%s\\n' TEST_WRITING .codex/guard.sh"), 0),
            ('loop blocked read reproduction', shell("cat docs/harness.md; rg --files -g '*TEST_WRITING*' -g 'AGENTS.md' -g '*payment*' -g '*approval*' -g '*constitution*' -g '!node_modules' -g '!.codex/**'; sed -n '240,360p' docs/prd.md"), 0),
            ('sed in place', shell("sed -i '' 's/a/b/' .codex/guard.sh"), 2),
            ('sed in place GNU', shell("sed -ni '1p' .codex/guard.sh"), 2),
            ('sed in place long', shell("sed --in-place -n '1p' .codex/guard.sh"), 2),
            ('sed write command', shell("sed -n '1w .codex/TEST_WRITING' src/a.ts"), 2),
            ('sed write second expression', shell("sed -n -e '1p' -e 'w .codex/guard.sh' src/a.ts"), 2),
            ('sed substitution write flag', shell("sed -n 's/a/b/w .codex/guard.sh' src/a.ts"), 2),
            ('sed execute command', shell("sed -n 'e touch .codex/TEST_WRITING' src/a.ts"), 2),
            ('sed substitution execute flag', shell("sed -n 's/.*/touch .codex\/TEST_WRITING/e' src/a.ts"), 2),
            ('sed external program', shell('sed -n -f .codex/program.sed src/a.ts'), 0),
            ('sed expression after file', shell("sed -n '1p' src/a.ts -e 'w .codex/guard.sh'"), 2),
            ('sed redirect marker', shell("sed -n '1p' src/a.ts > .codex/TEST_WRITING"), 2),
            ('sed mixed marker write', shell("sed -n '1p' .codex/guard.sh; touch .codex/TEST_WRITING"), 2),
            ('sed command substitution', shell('sed -n "$(touch .codex/TEST_WRITING)" src/a.ts'), 2),
            ('sed actual config append', shell("printf x >> .codex/hooks.json"), 2),
            ('sed config delete', shell('rm .codex/guard.sh'), 2),
            ('sed config chmod', shell('chmod +x .codex/guard.sh'), 2),
            ('switch create', shell('touch .codex/TEST_WRITING'), 2),
            ('switch delete', shell('rm .codex/TEST_WRITING'), 2),
            ('switch overwrite', shell('printf x > .codex/TEST_WRITING'), 2),
            ('switch rename source', shell('mv .codex/TEST_WRITING elsewhere'), 2),
            ('switch rename destination', shell('mv elsewhere .codex/TEST_WRITING'), 2),
            ('switch quoted', shell("touch '.codex/TEST_WRITING'"), 2),
            ('switch split quotes', shell("touch .co'dex'/TE'ST_WRITING'"), 2),
            ('switch cwd write', shell('touch TEST_WRITING', str(config)), 2),
            ('switch parent delete', shell('rm -rf .codex'), 2),
            ('switch parent rename', shell('mv .codex old-config'), 2),
            ('project delete', shell('rm -rf .'), 2),
            ('absolute project delete', shell('rm -rf ' + str(project)), 2),
            ('absolute parent delete', shell('rm -rf ' + str(root)), 2),
            ('safe git diff reads', shell('git diff --no-ext-diff --no-textconv -- tests; ls tests'), 0),
            ('git diff output write', shell('git diff --output=tests/result'), 0 if enabled else 2),
            ('git clean', shell('git clean -fdx'), 2),
            ('sort pipeline regression', shell('rg --files src tests | sort'), 0),
            ('sort pipeline config read', shell('rg --files .codex | sort | uniq'), 0),
            ('unlisted reader', shell('some-reader tests/a.ts'), 0),
            ('awk read', shell("awk '{print $0}' tests/a.ts"), 0),
            ('python read', shell('python3 -c "from pathlib import Path; print(Path(\"tests/a.ts\").read_text())"'), 0),
            ('sed stdout substitution', shell("sed 's/old/new/g' tests/a.ts"), 0),
            ('input redirect', shell('sort < tests/a.ts'), 0),
            ('output unprotected', shell('rg --files src tests | sort > logs/list.txt'), 0),
            ('copy test as source', shell('cp tests/a.ts logs/a.ts'), 0),
            ('git stage config', shell('git add .codex/guard.sh'), 0),
            ('git stage tests', shell('git add tests/a.ts'), 0),
            ('test delete shell', shell('rm tests/a.ts'), 0 if enabled else 2),
            ('test move shell', shell('mv tests/a.ts src/a.ts'), 0 if enabled else 2),
            ('test copy destination', shell('cp src/a.ts tests/a.ts'), 0 if enabled else 2),
            ('test sed in place', shell("sed -i '' 's/old/new/' tests/a.ts"), 0 if enabled else 2),
            ('test sed write stdout', shell("sed -n 'w tests/out.ts' src/a.ts"), 0 if enabled else 2),
            ('test redirect append', shell('printf x >> tests/a.ts'), 0 if enabled else 2),
            ('test tee', shell('printf x | tee tests/a.ts'), 0 if enabled else 2),
            ('test sort output', shell('sort tests/a.ts -o tests/a.ts'), 0 if enabled else 2),
            ('test dd output', shell('dd if=src/a.ts of=tests/a.ts'), 0 if enabled else 2),
            ('read substitution', shell('cat "$(echo tests/a.ts)"'), 0),
            ('move target option', shell('mv src/a.ts --target-directory=tests'), 0 if enabled else 2),
            ('copy target option', shell('cp --target-directory=tests src/a.ts'), 0 if enabled else 2),
            ('config target option', shell('mv src/a.ts --target-directory=.codex'), 2),
            ('python literal write', shell("python3 -c 'from pathlib import Path; Path(\"tests/a.ts\").write_text(\"x\")'"), 0 if enabled else 2),
            ('python open write', shell("python3 -c 'open(\"tests/a.ts\", \"w\").write(\"x\")'"), 0 if enabled else 2),
            ('python config write', shell("python3 -c 'from pathlib import Path; Path(\".codex/guard.sh\").write_text(\"x\")'"), 2),
            ('node literal write', shell("node -e 'require(\"fs\").writeFileSync(\"tests/a.ts\", \"x\")'"), 0 if enabled else 2),
            ('awk literal write', shell('awk \'{print "x" > "tests/a.ts"}\' src/a.ts'), 0 if enabled else 2),
            ('copy test source target first', shell('cp -t logs tests/a.ts'), 0),
            ('python unprotected rename', shell("python3 -c 'import os; os.rename(\"src/a.ts\", \"src/b.ts\")'"), 0),
            ('sed inplace regex literal config', shell("sed -i '' -e 's/.codex/new/' src/a.ts"), 0),
            ('sed alternate delimiter write', shell("sed -n 's#old#new#w tests/a.ts' src/a.ts"), 0 if enabled else 2),
            ('quoted redirect is data', shell("printf '%s' '>' tests/a.ts"), 0),
            ('quoted pipe is data', shell("echo '|' touch tests/a.ts"), 0),
            ('switch add patch', patch('Add File', '.codex/TEST_WRITING', '+fixture\n'), 2),
            ('switch delete patch', patch('Delete File', '.codex/TEST_WRITING'), 2),
            ('switch normalized patch', patch('Update File', 'src/../.codex/TEST_WRITING', '+fixture\n'), 2),
            ('switch patch move', patch('Update File', 'src/a.ts', '*** Move to: .codex/TEST_WRITING\n'), 2),
            ('switch Write', {'tool_name': 'Write', 'tool_input': {'file_path': '.codex/TEST_WRITING', 'content': 'fixture'}}, 2),
            ('switch Edit', {'tool_name': 'Edit', 'tool_input': {'file_path': '.codex/TEST_WRITING', 'old_string': '', 'new_string': 'fixture'}}, 2),
            ('fake live key', shell('echo live_' + 'sk_' + 'FAKE_FIXTURE_NOT_A_KEY'), 2),
            ('fake test key', shell('echo test_' + 'sk_' + 'FAKE_FIXTURE_NOT_A_KEY'), 0),
            ('invalid input', [], 2),
            ('missing tool name', {'tool_input': {'command': 'pwd'}}, 2),
            ('missing command', {'tool_name': 'Bash', 'tool_input': {}}, 2),
        ]
        for name, payload, expected in cases:
            run = subprocess.run(['bash', str(guard)], input=json.dumps(payload),
                                 text=True, capture_output=True, cwd=project)
            passed = (run.returncode == expected and run.stdout == ''
                      and (run.stderr == '' if expected == 0 else bool(run.stderr.strip())))
            results.append({'mode': mode, 'case': name, 'expected_exit': expected,
                            'actual_exit': run.returncode, 'result': 'PASS' if passed else 'FAIL',
                            'reason': run.stderr.strip()})
        # Clean only fixture markers in this temporary project.
        if mode == 'directory':
            marker.rmdir()
        elif mode in ('file', 'symlink'):
            marker.unlink()

failed = [row for row in results if row['result'] == 'FAIL']
report = {'scope': 'direct stdin validation; inspected actions not executed; real switch untouched',
          'guard': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'helper_sha256': hashlib.sha256(helper.read_bytes()).hexdigest() if helper.exists() else None,
          'syntax': 'PASS', 'real_switch_unchanged': before_marker == marker_state(),
          'total': len(results), 'passed': len(results) - len(failed),
          'failed': len(failed), 'cases': results}
Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f"GUARD_CASES={report['passed']}/{report['total']} FAIL={len(failed)}")
for row in failed:
    print(f"FAIL {row['mode']} / {row['case']}: expected={row['expected_exit']} actual={row['actual_exit']}")
raise SystemExit(1 if failed or not report['real_switch_unchanged'] else 0)
