"""Default-allow command guard, not a shell sandbox. Never execute the input."""
import fnmatch
import ast
import json
import os
from pathlib import Path
import re
import sys

root = os.path.realpath(sys.argv[1])
writing = sys.argv[2] == 'true'


def protected(path, cwd, ancestors=False):
    if '$' in path or '__GUARD_EXPANSION__' in path:
        return True  # A known writer with an unresolved destination.
    full = os.path.abspath(os.path.join(cwd, path))
    parts = Path(full).parts
    if '.codex' in parts or parts[-1] == 'TEST_WRITING':
        return True
    targets = [root + '/.codex', root + '/.codex/TEST_WRITING']
    if not writing:
        targets.append(root + '/tests')
        if full.startswith(root + '/tests/'):
            return True
    for target in targets:
        if fnmatch.fnmatchcase(target, full):
            return True
        if ancestors and target.startswith(full.rstrip('/') + '/'):
            return True
    return False


def substitutions(command):
    """Extract unquoted/double-quoted $(...) and backticks before shlex.

    Single-quoted regex text is literal. Nested bodies are checked recursively.
    The replacement is deliberately unresolved for write destination checks.
    """
    output, bodies, quote, i = [], [], None, 0
    while i < len(command):
        ch = command[i]
        if ch == '\\' and quote != "'":
            output.append(command[i:i + 2])
            i += 2
            continue
        if ch == "'" and quote != '"':
            quote = None if quote == "'" else "'"
        elif ch == '"' and quote != "'":
            quote = None if quote == '"' else '"'
        if quote != "'" and (command.startswith('$(', i) or ch == '`'):
            backtick = ch == '`'
            start = i + (1 if backtick else 2)
            j, depth, inner_quote = start, 1, None
            while j < len(command):
                value = command[j]
                if value == '\\' and inner_quote != "'":
                    j += 2
                    continue
                if backtick and value == '`':
                    break
                if value in "\"'":
                    inner_quote = None if inner_quote == value else (value if inner_quote is None else inner_quote)
                if not backtick and inner_quote is None:
                    depth += (value == '(') - (value == ')')
                    if depth == 0:
                        break
                j += 1
            if j == len(command):
                raise ValueError('닫히지 않은 명령 치환')
            bodies.append(command[start:j])
            output.append('__GUARD_EXPANSION__')
            i = j + 1
            continue
        output.append(ch)
        i += 1
    return ''.join(output), bodies


def operands(args):
    values, options = [], True
    for arg in args:
        if options and arg == '--':
            options = False
        elif not options or not arg.startswith('-') or arg == '-':
            values.append(arg)
    return values


def python_writes(program):
    try:
        tree = ast.parse(program)
    except SyntaxError:
        return []  # Unknown programs pass; the loop watches actual changes.
    def literal(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Call) and node.args:
            return literal(node.args[0])
        return '$unresolved'
    targets = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        method = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, 'id', '')
        if method == 'open':
            mode = next((literal(k.value) for k in node.keywords if k.arg == 'mode'),
                        literal(node.args[1]) if len(node.args) > 1 else 'r')
            if any(flag in mode for flag in 'wax+') and node.args:
                targets.append(literal(node.args[0]))
        elif method in {'write_text', 'write_bytes', 'touch', 'mkdir', 'unlink', 'rmdir', 'chmod', 'rename', 'replace'}:
            if isinstance(node.func, ast.Attribute):
                if isinstance(node.func.value, ast.Name) and node.func.value.id in {'os', 'shutil'}:
                    targets.append(literal(node.args[0]) if node.args else '$unresolved')
                else:
                    targets.append(literal(node.func.value))
            if method in {'rename', 'replace'} and node.args:
                targets.append(literal(node.args[-1]))
        elif method in {'remove', 'rmtree', 'copy', 'copyfile', 'move'} and node.args:
            targets.append(literal(node.args[-1] if method in {'copy', 'copyfile'} else node.args[0]))
            if method == 'move' and len(node.args) > 1:
                targets.append(literal(node.args[1]))
    return targets


