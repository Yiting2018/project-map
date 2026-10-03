import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = join(packageRoot, 'bin', 'project-map.mjs');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'map-cli-fixture-'));
const invocationDirectory = join(fixtureRoot, 'invocation');
const emptyPath = join(fixtureRoot, 'empty-path');

mkdirSync(invocationDirectory);
mkdirSync(emptyPath);

after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function runCli(args, { cwd = invocationDirectory, withoutGit = false } = {}) {
  const env = { ...process.env };
  if (withoutGit) env.PATH = emptyPath;
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

function outputOf(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function initialize(name) {
  const workspace = join(fixtureRoot, name);
  const result = runCli(['init', '--dir', workspace], { withoutGit: true });
  assert.equal(result.status, 0, outputOf(result));
  return workspace;
}

test('init works outside the package, creates the complete stateless sample, and refuses a repeat', () => {
  const workspace = initialize('fresh-workspace');

  assert.match(readFileSync(join(workspace, 'architecture', 'model.c4'), 'utf8'), /\bmodel\s*\{/);
  assert.match(readFileSync(join(workspace, 'evidence', 'fictional-record.md'), 'utf8'), /fictional/i);

  const repeat = runCli(['init', '--dir', workspace], { withoutGit: true });
  assert.notEqual(repeat.status, 0);
  assert.match(outputOf(repeat), /non-empty|empty directory|refus/i);

  const validate = runCli(['validate', '--root', workspace], { withoutGit: true });
  assert.equal(validate.status, 0, outputOf(validate));
  assert.match(validate.stdout, /Validated\s+1\s+project/i);
});

test('validate rejects a model directory containing a symlink before model parsing', () => {
  const workspace = initialize('linked-model-workspace');
  const outsideFile = join(fixtureRoot, 'outside-model-fragment.c4');
  writeFileSync(outsideFile, 'this is deliberately not a model\n');
  symlinkSync(outsideFile, join(workspace, 'architecture', 'linked-fragment.c4'));

  const result = runCli(['validate', '--root', workspace], { withoutGit: true });

  assert.notEqual(result.status, 0);
  assert.match(outputOf(result), /model director|symlink|symbolic link/i);
  assert.doesNotMatch(outputOf(result), /LikeC4 failed/i);
});

test('build cannot replace an evidence input even when the directory has a valid output marker', () => {
  const workspace = initialize('protected-evidence-workspace');
  const evidenceDirectory = join(workspace, 'evidence');
  const evidenceFile = join(evidenceDirectory, 'fictional-record.md');
  const originalEvidence = readFileSync(evidenceFile, 'utf8');
  writeFileSync(
    join(evidenceDirectory, '.project-map-output.json'),
    `${JSON.stringify({ tool: 'project-map-kit', schemaVersion: 1 })}\n`,
  );

  const result = runCli(['build', '--root', workspace, '--out', 'evidence'], { withoutGit: true });

  assert.notEqual(result.status, 0);
  assert.match(outputOf(result), /output.*input|input.*output|cannot contain/i);
  assert.equal(readFileSync(evidenceFile, 'utf8'), originalEvidence);
});
