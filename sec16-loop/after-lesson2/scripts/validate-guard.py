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
            ('external pre separated', shell("rg --pre './helper' 'a|b' tests"), 0 if enabled else 2),
            ('external pre quoted flag', shell("rg '--pre=./helper' 'a|b' tests"), 0 if enabled else 2),
            ('single read', shell('cat tests/rules/refund.test.ts'), 0),
            ('semicolon reads', shell('git status --short; rg --files src tests; cat tests/rules/refund.test.ts'), 0),
            ('AND reads', shell('cat tests/a.ts && wc -l tests/a.ts'), 0),
            ('OR reads', shell('rg term tests || ls tests'), 0),
            ('pipe reads', shell('cat tests/a.ts | head -n 2'), 0),
            ('newline reads', shell('pwd\nls tests\nwc -l tests/a.ts'), 0),
            ('mixed writes', shell('cat tests/a.ts; touch tests/b.ts'), 0 if enabled else 2),
            ('read redirect write', shell('cat src/a.ts > tests/a.ts'), 0 if enabled else 2),
            ('substitution', shell('cat tests/$(touch tests/a.ts)'), 0 if enabled else 2),
            ('rg external pre', shell('rg --pre=./helper term tests'), 0 if enabled else 2),
            ('background', shell('cat tests/a.ts & touch tests/b.ts'), 0 if enabled else 2),
            ('switch read', shell('cat .codex/TEST_WRITING; ls .codex'), 0),
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
          'syntax': 'PASS', 'real_switch_unchanged': before_marker == marker_state(),
          'total': len(results), 'passed': len(results) - len(failed),
          'failed': len(failed), 'cases': results}
Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(f"GUARD_CASES={report['passed']}/{report['total']} FAIL={len(failed)}")
for row in failed:
    print(f"FAIL {row['mode']} / {row['case']}: expected={row['expected_exit']} actual={row['actual_exit']}")
raise SystemExit(1 if failed or not report['real_switch_unchanged'] else 0)