def segment(words, cwd):
    if not words:
        return ''
    while words and re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', words[0]):
        words = words[1:]
    while words and os.path.basename(words[0]) in {'env', 'sudo', 'command', 'builtin'}:
        words = words[1:]
        while words and (words[0].startswith('-') or re.match(r'^\w+=', words[0])):
            words = words[1:]
    if not words:
        return ''
    name, args = os.path.basename(words[0]), words[1:]
    targets = []
    if name in {'touch', 'rm', 'rmdir', 'mv', 'mkdir', 'truncate', 'chmod', 'chown', 'chgrp', 'ln'}:
        targets = operands(args)
    elif name in {'cp', 'install'}:
        values = operands(args)
        explicit = any(arg in {'-t', '--target-directory'} or arg.startswith('--target-directory=') for arg in args)
        targets = [] if explicit else values[-1:]
        for i, arg in enumerate(args):
            if arg in {'-t', '--target-directory'} and i + 1 < len(args):
                targets.append(args[i + 1])
            elif arg.startswith('--target-directory='):
                targets.append(arg.split('=', 1)[1])
    elif name == 'tee':
        targets = operands(args)
    elif name == 'dd':
        targets = [arg[3:] for arg in args if arg.startswith('of=')]
    elif name in {'sort', 'git'}:
        for i, arg in enumerate(args):
            if arg in {'-o', '--output'} and i + 1 < len(args):
                targets.append(args[i + 1])
            elif arg.startswith('--output='):
                targets.append(arg.split('=', 1)[1])
            elif name == 'sort' and arg.startswith('-o') and arg != '-o':
                targets.append(arg[2:])
        if name == 'git' and args and args[0] in {'clean', 'reset', 'restore', 'checkout'}:
            targets += operands(args[1:]) or ['.']
    elif name in {'sed', 'perl'}:
        # In-place flags are writes; ordinary sed substitutions only print.
        inplace = any(arg.startswith('--in-place') or
                      re.match(r'^-[A-Za-z]*i', arg) for arg in args)
        if inplace:
            values = [value for value in operands(args) if value]
            # The first positional value is the program, not an output path.
            targets = values[1:] if not any(arg == '-e' or arg.startswith('-e') for arg in args) else values
        if name == 'sed':
            programs, positional, skip, external = [], [], False, False
            for i, arg in enumerate(args):
                if skip:
                    skip = False
                    continue
                if arg in {'-e', '--expression'} and i + 1 < len(args):
                    programs.append(args[i + 1])
                    skip = True
                elif arg.startswith('--expression='):
                    programs.append(arg.split('=', 1)[1])
                elif arg.startswith('-e'):
                    programs.append(arg[2:])
                elif arg in {'-f', '--file'}:
                    external = True
                    skip = True  # Opaque external programs are not inspected.
                elif not arg.startswith('-'):
                    positional.append(arg)
            files = [value for value in positional if value]
            if not programs and files and not external:
                programs.append(files.pop(0))
            if inplace:
                targets = files
            address = r'(?:[0-9]+|\$|/(?:\\.|[^/\\\n])*/)'
            printing = r'(?:' + address + r'(?:\s*,\s*' + address + r')?)?\s*p'
            for program in programs:
                if re.fullmatch(r'\s*' + printing + r'(?:\s*[;\n]\s*' + printing + r')*\s*;?\s*', program):
                    continue  # Regex contents can contain literal ";w".
                # w commands and substitution w flags name an output file.
                targets += re.findall(r'(?:^|[;\n/\x23]|[0-9])\s*w\s+([^;\n]+)', program)
                if re.search(r'(?:^|[;\n])\s*(?:[0-9]+)?e\s+', program):
                    reason = shell_reason(re.sub(r'^\s*(?:[0-9]+)?e\s+', '', program), cwd)
                    if reason:
                        return reason
                if re.search(r'/[gIp0-9]*e\s*$', program) and re.search(r'touch|rm|mv|tee', program):
                    # The substitution result executes a command, not a read.
                    candidates = re.findall(r'(?:\.codex|tests)/[^\s/;]+(?:/[^\s/;]+)*', program.replace('\\/', '/'))
                    targets += candidates
    elif name in {'python', 'python3'} and '-c' in args:
        index = args.index('-c') + 1
        if index < len(args):
            targets = python_writes(args[index])
    elif name in {'node', 'nodejs'}:
        for i, arg in enumerate(args):
            if arg in {'-e', '--eval'} and i + 1 < len(args):
                targets += re.findall(r'(?:writeFile(?:Sync)?|appendFile(?:Sync)?|unlink(?:Sync)?|rm(?:Sync)?|mkdir(?:Sync)?)\s*\(\s*[\x27\"]([^\x27\"]+)', args[i + 1])
    elif name in {'awk', 'gawk'}:
        for program in operands(args):
            targets += re.findall(r'(?:print|printf)\b[^;\n]*?>+\s*[\x27\"]([^\x27\"]+)', program)
    if name in {'touch', 'rm', 'rmdir', 'mv', 'mkdir', 'truncate', 'chmod', 'chown', 'chgrp', 'ln', 'cp', 'install'}:
        for i, arg in enumerate(args):
            if arg in {'-t', '--target-directory'} and i + 1 < len(args):
                targets.append(args[i + 1])
            elif arg.startswith('--target-directory='):
                targets.append(arg.split('=', 1)[1])
    # Unregistered commands and opaque scripts pass by policy.
    if any(protected(target, cwd, ancestors=True) for target in targets):
        return '차단: 보호 경로의 파일 쓰기·삭제·이동·메타데이터 변경 명령입니다.'
    return ''


