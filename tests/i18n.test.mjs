import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const i18nSource = await readFile(new URL('../src/ui/i18n.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/ui/app.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(i18nSource, context);

const { messages, normalizeLocale, translate } = context.ProjectMapI18n;

test('every UI translation used by app.js exists in both supported locales', () => {
  const usedKeys = [...appSource.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1]);
  usedKeys.push('navMap', 'navFlows', 'navStatus');
  assert.ok(usedKeys.length > 50, 'expected broad UI translation coverage');
  for (const key of new Set(usedKeys)) {
    assert.equal(typeof messages['zh-CN'][key], 'string', `missing zh-CN translation: ${key}`);
    assert.equal(typeof messages.en[key], 'string', `missing en translation: ${key}`);
  }
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages['zh-CN']).sort());
});

test('locale selection is backward compatible and English copy is fully English', () => {
  assert.equal(normalizeLocale(undefined), 'zh-CN');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(Object.values(messages.en).some((value) => /[\u3400-\u9fff]/u.test(value)), false);
});

test('translation interpolates accessible labels without leaking placeholders', () => {
  assert.equal(translate('en', 'viewModuleDetails', { title: 'Reader' }), 'View details for Reader');
  assert.equal(translate('zh-CN', 'viewModuleDetails', { title: '阅读器' }), '查看 阅读器 详情');
  assert.equal(translate('en', 'snapshotRevision', { revision: 'abc123' }), 'Snapshot revision abc123');
});

test('HTML exposes the build-time locale contract and loads translations before the app', () => {
  for (const placeholder of ['__PAGE_LANG__', '__PAGE_TITLE__', '__SKIP_LINK__', '__BOOT_TEXT__', '__NOSCRIPT_TEXT__']) {
    assert.equal(htmlSource.split(placeholder).length - 1, 1, `expected one ${placeholder} placeholder`);
  }
  assert.ok(htmlSource.indexOf('./i18n.js') < htmlSource.indexOf('./app.js'));
});
