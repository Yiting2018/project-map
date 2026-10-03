import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { createDashboardServer } from '../src/server.mjs';

const publicRoot = mkdtempSync(join(tmpdir(), 'dashboard-static-'));
const outsideRoot = mkdtempSync(join(tmpdir(), 'dashboard-outside-'));
const indexBody = '<!doctype html><title>Fixture dashboard</title>\n';
const scriptBody = 'globalThis.fixtureLoaded = true;\n';
const svgBody = '<svg xmlns="http://www.w3.org/2000/svg"><text>fixture</text></svg>\n';

mkdirSync(join(publicRoot, 'nested'));
writeFileSync(join(publicRoot, 'index.html'), indexBody);
mkdirSync(join(publicRoot, 'zh-CN', 'technical', 'sample'), {recursive:true});
writeFileSync(join(publicRoot, 'zh-CN', 'technical', 'sample', 'index.html'), indexBody);
writeFileSync(join(publicRoot, 'app.js'), scriptBody);
writeFileSync(join(publicRoot, 'diagram.svg'), svgBody);
writeFileSync(join(publicRoot, 'nested', 'data.json'), '{"fixture":true}\n');
writeFileSync(join(outsideRoot, 'private.txt'), 'outside fixture\n');
symlinkSync(join(outsideRoot, 'private.txt'), join(publicRoot, 'linked.txt'));

let server;
let port;

before(async () => {
  server = createDashboardServer(publicRoot);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  rmSync(publicRoot, { recursive: true, force: true });
  rmSync(outsideRoot, { recursive: true, force: true });
});

function request(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.once('error', reject);
    req.end();
  });
}

function assertLockedDownPolicy(response) {
  assert.match(response.headers['content-security-policy'] || '', /(?:^|;)\s*connect-src\s+'none'\s*(?:;|$)/i);
}

test('GET serves root index and nested static files with useful content types', async () => {
  const index = await request('/');
  const nested = await request('/nested/data.json?cache-bust=1');

  assert.equal(index.status, 200);
  assert.equal(index.body, indexBody);
  assert.match(index.headers['content-type'], /^text\/html\b/i);
  assertLockedDownPolicy(index);

  assert.equal(nested.status, 200);
  assert.equal(nested.body, '{"fixture":true}\n');
  assert.match(nested.headers['content-type'], /^application\/json\b/i);
  assertLockedDownPolicy(nested);
});

test('HEAD returns GET metadata without a response body', async () => {
  const response = await request('/app.js', { method: 'HEAD' });

  assert.equal(response.status, 200);
  assert.equal(response.body, '');
  assert.equal(Number(response.headers['content-length']), Buffer.byteLength(scriptBody));
  assert.match(response.headers['content-type'], /javascript/i);
  assertLockedDownPolicy(response);
});

test('SVG responses add a sandboxed policy while retaining the network lock', async () => {
  const response = await request('/diagram.svg');

  assert.equal(response.status, 200);
  assert.equal(response.body, svgBody);
  assert.match(response.headers['content-type'], /^image\/svg\+xml\b/i);
  assert.match(response.headers['content-security-policy'] || '', /(?:^|;)\s*sandbox\s*(?:;|$)/i);
  assertLockedDownPolicy(response);
});

test('all mutating and unsupported methods are rejected as read-only', async t => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    await t.test(method, async () => {
      const response = await request('/app.js', { method });
      assert.equal(response.status, 405);
      assert.match(response.headers.allow || '', /GET/i);
      assert.match(response.headers.allow || '', /HEAD/i);
      assertLockedDownPolicy(response);
    });
  }
});

test('missing resources return 404 without exposing the server directory', async () => {
  const response = await request('/missing.txt');

  assert.equal(response.status, 404);
  assert.equal(response.body.includes(publicRoot), false);
  assertLockedDownPolicy(response);
});

test('encoded parent traversal cannot escape the static directory', async () => {
  const response = await request('/%2e%2e%2fprivate.txt');

  assert.ok([400, 403, 404].includes(response.status));
  assert.equal(response.body.includes('outside fixture'), false);
  assertLockedDownPolicy(response);
});

test('a symlink beneath the static directory cannot expose an outside file', async () => {
  const response = await request('/linked.txt');

  assert.ok([403, 404].includes(response.status));
  assert.equal(response.body.includes('outside fixture'), false);
  assertLockedDownPolicy(response);
});


test('nested language editions preserve the technical viewer CSP', async () => {
  const response = await request('/zh-CN/technical/sample/');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-security-policy'], /script-src 'self' 'unsafe-inline'/);
  assertLockedDownPolicy(response);
});
