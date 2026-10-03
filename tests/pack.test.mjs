import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCache = mkdtempSync(join(tmpdir(), 'map-pack-cache-'));

after(() => rmSync(npmCache, { recursive: true, force: true }));

test('npm package contains both language editions and excludes generated or installed files', { timeout: 120_000 }, () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: packageRoot,
    env: { ...process.env, npm_config_cache: npmCache },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);

  const report = JSON.parse(result.stdout);
  assert.equal(report.length, 1);
  const paths = report[0].files.map(file => file.path);
  const modelPaths = paths.filter(path => /^examples\/[^/]+\/architecture\/model\.c4$/.test(path));
  const statePaths = paths.filter(path => /^examples\/[^/]+\/states\/[^/]+\.mmd$/.test(path));
  const evidencePaths = paths.filter(path => /^examples\/[^/]+\/evidence\/fictional-record\.md$/.test(path));

  assert.equal(modelPaths.length, 4, `packed models: ${modelPaths.join(', ')}`);
  assert.equal(statePaths.length, 2, `packed states: ${statePaths.join(', ')}`);
  assert.equal(evidencePaths.length, 4, `packed evidence: ${evidencePaths.join(', ')}`);
  for (const required of ['examples/project-map.zh-CN.json', 'README.zh-CN.md', 'src/ui/i18n.js']) assert.ok(paths.includes(required), required);
  assert.equal(paths.some(path => path === 'dist' || path.startsWith('dist/') || path.includes('/dist/')), false);
  assert.equal(paths.some(path => path === 'node_modules' || path.startsWith('node_modules/') || path.includes('/node_modules/')), false);
});
