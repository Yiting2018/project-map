import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { normalizeProject, sourcePath } from '../src/model.mjs';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'map-model-fixture-'));
const outsideRoot = mkdtempSync(join(tmpdir(), 'map-model-outside-'));
const evidencePath = 'evidence/check.md';
const rootEvidencePath = 'root-check.md';
const stateAssetPath = 'assets/cycle.svg';
const stateSourcePath = 'states/cycle.mmd';

for (const [path, contents] of [
  [evidencePath, '# Synthetic check\n'],
  [rootEvidencePath, '# Root-level synthetic check\n'],
  [stateAssetPath, '<svg xmlns="http://www.w3.org/2000/svg"/>\n'],
  [stateSourcePath, 'stateDiagram-v2\n  [*] --> Ready\n'],
]) {
  const absolute = join(fixtureRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const outsideFile = join(outsideRoot, 'outside.txt');
writeFileSync(outsideFile, 'outside fixture\n');
symlinkSync(outsideFile, join(fixtureRoot, 'linked-outside.txt'));

after(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(outsideRoot, { recursive: true, force: true });
});

const context = {
  root: fixtureRoot,
  builtAt: '2030-01-02T03:04:05.000Z',
  revision: 'fixture-revision',
  modelHash: 'fixture-model-hash',
};

function projectConfig(overrides = {}) {
  return {
    id: 'atlas',
    name: 'Atlas',
    domainKind: 'realm',
    domainPresentation: {
      north: { label: 'North realm', color: '#123456', icon: 'cube', order: 1 },
      south: { label: 'South realm', color: '#654321', icon: 'files', order: 0 },
    },
    layers: [
      { id: 'surface', label: 'Surface', description: 'Entry points', kinds: ['screen'] },
      { id: 'logic', label: 'Logic', description: 'Transformations', kinds: ['operation'] },
      { id: 'storage', label: 'Storage', description: 'Durable records', kinds: ['storage'] },
    ],
    statuses: [
      { id: 'queued', label: 'Queued', color: '#777777' },
      { id: 'verified', label: 'Verified', color: '#227744' },
    ],
    defaultModuleScope: 'Synthetic fixture',
    overviewModuleIds: ['north.portal', 'north.portal.worker', 'south.vault'],
    flows: [
      {
        viewId: 'repeated_calls',
        title: 'Repeated calls',
        scope: 'Observed calls',
        conclusion: 'Only direct evidence can verify this sequence.',
      },
      {
        viewId: 'dependency_map',
        title: 'Dependencies',
        scope: 'Static relationships',
        conclusion: 'Relationships do not establish execution order.',
      },
    ],
    defaultFlowId: 'repeated_calls',
    states: [],
    ...overrides,
  };
}

function modelFixture() {
  return {
    elements: {
      north: { id: 'north', kind: 'realm', title: 'North' },
      'north.portal': { id: 'north.portal', kind: 'screen', title: 'Portal' },
      'north.portal.worker': { id: 'north.portal.worker', kind: 'operation', title: 'Worker' },
      south: { id: 'south', kind: 'realm', title: 'South' },
      'south.vault': { id: 'south.vault', kind: 'storage', title: 'Vault' },
    },
    relations: {
      persists: {
        id: 'persists',
        source: 'north.portal.worker',
        target: 'south.vault',
        label: 'persists',
      },
    },
    views: {
      repeated_calls: {
        id: 'repeated_calls',
        _type: 'dynamic',
        title: 'Repeated calls',
        nodes: [
          { modelRef: 'north.portal' },
          { modelRef: 'north.portal.worker' },
          { modelRef: 'south.vault' },
        ],
        edges: [
          { id: 'open', source: 'north.portal', target: 'north.portal.worker', label: 'open' },
          { id: 'save', source: 'north.portal.worker', target: 'south.vault', label: 'save' },
        ],
        flow: ['open', 'save', 'open'],
      },
      dependency_map: {
        id: 'dependency_map',
        _type: 'element',
        title: 'Dependency map',
        nodes: [
          { modelRef: 'north.portal' },
          { modelRef: 'north.portal.worker' },
          { modelRef: 'south.vault' },
        ],
        edges: [
          { id: 'stored-first', source: 'north.portal.worker', target: 'south.vault', label: 'stores' },
          { id: 'opened-second', source: 'north.portal', target: 'north.portal.worker', label: 'opens' },
        ],
      },
    },
  };
}

function status(moduleId, phase, summary = `${moduleId} is ${phase}`) {
  return {
    moduleId,
    phase,
    summary,
    blockers: [],
    work: [],
    acceptance: [],
    evidence: [{
      title: 'Recorded check',
      path: evidencePath,
      recordedAt: '2030-01-01',
      scope: 'Synthetic fixture only',
    }],
  };
}

function normalize({ config = projectConfig(), model = modelFixture(), statuses = [] } = {}) {
  return normalizeProject(config, model, { modules: statuses }, context);
}

test('normalizes domains, layers, hierarchy, statuses, and repeated dynamic calls', () => {
  const result = normalize({ statuses: [status('north.portal', 'queued')] });
  const worker = result.modules.find(module => module.id === 'north.portal.worker');
  const portal = result.modules.find(module => module.id === 'north.portal');
  const sequence = result.flows.find(flow => flow.id === 'repeated_calls');
  const relationships = result.flows.find(flow => flow.id === 'dependency_map');

  assert.deepEqual(result.domains.map(domain => domain.id), ['south', 'north']);
  assert.deepEqual(result.layers.map(layer => layer.id), ['surface', 'logic', 'storage']);
  assert.deepEqual(
    { parentId: worker.parentId, domainId: worker.domainId, layerId: worker.layerId, status: worker.status },
    { parentId: 'north.portal', domainId: 'north', layerId: 'logic', status: null },
  );
  assert.equal(portal.status.phase, 'queued');
  assert.equal(sequence.kind, 'sequence');
  assert.deepEqual(sequence.edges.map(edge => edge.id), ['open', 'save', 'open']);
  assert.equal(relationships.kind, 'relationships');
  assert.deepEqual(relationships.edges.map(edge => edge.id), ['stored-first', 'opened-second']);
});

test('keeps normalization calls isolated when module IDs are identical', () => {
  const first = normalize({
    config: projectConfig({ id: 'first-map', name: 'First map' }),
    statuses: [status('north.portal', 'queued', 'First record')],
  });
  const second = normalize({
    config: projectConfig({ id: 'second-map', name: 'Second map' }),
    statuses: [status('north.portal', 'verified', 'Second record')],
  });

  assert.deepEqual(
    [first.id, first.modules.find(module => module.id === 'north.portal').status.summary],
    ['first-map', 'First record'],
  );
  assert.deepEqual(
    [second.id, second.modules.find(module => module.id === 'north.portal').status.summary],
    ['second-map', 'Second record'],
  );
  assert.deepEqual(
    first.flows.map(flow => ({ id: flow.id, kind: flow.kind, moduleIds: flow.moduleIds, edges: flow.edges })),
    second.flows.map(flow => ({ id: flow.id, kind: flow.kind, moduleIds: flow.moduleIds, edges: flow.edges })),
  );
});

test('rejects status records that cannot attach to one known module and phase', async t => {
  await t.test('unknown module', () => {
    assert.throws(() => normalize({ statuses: [status('north.missing', 'queued')] }), /Unknown module/i);
  });
  await t.test('unknown phase', () => {
    assert.throws(() => normalize({ statuses: [status('north.portal', 'unlisted')] }), /Unknown status/i);
  });
  await t.test('duplicate module record', () => {
    assert.throws(
      () => normalize({ statuses: [status('north.portal', 'queued'), status('north.portal', 'verified')] }),
      /duplicate moduleId/i,
    );
  });
});

test('sourcePath accepts an existing relative file beneath the declared root', () => {
  assert.equal(sourcePath(fixtureRoot, evidencePath), join(fixtureRoot, evidencePath));
  assert.equal(sourcePath(fixtureRoot, `${evidencePath}#recorded-line`), join(fixtureRoot, evidencePath));
  assert.equal(sourcePath(fixtureRoot, `${evidencePath}:fixtureSymbol`), join(fixtureRoot, evidencePath));
  assert.equal(sourcePath(fixtureRoot, `${rootEvidencePath}:fixtureSymbol`), join(fixtureRoot, rootEvidencePath));
});

test('sourcePath rejects absolute paths, traversal, and symlink escape', async t => {
  await t.test('absolute path, including one beneath the root', () => {
    assert.throws(() => sourcePath(fixtureRoot, join(fixtureRoot, evidencePath)), /relative|source|reference|path/i);
  });
  await t.test('parent traversal to an existing file', () => {
    const relativeEscape = join('..', outsideRoot.slice(outsideRoot.lastIndexOf('/') + 1), 'outside.txt');
    assert.throws(() => sourcePath(fixtureRoot, relativeEscape), /outside|source|reference|path/i);
  });
  await t.test('parent segment even when it resolves beneath the root', () => {
    assert.throws(() => sourcePath(fixtureRoot, 'evidence/../evidence/check.md'), /outside|source|reference|path|\.\./i);
  });
  await t.test('symlink escape', () => {
    assert.throws(() => sourcePath(fixtureRoot, 'linked-outside.txt'), /outside|source|reference|path/i);
  });
});

test('rejects structure that changes identity, nesting, parentage, or layers', async t => {
  await t.test('domain presentation cannot override a domain ID', () => {
    const config = projectConfig({
      domainPresentation: {
        ...projectConfig().domainPresentation,
        north: { id: 'south', label: 'Alias', color: '#123456', icon: 'cube', order: 1 },
      },
    });
    assert.throws(() => normalize({ config }), /domain.*id|override.*id|identity/i);
  });

  await t.test('domains cannot be nested inside domains', () => {
    const model = modelFixture();
    model.elements['north.inner'] = { id: 'north.inner', kind: 'realm', title: 'Inner realm' };
    assert.throws(() => normalize({ model }), /nested domain|domain.*nested|domain.*parent/i);
  });

  await t.test('module requires an existing parent', () => {
    const model = modelFixture();
    delete model.elements['north.portal'];
    const config = projectConfig({
      overviewModuleIds: ['north.portal.worker', 'south.vault'],
      flows: [],
      defaultFlowId: undefined,
    });
    assert.throws(() => normalize({ config, model }), /Missing parent|Unknown parent/i);
  });

  await t.test('presentation layer must exist', () => {
    const config = projectConfig({ modulePresentation: { 'north.portal': { layerId: 'hidden' } } });
    assert.throws(() => normalize({ config }), /Unknown layer/i);
  });
});

test('a relationship view cannot expose a domain endpoint as a module flow', () => {
  const model = modelFixture();
  model.views.dependency_map.nodes.push({ modelRef: 'north' });
  model.views.dependency_map.edges[0] = {
    id: 'domain-edge',
    source: 'north',
    target: 'south.vault',
    label: 'contains',
  };

  assert.throws(() => normalize({ model }), /module endpoints|domain.*flow|flow.*domain/i);
});

test('flow and state definitions have unique IDs', async t => {
  await t.test('duplicate flow view', () => {
    const repeated = projectConfig().flows[0];
    const config = projectConfig({ flows: [repeated, { ...repeated, title: 'Duplicate' }] });
    assert.throws(() => normalize({ config }), /flows.*duplicate|duplicate.*flow/i);
  });

  await t.test('duplicate state', () => {
    const state = { id: 'cycle', title: 'Cycle', assetPath: stateAssetPath, moduleIds: ['south.vault'] };
    const config = projectConfig({ states: [state, { ...state, title: 'Duplicate' }] });
    assert.throws(() => normalize({ config }), /states.*duplicate|duplicate.*state/i);
  });
});

test('state diagrams accept exactly one checked source form and attach to known modules', async t => {
  await t.test('prebuilt SVG asset', () => {
    const config = projectConfig({
      states: [{ id: 'asset-cycle', title: 'Asset cycle', assetPath: stateAssetPath, moduleIds: ['south.vault'] }],
    });
    const result = normalize({ config });
    assert.equal(result.states[0].url, './states/atlas-asset-cycle.svg');
    assert.deepEqual(result.modules.find(module => module.id === 'south.vault').stateIds, ['asset-cycle']);
  });

  await t.test('Mermaid source', () => {
    const config = projectConfig({
      states: [{ id: 'source-cycle', title: 'Source cycle', sourcePath: stateSourcePath, moduleIds: ['north.portal'] }],
    });
    const result = normalize({ config });
    assert.equal(result.states[0].url, './states/atlas-source-cycle.svg');
    assert.deepEqual(result.modules.find(module => module.id === 'north.portal').stateIds, ['source-cycle']);
  });

  await t.test('both source forms', () => {
    const config = projectConfig({
      states: [{
        id: 'ambiguous',
        title: 'Ambiguous',
        sourcePath: stateSourcePath,
        assetPath: stateAssetPath,
        moduleIds: ['north.portal'],
      }],
    });
    assert.throws(() => normalize({ config }), /exactly one|mutually exclusive|sourcePath.*assetPath/i);
  });

  await t.test('no source form', () => {
    const config = projectConfig({
      states: [{ id: 'missing', title: 'Missing', moduleIds: ['north.portal'] }],
    });
    assert.throws(() => normalize({ config }), /exactly one|required|sourcePath.*assetPath/i);
  });

  await t.test('wrong extension for each source form', () => {
    const sourceConfig = projectConfig({
      states: [{ id: 'wrong-source', title: 'Wrong source', sourcePath: stateAssetPath, moduleIds: ['north.portal'] }],
    });
    const assetConfig = projectConfig({
      states: [{ id: 'wrong-asset', title: 'Wrong asset', assetPath: stateSourcePath, moduleIds: ['north.portal'] }],
    });
    assert.throws(() => normalize({ config: sourceConfig }), /\.mmd|Mermaid|state source/i);
    assert.throws(() => normalize({ config: assetConfig }), /\.svg|state asset/i);
  });

  await t.test('unknown module', () => {
    const config = projectConfig({
      states: [{ id: 'orphan', title: 'Orphan', assetPath: stateAssetPath, moduleIds: ['south.missing'] }],
    });
    assert.throws(() => normalize({ config }), /Unknown module/i);
  });
});


test('project locale validates and controls generated fallback text', () => {
  assert.equal(normalize().locale, 'zh-CN');
  const config = projectConfig({locale: 'en'});
  config.flows[0].conclusion = '';
  const project = normalize({config});
  assert.equal(project.locale, 'en');
  assert.equal(project.snapshot.label, 'Local model snapshot');
  assert.equal(project.flows[0].conclusion, 'No flow acceptance recorded');
  assert.throws(() => normalize({config: projectConfig({locale: 'unknown'})}), /Unsupported locale/);
});