def tokenize(command):
    # Keep word/operator identity: quoted ">" and "|" are data, not shell ops.
    tokens, word, quote, active, i = [], [], None, False, 0
    def flush():
        nonlocal active
        if active:
            tokens.append(('word', ''.join(word)))
            word.clear()
            active = False
    while i < len(command):
        ch = command[i]
        if ch == '\\' and quote != "'":
            i += 1
            if i == len(command):
                raise ValueError('완성되지 않은 이스케이프')
            if command[i] != '\n':
                if quote == '"' and command[i] not in '\\"$`':
                    word.append('\\')
                word.append(command[i])
                active = True
        elif quote:
            if ch == quote:
                quote = None
            else:
                word.append(ch)
        elif ch in "\"'":
            quote, active = ch, True
        elif ch == '#' and not active:
            while i < len(command) and command[i] != '\n':
                i += 1
            continue
        elif ch in ' \t\r':
            flush()
        elif ch in ';&|<>()\n':
            flush()
            start = i
            if ch != '\n':
                while i + 1 < len(command) and command[i + 1] in ';&|<>()':
                    i += 1
            tokens.append(('op', command[start:i + 1]))
        else:
            word.append(ch)
            active = True
        i += 1
    if quote:
        raise ValueError('닫히지 않은 따옴표')
    flush()
    return tokens


def shell_reason(command, cwd, depth=0):
    if depth > 20:
        return '차단: 명령 치환 중첩을 분석할 수 없습니다.'
    cleaned, bodies = substitutions(command)
    for body in bodies:
        reason = shell_reason(body, cwd, depth + 1)
        if reason:
            return reason
    tokens = tokenize(cleaned)
    words, i = [], 0
    while i < len(tokens):
        kind, token = tokens[i]
        if kind == 'word':
            words.append(token)
        elif token in {'>', '>>', '>|', '>&', '&>'}:
            i += 1
            if i == len(tokens):
                return '차단: 리다이렉션 대상이 없습니다.'
            target_kind, target = tokens[i]
            if target_kind != 'word':
                return '차단: 리다이렉션 대상이 잘못되었습니다.'
            if not (token == '>&' and (target.isdigit() or target == '-')) and protected(target, cwd):
                return '차단: 보호 경로에 쓰는 리다이렉션입니다.'
        elif token in {'<', '<<', '<<<', '<&'}:
            i += 1  # Input only; not a file write.
        elif token and all(ch in ';&|()\n' for ch in token):
            reason = segment(words, cwd)
            if reason:
                return reason
            words = []
            if i == len(tokens) - 1 and token in {'|', '&&', '||'}:
                return '차단: 완성되지 않은 복합 명령입니다.'
        else:
            words.append(token)
        i += 1
    return segment(words, cwd)


def inspect(payload):
    tool = payload.get('tool_name')
    if not isinstance(tool, str):
        return '차단: tool_name 문자열이 필요합니다.'
    if not re.search(r'(^|[.:])(apply_patch|Bash|bash|shell|shell_command|exec_command|Edit|Write)$', tool):
        return ''
    source = payload.get('tool_input')
    data = source if isinstance(source, dict) else {}
    command = source if isinstance(source, str) else data.get('command', data.get('cmd', data.get('patch', data.get('content', data.get('new_string')))))
    if not isinstance(command, str):
        return '차단: 검사할 명령·패치 문자열이 없습니다.'
    if re.search(r'live_(g?sk|g?ck)_', command):
        return '차단: 실제 결제 키는 사용할 수 없습니다.'
    cwd = os.path.abspath(os.path.join(root, data.get('workdir', data.get('cwd', payload.get('cwd', root))) or root))
    if re.search(r'(apply_patch|Edit|Write)$', tool):
        paths = re.findall(r'^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)', command, re.MULTILINE)
        paths += [data.get('file_path', data.get('path', ''))]
        for path in filter(None, paths):
            full = os.path.abspath(os.path.join(cwd, path))
            if Path(full).name == 'TEST_WRITING':
                return '차단: TEST_WRITING은 사용자만 변경할 수 있습니다.'
            if not writing and 'tests' in Path(full).parts:
                return '차단: tests/ 변경은 사용자 테스트 작성 스위치가 필요합니다.'
        return ''
    return shell_reason(command, cwd)


try:
    print(inspect(json.load(sys.stdin)))
except (ValueError, TypeError, AttributeError, OSError) as error:
    print('차단: 입력·명령 구문을 분석할 수 없습니다: ' + str(error))
