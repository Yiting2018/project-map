import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const fail = message => { throw new Error(message); };
const text = value => typeof value === 'string' ? value : value?.txt || '';
export function unique(items, name, key = 'id') {
  const ids = new Set();
  for (const item of items) {
    if (!item[key] || ids.has(item[key])) fail(`${name}: missing or duplicate ${key}: ${item[key]}`);
    ids.add(item[key]);
  }
  return ids;
}
export function sourcePath(root, value) {
  if (typeof value !== 'string' || !value.trim()) fail('Evidence requires a path');
  if (/^(?:[\\/]|[a-zA-Z]:|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/.test(value) || value.includes('\\') || value.split('/').includes('..')) fail('Path must be relative and stay inside the project root');
  const path = resolve(root, value.split(/[#：:]/)[0]);
  if (!path.startsWith(resolve(root) + sep) || !existsSync(path)) fail(`Broken source reference: ${value}`);
  if (!realpathSync(path).startsWith(realpathSync(root) + sep)) fail(`Source outside repository: ${value}`);
  return path;
}
export function normalizeProject(config, model, statusFile, {root, builtAt, revision, modelHash}) {
  if (!/^[a-z][a-z0-9-]*$/.test(config.id)) fail('Invalid project ID');
  const all = Object.values(model.elements);
  const ids = unique(all, 'model elements');
  for (const [key, element] of Object.entries(model.elements)) if (key !== element.id) fail(`Element key mismatch: ${key}`);
  const domainElements = all.filter(e => e.kind === config.domainKind);
  if (domainElements.some(e => domainElements.some(d => e.id !== d.id && e.id.startsWith(d.id + '.')))) fail('Nested domains are not supported; use nested modules within a domain');
  const domainIds = new Set(domainElements.map(e => e.id));
  const rawModules = all.filter(e => !domainIds.has(e.id));
  const moduleIds = new Set(rawModules.map(e => e.id));
  const mustModule = id => { if (!moduleIds.has(id)) fail(`Unknown module: ${id}`); };
  const statuses = config.statuses || [];
  const phaseIds = unique(statuses, 'status dictionary');
  const layers = config.layers || [];
  const layerIds = unique(layers, 'layers');
  const presentation = config.modulePresentation || {};
  Object.keys(presentation).forEach(mustModule);
  for (const [id, presentation] of Object.entries(config.domainPresentation || {})) {
    if (!domainIds.has(id)) fail(`Unknown domain: ${id}`);
    if (Object.hasOwn(presentation,'id')) fail('Domain presentation cannot override id');
  }
  for (const entry of [...statuses, ...Object.values(config.domainPresentation || {})]) {
    if (entry.color && !/^#[a-f0-9]{6}$/i.test(entry.color)) fail(`Invalid color: ${entry.color}`);
    if (entry.icon && !/^[a-z-]+$/.test(entry.icon)) fail(`Invalid icon: ${entry.icon}`);
  }
  const records = statusFile.modules || [];
  unique(records, 'module status', 'moduleId');
  for (const record of records) {
    mustModule(record.moduleId);
    if (!phaseIds.has(record.phase)) fail(`Unknown status: ${record.phase}`);
    for (const field of ['blockers', 'work', 'acceptance', 'evidence']) if (!Array.isArray(record[field])) fail(`Status ${record.moduleId} requires ${field} array`);
    for (const item of record.acceptance) if (!['passed', 'failed', 'not_run'].includes(item.result)) fail(`Invalid acceptance result: ${item.result}`);
    for (const evidence of record.evidence) {
      sourcePath(root, evidence.path);
      if (!evidence.title || !evidence.recordedAt || !evidence.scope) fail(`Incomplete evidence: ${record.moduleId}`);
    }
  }
  const scopes = new Map();
  for (const group of config.scopeGroups || []) for (const id of group.moduleIds) {
    mustModule(id);
    if (scopes.has(id)) fail(`Duplicate scope: ${id}`);
    scopes.set(id, group.label);
  }
  const overview = config.overviewModuleIds ?? rawModules.map(m => m.id);
  unique(overview.map(id => ({id})), 'overview');
  overview.forEach(mustModule);
  const domainOf = id => domainElements.filter(d => id.startsWith(d.id + '.')).sort((a,b) => b.id.length - a.id.length)[0]?.id;
  const palette = ['#2875e8', '#189875', '#8c61cb', '#b88416', '#bc5a70', '#3f819d'];
  const domains = domainElements.map((e, index) => ({id: e.id, label: e.title,
    description: text(e.description), color: palette[index % palette.length], icon: 'cube', order: index,
    ...config.domainPresentation?.[e.id]})).sort((a,b) => a.order-b.order);
  const modules = rawModules.map(e => {
    const display = presentation[e.id] || {};
    const layerMatches = layers.filter(l => l.kinds?.includes(e.kind));
    if (!display.layerId && layerMatches.length !== 1) fail(`Ambiguous/missing layer for ${e.id}`);
    const layerId = display.layerId || layerMatches[0].id;
    if (!layerIds.has(layerId)) fail(`Unknown layer for ${e.id}`);
    const domainId = domainOf(e.id);
    if (!domainId) fail(`Missing domain for ${e.id}`);
    const parentId = e.id.includes('.') ? e.id.slice(0, e.id.lastIndexOf('.')) : null;
    if (parentId && !ids.has(parentId)) fail(`Missing parent: ${parentId}`);
    const originalText = [e.title, text(e.summary), text(e.description)].join(' ');
    const gapLabels = (config.gapMarkers || []).filter(marker => originalText.includes(marker));
    const sources = (e.metadata?.source || '').split(';').map(s => s.trim()).filter(Boolean).map(path => {
      sourcePath(root, path); return {title: path, path};
    });
    return {id: e.id, parentId, domainId, layerId, title: display.title || e.title,
      summary: display.summary || text(e.summary), description: text(e.description),
      scope: scopes.get(e.id) || config.defaultModuleScope || '',
      isGap: (config.gapKinds || []).includes(e.kind) || gapLabels.length > 0, gapLabels, sources,
      status: records.find(s => s.moduleId === e.id) || null, flowIds: [], stateIds: []};
  });
  const relation = r => {
    const source = typeof r.source === 'string' ? r.source : r.source.model;
    const target = typeof r.target === 'string' ? r.target : r.target.model;
    if (!ids.has(source) || !ids.has(target)) fail(`Unknown relation endpoints: ${source} / ${target}`);
    return {id:r.id, source, target, label:r.label || text(r.title), isGap: (config.gapRelationKinds || []).includes(r.kind)};
  };
  const relations = Object.values(model.relations || {}).map(relation);
  const flows = (config.flows || []).map(entry => {
    const view = model.views[entry.viewId];
    if (!view) fail(`Unknown view: ${entry.viewId}`);
    const viewIds = new Set(view.nodes.map(n => n.modelRef));
    for (const id of viewIds) if (!ids.has(id)) fail(`Unknown view modelRef: ${id}`);
    const edges = view.edges.map(relation);
    edges.forEach(e => {
      // A view may aggregate domain endpoints. Keep explicit source/target, not invented child edges.
      if (!moduleIds.has(e.source) || !moduleIds.has(e.target)) fail(`Flow must expose module endpoints: ${entry.viewId}`);
    });
    let ordered = edges;
    if (view._type === 'dynamic') {
      if (!Array.isArray(view.flow) || !view.flow.every(id => typeof id === 'string')) fail(`Unsupported dynamic control blocks: ${view.id}`);
      const byId = new Map(edges.map(e => [e.id,e]));
      ordered = view.flow.map(id => byId.get(id) || fail(`Missing flow edge: ${id}`));
    }
    const referenced = [...viewIds].filter(id => moduleIds.has(id));
    for (const module of modules) if (referenced.includes(module.id)) module.flowIds.push(entry.viewId);
    return {id:entry.viewId, title:entry.title || view.title, description:text(view.description),
      kind:view._type === 'dynamic' ? 'sequence' : 'relationships', moduleIds:referenced, edges:ordered,
      scope:entry.scope || '', conclusion:entry.conclusion || '尚无链路验收记录',
      techUrl:`./technical/${config.id}/#/view/${encodeURIComponent(entry.viewId)}/`};
  });
  unique(flows, 'flows');
  if (config.defaultFlowId && !flows.some(f => f.id === config.defaultFlowId)) fail('Unknown default Flow');
  const states = (config.states || []).map(entry => {
    if (!/^[a-zA-Z0-9_-]+$/.test(entry.id)) fail(`Invalid state ID: ${entry.id}`);
    if (Boolean(entry.assetPath) === Boolean(entry.sourcePath)) fail('State must have exactly one sourcePath or assetPath');
    sourcePath(root, entry.assetPath || entry.sourcePath);
    if (entry.assetPath && !/\.svg$/.test(entry.assetPath)) fail('State asset must be a local SVG');
    if (entry.sourcePath && !/\.mmd$/.test(entry.sourcePath)) fail('State source must be a local .mmd file');
    entry.moduleIds.forEach(mustModule);
    for (const module of modules) if (entry.moduleIds.includes(module.id)) module.stateIds.push(entry.id);
    return {id:entry.id, title:entry.title, description:entry.description || '', moduleIds:entry.moduleIds,
      url:`./states/${config.id}-${entry.id}.svg`};
  });
  unique(states, 'states');
  if (config.recentWork?.source) sourcePath(root, config.recentWork.source.path);
  return {id:config.id, name:config.name, subtitle:config.subtitle || '', scope:config.scope || '', notice:config.notice || '',
    snapshot:{label:'本地模型快照',observedAt:config.observedAt,builtAt,revision,modelHash},
    domains,layers:layers.map(({id,label,description}) => ({id,label,description})), statuses,
    overviewModuleIds:overview, defaultFlowId:config.defaultFlowId || flows[0]?.id || '',
    modules,relations,flows,states,recentWork:config.recentWork || null,techUrl:`./technical/${config.id}/#/view/index/`};
}
