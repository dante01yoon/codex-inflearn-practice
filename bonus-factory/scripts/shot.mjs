// 증거 화면 찍기: 지정한 폴더에서 시연 서버를 띄우고, 정해진 동작을 한 뒤 화면을 저장한다.
// 사용: node scripts/shot.mjs <프로젝트 폴더> <출력.png> '<동작 JSON>'
// 동작 예: [{"search":"sk"}] · [{"click":"[data-station]"}] · [{"select":["#connector","DC콤보"]}]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const [dir, out, stepsJson = '[]'] = process.argv.slice(2);
if (!dir || !out) {
  console.error("사용: node scripts/shot.mjs <프로젝트 폴더> <출력.png> '<동작 JSON>'");
  process.exit(1);
}
const steps = JSON.parse(stepsJson);
const port = 4300 + Math.floor(Math.random() * 600);
const server = spawn('node', ['--env-file=.env', 'src/preview/server.ts'], {
  cwd: dir,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i > 50) throw new Error('시연 서버가 뜨지 않았습니다.');
    await sleep(200);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(url);
  await page.waitForSelector('.station-row');
  let focus = '.workspace';
  for (const step of steps) {
    if (step.search !== undefined) {
      await page.fill('#search', step.search);
      await sleep(800);
      focus = '.explore';
    }
    if (step.click) await page.click(step.click);
    if (step.select) await page.selectOption(step.select[0], { label: step.select[1] });
    if (step.focus) focus = step.focus;
    await sleep(500);
  }
  await page.locator(focus).first().screenshot({ path: out });
  await browser.close();
  console.log(`저장: ${out}`);
} finally {
  server.kill();
}
