// Runs every test-*.js suite one after another (they all use port 3050, so
// never in parallel), prints one pass/fail line per suite and exits non-zero
// if any failed. `npm test` from backend/.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const suites = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f) && f !== 'test-helpers.js').sort();
const results = [];
for (const suite of suites) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [suite], { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const output = `${run.stdout}${run.stderr}`;
  const counts = output.match(/(\d+) passed, (\d+) failed/);
  const ok = run.status === 0 && counts && counts[2] === '0';
  results.push({ suite, ok });
  const summary = counts ? `${counts[1]} passed, ${counts[2]} failed` : 'no summary (crashed?)';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${suite.padEnd(34)} ${summary}  (${Math.round((Date.now() - started) / 1000)}s)`);
  if (!ok) {
    const failing = output.split('\n').filter((line) => line.startsWith('FAIL') || /Error|crash/i.test(line)).slice(0, 15);
    failing.forEach((line) => console.log(`        ${line}`));
  }
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} suites passed`);
process.exitCode = failed === 0 ? 0 : 1;
