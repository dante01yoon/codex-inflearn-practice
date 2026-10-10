import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { reduceUserCancellation } from '../src/rules/refund.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(new URL('./index.html', import.meta.url));
const startMs = Date.parse('2026-10-06T14:00:00+09:00');
const cases = [
  ['120분 1초 전', '11:59:59', 'AC-07-1'],
  ['정확히 120분 전', '12:00:00', 'AC-07-1'],
  ['119분 59초 전', '12:00:01', 'AC-07-2'],
  ['30분 1초 전', '13:29:59', 'AC-07-2'],
  ['정확히 30분 전', '13:30:00', 'AC-07-2'],
  ['29분 59초 전', '13:30:01', 'AC-07-3'],
  ['시작 시각', '14:00:00', 'AC-07-3'],
  ['시작 5분 후', '14:05:00', 'AC-07-3'],
];
const refunds = cases.map(([label, time, ac]) => {
  const result = reduceUserCancellation({
    reservationId: 'demo', originalStartMs: startMs,
    confirmedAtMs: startMs - 86400000, depositAmount: 3000,
    status: 'confirmed', cancellationReason: null,
    refundAmount: 0, refundedAmount: 0,
  }, { type: 'cancel', atMs: Date.parse(`2026-10-06T${time}+09:00`) });
  return { label, time, ac, amount: result.state.refundAmount };
});

let testResult = { status: 'NOT_RUN', running: true };
async function runExistingTests() {
  const startedAt = new Date().toISOString();
  const reportPath = join(await mkdtemp(join(tmpdir(), 'ev-harness-demo-')), 'result.json');
  let exitCode = 0;
  try {
    await execute(process.execPath, [
      'node_modules/vitest/vitest.mjs', 'run', '--reporter=json', `--outputFile=${reportPath}`,
    ], { cwd: root, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    exitCode = error.code;
  }
  try {
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    testResult = {
      status: exitCode === 0 && report.success ? 'PASS' : 'FAIL',
      running: false, startedAt, completedAt: new Date().toISOString(),
      passed: report.numPassedTests, failed: report.numFailedTests,
      pending: report.numPendingTests, total: report.numTotalTests,
      files: report.testResults.map(file => ({
        name: file.name.slice(root.length), status: file.status,
        passed: file.assertionResults.filter(test => test.status === 'passed').length,
        total: file.assertionResults.length,
      })),
    };
  } catch {
    testResult = { status: 'BLOCKED', running: false, startedAt,
      message: '기존 테스트의 JSON 결과를 읽을 수 없습니다. 실행 환경을 확인하세요.' };
  }
  console.log(`기존 규칙 테스트: ${testResult.status}, ${testResult.passed ?? 0}/${testResult.total ?? 0}`);
}

async function testChanges() {
  try {
    const [{ stdout: head }, { stdout: status }] = await Promise.all([
      execute('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }),
      execute('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'tests'], { cwd: root }),
    ]);
    const entries = status.split('\0').filter(Boolean);
    const changes = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const code = entry.slice(0, 2);
      changes.push({ code, path: entry.slice(3) });
      if (code.includes('R') || code.includes('C')) i++;
    }
    return { status: changes.length ? 'CHANGED' : 'UNCHANGED', head: head.trim(), changes };
  } catch {
    return { status: 'BLOCKED', message: 'Git 비교에 실패했습니다. 변경 없음으로 판단하지 않습니다.' };
  }
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.writeHead(405).end();
    return;
  }
  if (request.url === '/api/status') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ refunds, tests: testResult, git: await testChanges(), checkedAt: new Date().toISOString() }));
  } else if (request.url === '/' || request.url === '/index.html') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
  } else response.writeHead(404).end();
});
server.on('error', error => {
  console.error(`4174 포트 서버 시작 실패: ${error.code}`);
  process.exit(1);
});
server.listen(4174, '127.0.0.1', () => {
  console.log('하네스 시연 화면: http://127.0.0.1:4174');
  void runExistingTests();
});
