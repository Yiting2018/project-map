(() => {
  'use strict';

  const ICONS = new Set([
    'squares-four', 'graph', 'kanban', 'magnifying-glass', 'arrow-right',
    'arrow-up-right', 'x', 'caret-down', 'book-open', 'graduation-cap',
    'plant', 'user-circle', 'cube', 'stack', 'check-circle',
    'warning-circle', 'circle-dashed', 'clock', 'code', 'info', 'funnel',
    'map-trifold', 'clipboard', 'files'
  ]);

  const NAV = [
    { id: 'map', labelKey: 'navMap', icon: 'squares-four' },
    { id: 'flows', labelKey: 'navFlows', icon: 'graph' },
    { id: 'status', labelKey: 'navStatus', icon: 'kanban' }
  ];

  const state = {
    projectId: '',
    view: 'map',
    search: '',
    matrixScope: 'key',
    flowId: '',
    flowFilter: 'all',
    statusFilter: 'all',
    moduleId: null,
    returnFocus: null
  };

  const root = document.querySelector('#app');
  const payload = window.PROJECT_MAP_DATA || {};
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const i18n = window.ProjectMapI18n;

  function text(value) {
    return value == null ? '' : String(value);
  }

  function locale(project = currentProject()) {
    return i18n.normalizeLocale(project?.locale);
  }

  function t(key, values, project = currentProject()) {
    return i18n.translate(locale(project), key, values);
  }

  function displayTime(value, project = currentProject()) {
    if (!value) return t('timeNotRecorded', {}, project);
    if (!text(value).includes('T')) return text(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString(locale(project), {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  }

  function displayRevision(value, project = currentProject()) {
    const revision = text(value);
    if (!revision) return t('revisionNotRecorded', {}, project);
    if (revision === 'Git revision not recorded') return t('revisionNotRecorded', {}, project);
    if (revision.endsWith(' + uncommitted changes')) {
      return revision.slice(0, -' + uncommitted changes'.length) + t('revisionDirtySuffix', {}, project);
    }
    return revision;
  }

  function escapeHTML(value) {
    return text(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function color(value, fallback = '#64748b') {
    return /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback;
  }

  function iconName(value) {
    return ICONS.has(text(value)) ? text(value) : 'cube';
  }

  function icon(name, className = '') {
    return `<img class="icon ${escapeHTML(className)}" src="./assets/icons/${iconName(name)}.svg" alt="" aria-hidden="true">`;
  }

  function safeUrl(value) {
    const candidate = text(value).trim();
    if (!candidate || /[\\\u0000-\u001f]/.test(candidate) || candidate.startsWith('//')) return '';
    if (/^(?:\.\.\/|\.\/|\/|#)[A-Za-z0-9_./#?=&%+,:@~-]*$/.test(candidate)) return candidate;
    return '';
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function currentProject() {
    return projects.find((project) => text(project.id) === state.projectId) || projects[0] || null;
  }

  function moduleById(project, id) {
    return list(project.modules).find((module) => text(module.id) === text(id));
  }

  function domainById(project, id) {
    return list(project.domains).find((domain) => text(domain.id) === text(id));
  }

  function layerById(project, id) {
    return list(project.layers).find((layer) => text(layer.id) === text(id));
  }

  function statusById(project, id) {
    return list(project.statuses).find((status) => text(status.id) === text(id));
  }

  function statusMeta(project, module) {
    if (!module || !module.status) {
      return { id: '__unrecorded', label: t('unrecorded', {}, project), color: '#94a3b8' };
    }
    const configured = statusById(project, module.status.phase);
    return configured
      ? { id: text(configured.id), label: text(configured.label), color: color(configured.color) }
      : { id: text(module.status.phase), label: text(module.status.phase) || t('unrecorded', {}, project), color: '#94a3b8' };
  }

  function statusPill(project, module, compact = false) {
    const meta = statusMeta(project, module);
    return `<span class="status-pill${compact ? ' is-compact' : ''}" style="--status:${color(meta.color)}">
      <span class="status-dot" aria-hidden="true"></span>${escapeHTML(meta.label)}
    </span>`;
  }

  function queryProjectId() {
    const params = new URLSearchParams(window.location.search);
    return text(params.get('project'));
  }

  function initState(projectId) {
    const project = projects.find((item) => text(item.id) === text(projectId)) || projects[0];
    if (!project) return;
    state.projectId = text(project.id);
    state.view = 'map';
    state.search = '';
    state.matrixScope = 'key';
    state.flowId = text(project.defaultFlowId) || text(list(project.flows)[0]?.id);
    state.flowFilter = 'all';
    state.statusFilter = 'all';
    state.moduleId = null;
  }

  function updateProjectQuery() {
    const url = new URL(window.location.href);
    url.searchParams.set('project', state.projectId);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function matchesSearch(module) {
    const needle = state.search.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [module.title, module.summary, module.description, module.scope]
      .map(text)
      .some((value) => value.toLocaleLowerCase().includes(needle));
  }

  function moduleButton(project, module, context) {
    const domain = domainById(project, module.domainId);
    const gaps = list(module.gapLabels);
    const compact = context === 'map-key';
    const hasBlockers = list(module.status?.blockers).length > 0;
    return `<button
      class="module-card${module.isGap ? ' has-gap' : ''}${compact ? ' is-compact' : ''}"
      type="button"
      data-action="open-module"
      data-module-id="${escapeHTML(module.id)}"
      data-testid="module-card-${escapeHTML(module.id)}"
      aria-label="${escapeHTML(t('viewModuleDetails', { title: module.title }, project))}"
      style="--domain:${color(domain?.color)}"
    >
      <span class="module-card__top">
        <span class="module-card__title">${escapeHTML(module.title)}</span>
        ${statusPill(project, module, true)}
      </span>
      ${!compact && module.summary ? `<span class="module-card__summary">${escapeHTML(module.summary)}</span>` : ''}
      ${compact && (gaps.length || hasBlockers) ? `<span class="module-card__meta">
        ${gaps.length ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(t('gap', {}, project))}</span>` : ''}
        ${hasBlockers ? `<span class="blocker-flag">${icon('warning-circle')} ${escapeHTML(t('blocked', {}, project))}</span>` : ''}
      </span>` : ''}
      ${!compact ? `<span class="module-card__meta">
        ${module.scope ? `<span>${escapeHTML(module.scope)}</span>` : `<span>${escapeHTML(t('scopeNotRecorded', {}, project))}</span>`}
        ${gaps.length ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(gaps.join(locale(project) === 'zh-CN' ? '、' : ', '))}</span>` : ''}
      </span>` : ''}
      ${context === 'status' && module.status?.summary ? `<span class="module-card__work">${escapeHTML(module.status.summary)}</span>` : ''}
    </button>`;
  }

  function header(project) {
    const snapshot = project.snapshot || {};
    return `<header class="app-header">
      <div class="brand-block">
        <span class="brand-icon">${icon('map-trifold')}</span>
        <span>
          <strong>${escapeHTML(t('brand', {}, project))}</strong>
          <small>${escapeHTML(t('brandSubtitle', {}, project))}</small>
        </span>
      </div>
      <label class="project-picker">
        <span>${escapeHTML(t('currentProject', {}, project))}</span>
        <span class="select-wrap">
          <select data-action="select-project" data-testid="project-selector" aria-label="${escapeHTML(t('selectProject', {}, project))}">
            ${projects.map((item) => `<option value="${escapeHTML(item.id)}"${text(item.id) === state.projectId ? ' selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}
          </select>
          ${icon('caret-down')}
        </span>
      </label>
      <div class="snapshot-brief" title="${escapeHTML(t('snapshotRevision', { revision: displayRevision(snapshot.revision, project) }, project))}">
        ${icon('clock')}
        <span><strong>${escapeHTML(snapshot.label || t('staticSnapshot', {}, project))}</strong><small>${escapeHTML(t('modelChecked', { time: displayTime(snapshot.observedAt || snapshot.builtAt, project) }, project))}</small></span>
      </div>
    </header>`;
  }

  function pageIntro(project) {
    return `<section class="page-intro" aria-labelledby="project-title">
      <div>
        <h1 id="project-title">${escapeHTML(project.name)}</h1>
        ${project.subtitle ? `<p class="subtitle">${escapeHTML(project.subtitle)}</p>` : ''}
      </div>
      ${project.scope ? `<span class="scope-badge">${icon('funnel')} ${escapeHTML(project.scope)}</span>` : ''}
    </section>
    <aside class="snapshot-notice" data-testid="snapshot-notice">
      ${icon('info')}
      <span><strong>${escapeHTML(t('snapshotNote', {}, project))}</strong>${escapeHTML(project.notice || t('noSnapshotNote', {}, project))}</span>
    </aside>`;
  }

  function navAndSearch(project) {
    return `<div class="toolbar">
      <nav class="view-nav" aria-label="${escapeHTML(t('viewsAria', {}, project))}" data-testid="primary-nav">
        ${NAV.map((item) => `<button type="button" data-action="switch-view" data-view="${item.id}" class="nav-button${state.view === item.id ? ' is-active' : ''}" aria-current="${state.view === item.id ? 'page' : 'false'}">${icon(item.icon)}${escapeHTML(t(item.labelKey, {}, project))}</button>`).join('')}
      </nav>
      <label class="search-box">
        ${icon('magnifying-glass')}
        <span class="sr-only">${escapeHTML(t('searchModules', {}, project))}</span>
        <input data-action="search" data-testid="module-search" type="search" value="${escapeHTML(state.search)}" placeholder="${escapeHTML(t('searchPlaceholder', {}, project))}" autocomplete="off">
        <kbd>⌘ K</kbd>
      </label>
    </div>`;
  }

  function domainLegend(project) {
    if (!list(project.domains).length) return '';
    return `<div class="domain-legend" aria-label="${escapeHTML(t('domainLegend', {}, project))}">
      ${list(project.domains).map((domain) => `<span style="--domain:${color(domain.color)}"><i aria-hidden="true"></i>${escapeHTML(domain.label)}</span>`).join('')}
    </div>`;
  }

  function renderMap(project) {
    const keyIds = new Set(list(project.overviewModuleIds).map(text));
    const scoped = list(project.modules).filter((module) => state.matrixScope === 'all' || keyIds.has(text(module.id)));
    const visible = scoped.filter(matchesSearch);
    const domains = list(project.domains);
    const layers = list(project.layers);
    const minWidth = Math.max(860, 156 + domains.length * 242);

    const matrix = domains.length && layers.length
      ? `<div class="matrix-scroll" data-testid="architecture-matrix">
          <div class="architecture-matrix${state.matrixScope === 'key' ? ' is-key' : ''}" style="--domain-count:${domains.length};min-width:${minWidth}px">
            <div class="matrix-corner"><span>${escapeHTML(t('level', {}, project))}</span><span>${escapeHTML(t('domain', {}, project))}</span></div>
            ${domains.map((domain) => `<div class="domain-heading" style="--domain:${color(domain.color)}">
              <span class="domain-icon">${icon(domain.icon)}</span>
              <span><strong>${escapeHTML(domain.label)}</strong>${domain.description ? `<small>${escapeHTML(domain.description)}</small>` : ''}</span>
            </div>`).join('')}
            ${layers.map((layer) => {
              const row = [`<div class="layer-heading"><strong>${escapeHTML(layer.label)}</strong>${layer.description ? `<small>${escapeHTML(layer.description)}</small>` : ''}</div>`];
              domains.forEach((domain) => {
                const modules = visible.filter((module) => text(module.layerId) === text(layer.id) && text(module.domainId) === text(domain.id));
                row.push(`<div class="matrix-cell" style="--domain:${color(domain.color)}">${modules.length ? modules.map((module) => moduleButton(project, module, state.matrixScope === 'key' ? 'map-key' : 'map')).join('') : `<span class="empty-cell">${escapeHTML(t('noModule', {}, project))}</span>`}</div>`);
              });
              return row.join('');
            }).join('')}
          </div>
        </div>`
      : `<div class="empty-panel">${icon('squares-four')}<strong>${escapeHTML(t('noMatrix', {}, project))}</strong><span>${escapeHTML(t('noMatrixHint', {}, project))}</span></div>`;

    return `<section class="content-section" aria-labelledby="map-title">
      <div class="section-heading section-heading--split">
        <div><h2 id="map-title">${escapeHTML(t('mapTitle', {}, project))}</h2><p>${escapeHTML(t('mapDescription', {}, project))}</p></div>
        <div class="segmented" aria-label="${escapeHTML(t('mapScope', {}, project))}" data-testid="matrix-scope-toggle">
          <button type="button" data-action="matrix-scope" data-scope="key" class="${state.matrixScope === 'key' ? 'is-active' : ''}">${escapeHTML(t('keyModules', {}, project))}</button>
          <button type="button" data-action="matrix-scope" data-scope="all" class="${state.matrixScope === 'all' ? 'is-active' : ''}">${escapeHTML(t('allModules', {}, project))}</button>
        </div>
      </div>
      ${domainLegend(project)}
      ${matrix}
      ${renderMapLower(project)}
    </section>`;
  }

  function renderMapLower(project) {
    const flows = list(project.flows).filter((flow) => state.flowFilter === 'all' || text(flow.kind) === state.flowFilter);
    const recent = project.recentWork;
    const kinds = [...new Set(list(project.flows).map((flow) => text(flow.kind)).filter(Boolean))];
    return `<div class="map-lower-grid">
      <section class="panel-card" aria-labelledby="flow-entry-title">
        <div class="panel-card__head">
          <div><p class="eyebrow">${escapeHTML(t('flowEntriesEyebrow', {}, project))}</p><h3 id="flow-entry-title">${escapeHTML(t('flowEntries', {}, project))}</h3></div>
          ${kinds.length > 1 ? `<label class="compact-select">${escapeHTML(t('filter', {}, project))}
            <select data-action="flow-filter" aria-label="${escapeHTML(t('filterFlowType', {}, project))}">
              <option value="all">${escapeHTML(t('all', {}, project))}</option>
              ${kinds.map((kind) => `<option value="${escapeHTML(kind)}"${state.flowFilter === kind ? ' selected' : ''}>${kind === 'sequence' ? escapeHTML(t('sequence', {}, project)) : kind === 'relationships' ? escapeHTML(t('relationships', {}, project)) : escapeHTML(kind)}</option>`).join('')}
            </select>
          </label>` : ''}
        </div>
        <div class="flow-entry-list">
          ${flows.length ? flows.map((flow) => `<button type="button" class="flow-entry" data-action="open-flow" data-flow-id="${escapeHTML(flow.id)}">
            <span class="flow-entry__icon">${icon(flow.kind === 'sequence' ? 'arrow-right' : 'graph')}</span>
            <span><strong>${escapeHTML(flow.title)}</strong><small>${escapeHTML(flow.description || (flow.kind === 'sequence' ? t('sequence', {}, project) : t('relationships', {}, project)))}</small></span>
            ${icon('arrow-up-right')}
          </button>`).join('') : `<p class="empty-copy">${escapeHTML(t('noFilteredFlows', {}, project))}</p>`}
        </div>
      </section>
      <section class="panel-card recent-card" aria-labelledby="recent-title">
        <div class="panel-card__head"><div><p class="eyebrow">${escapeHTML(t('recentRecordEyebrow', {}, project))}</p><h3 id="recent-title">${escapeHTML(t('recentWork', {}, project))}</h3></div>${icon('clipboard')}</div>
        ${recent ? `<div class="recent-work">
          <strong>${escapeHTML(recent.title)}</strong>
          ${recent.summary ? `<p>${escapeHTML(recent.summary)}</p>` : ''}
          ${recent.location ? `<span>${icon('map-trifold')} ${escapeHTML(recent.location)}</span>` : ''}
          ${recent.source ? `<span>${icon('files')} ${escapeHTML(recent.source.title)} · <code>${escapeHTML(recent.source.path)}</code></span>` : ''}
        </div>` : `<p class="empty-copy">${escapeHTML(t('noRecentWork', {}, project))}</p>`}
      </section>
    </div>`;
  }

  function endpointButton(project, moduleId, fallback) {
    const module = moduleById(project, moduleId);
    if (!module) return `<span class="flow-endpoint is-missing">${escapeHTML(fallback || moduleId || t('unknownModule', {}, project))}</span>`;
    const domain = domainById(project, module.domainId);
    return `<button type="button" class="flow-endpoint" style="--domain:${color(domain?.color)}" data-action="open-module" data-module-id="${escapeHTML(module.id)}">${escapeHTML(module.title)}</button>`;
  }

  function flowDiagram(project, flow) {
    const edges = list(flow.edges);
    if (!edges.length) return `<div class="empty-panel is-small"><strong>${escapeHTML(t('noRelations', {}, project))}</strong><span>${escapeHTML(t('noRelationsHint', {}, project))}</span></div>`;
    if (flow.kind === 'sequence') {
      return `<ol class="sequence-list">${edges.map((edge, index) => `<li class="sequence-step${edge.isGap ? ' has-gap' : ''}">
        <span class="step-index">${index + 1}</span>
        <div class="step-route">${endpointButton(project, edge.source)}<span class="route-arrow">${icon('arrow-right')}</span>${endpointButton(project, edge.target)}</div>
        <span class="step-label">${escapeHTML(edge.label || t('calls', {}, project))}</span>
        ${edge.isGap ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(t('hasGap', {}, project))}</span>` : ''}
      </li>`).join('')}</ol>`;
    }
    return `<div class="relationship-list">${edges.map((edge) => `<div class="relationship-row${edge.isGap ? ' has-gap' : ''}">
      <div class="relationship-route">${endpointButton(project, edge.source)}<span>${icon('arrow-right')}<small>${escapeHTML(edge.label || t('related', {}, project))}</small></span>${endpointButton(project, edge.target)}</div>
      ${edge.isGap ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(t('hasGap', {}, project))}</span>` : ''}
    </div>`).join('')}</div>`;
  }

  function renderFlows(project) {
    const flows = list(project.flows);
    let flow = flows.find((item) => text(item.id) === state.flowId) || flows[0];
    if (flow) state.flowId = text(flow.id);
    const linkedModules = flow ? list(flow.moduleIds).map((id) => moduleById(project, id)).filter(Boolean).filter(matchesSearch) : [];
    return `<section class="content-section" aria-labelledby="flows-title">
      <div class="section-heading"><p class="eyebrow">${escapeHTML(t('flowsEyebrow', {}, project))}</p><h2 id="flows-title">${escapeHTML(t('flowsTitle', {}, project))}</h2><p>${escapeHTML(t('flowsDescription', {}, project))}</p></div>
      ${flows.length ? `<div class="flow-layout" data-testid="flow-view">
        <aside class="flow-sidebar" aria-label="${escapeHTML(t('flowList', {}, project))}">
          ${flows.map((item) => `<button type="button" data-action="select-flow" data-flow-id="${escapeHTML(item.id)}" class="flow-tab${text(item.id) === state.flowId ? ' is-active' : ''}">
            <span>${icon(item.kind === 'sequence' ? 'arrow-right' : 'graph')}<strong>${escapeHTML(item.title)}</strong></span>
            <small>${item.kind === 'sequence' ? escapeHTML(t('sequence', {}, project)) : item.kind === 'relationships' ? escapeHTML(t('relationships', {}, project)) : escapeHTML(item.kind)}</small>
          </button>`).join('')}
        </aside>
        <article class="flow-canvas">
          <div class="flow-titlebar">
            <div><span class="kind-label">${flow.kind === 'sequence' ? escapeHTML(t('sequence', {}, project)) : flow.kind === 'relationships' ? escapeHTML(t('relationships', {}, project)) : escapeHTML(flow.kind)}</span><h3>${escapeHTML(flow.title)}</h3>${flow.description ? `<p>${escapeHTML(flow.description)}</p>` : ''}</div>
            ${safeUrl(flow.techUrl) ? `<a class="secondary-link" href="${escapeHTML(safeUrl(flow.techUrl))}" target="_blank" rel="noopener">${icon('code')} ${escapeHTML(t('technicalDiagram', {}, project))} ${icon('arrow-up-right')}</a>` : ''}
          </div>
          ${flow.conclusion ? `<aside class="flow-conclusion">${icon('info')}<span><strong>${escapeHTML(t('conclusion', {}, project))}</strong>${escapeHTML(flow.conclusion)}</span></aside>` : ''}
          ${flowDiagram(project, flow)}
          ${flow.scope ? `<p class="flow-scope"><strong>${escapeHTML(t('appliesTo', {}, project))}</strong>${escapeHTML(flow.scope)}</p>` : ''}
          <div class="linked-modules"><h4>${escapeHTML(t('involvedModules', {}, project))}</h4><div>${linkedModules.length ? linkedModules.map((module) => moduleButton(project, module, 'flow')).join('') : `<p class="empty-copy">${escapeHTML(t('noLinkedModulesSearch', {}, project))}</p>`}</div></div>
        </article>
      </div>` : `<div class="empty-panel">${icon('graph')}<strong>${escapeHTML(t('noFlows', {}, project))}</strong><span>${escapeHTML(t('noFlowsHint', {}, project))}</span></div>`}
    </section>`;
  }

  function renderStatus(project) {
    const configured = list(project.statuses);
    const modules = list(project.modules).filter(matchesSearch).filter((module) => {
      if (state.statusFilter === 'all') return true;
      if (state.statusFilter === '__unrecorded') return !module.status;
      return text(module.status?.phase) === state.statusFilter;
    });
    const grouped = [...configured.map((item) => ({
      id: text(item.id), label: text(item.label), color: color(item.color),
      count: list(project.modules).filter((module) => text(module.status?.phase) === text(item.id)).length
    })), {
      id: '__unrecorded', label: t('unrecorded', {}, project), color: '#94a3b8',
      count: list(project.modules).filter((module) => !module.status).length
    }];
    return `<section class="content-section" aria-labelledby="status-title">
      <div class="section-heading"><p class="eyebrow">${escapeHTML(t('deliveryEyebrow', {}, project))}</p><h2 id="status-title">${escapeHTML(t('statusTitle', {}, project))}</h2><p>${escapeHTML(t('statusDescription', {}, project))}</p></div>
      <div class="status-filters" role="group" aria-label="${escapeHTML(t('filterStatus', {}, project))}" data-testid="status-filters">
        <button type="button" data-action="status-filter" data-status="all" class="${state.statusFilter === 'all' ? 'is-active' : ''}"><span>${escapeHTML(t('all', {}, project))}</span><strong>${list(project.modules).length}</strong></button>
        ${grouped.map((item) => `<button type="button" data-action="status-filter" data-status="${escapeHTML(item.id)}" class="${state.statusFilter === item.id ? 'is-active' : ''}" style="--status:${item.color}"><i aria-hidden="true"></i><span>${escapeHTML(item.label)}</span><strong>${item.count}</strong></button>`).join('')}
      </div>
      <div class="status-grid" data-testid="status-grid">
        ${modules.length ? modules.map((module) => moduleButton(project, module, 'status')).join('') : `<div class="empty-panel is-small"><strong>${escapeHTML(t('noMatchingModules', {}, project))}</strong><span>${escapeHTML(t('adjustFilters', {}, project))}</span></div>`}
      </div>
    </section>`;
  }

  function renderMain(project) {
    if (state.view === 'flows') return renderFlows(project);
    if (state.view === 'status') return renderStatus(project);
    return renderMap(project);
  }

  function renderApp() {
    const project = currentProject();
    if (!project) {
      root.innerHTML = `<main class="fatal-state"><strong>${escapeHTML(i18n.translate('zh-CN', 'noProjects'))}</strong><p>${escapeHTML(i18n.translate('zh-CN', 'noProjectsHint'))}</p></main>`;
      return;
    }
    document.documentElement.lang = locale(project);
    document.title = `${text(project.name)} · ${t('brand', {}, project)}`;
    root.innerHTML = `${header(project)}<main id="main-content" class="page-shell">${pageIntro(project)}${navAndSearch(project)}${renderMain(project)}</main><div id="drawer-root"></div>`;
    if (state.moduleId) renderDrawer(project);
  }

  function pathRows(items, emptyLabel) {
    return list(items).length
      ? `<ul class="detail-list">${list(items).map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`
      : `<p class="empty-copy">${escapeHTML(emptyLabel)}</p>`;
  }

  function acceptanceRows(items, project) {
    if (!list(items).length) return `<p class="empty-copy">${escapeHTML(t('noAcceptance', {}, project))}</p>`;
    const resultLabels = { passed: t('passed', {}, project), failed: t('failed', {}, project), not_run: t('notRun', {}, project) };
    const resultIcons = { passed: 'check-circle', failed: 'warning-circle', not_run: 'circle-dashed' };
    return `<ul class="acceptance-list">${list(items).map((item) => `<li data-result="${escapeHTML(item.result)}">${icon(resultIcons[item.result] || 'circle-dashed')}<span>${escapeHTML(item.title)}</span><strong>${escapeHTML(resultLabels[item.result] || item.result || t('unrecorded', {}, project))}</strong></li>`).join('')}</ul>`;
  }

  function renderDrawer(project) {
    const module = moduleById(project, state.moduleId);
    const drawerRoot = document.querySelector('#drawer-root');
    if (!drawerRoot || !module) return;
    const domain = domainById(project, module.domainId);
    const layer = layerById(project, module.layerId);
    const incoming = list(project.relations).filter((relation) => text(relation.target) === text(module.id));
    const outgoing = list(project.relations).filter((relation) => text(relation.source) === text(module.id));
    const flows = list(project.flows).filter((flow) => list(module.flowIds).map(text).includes(text(flow.id)) || list(flow.moduleIds).map(text).includes(text(module.id)));
    const states = list(project.states).filter((item) => list(module.stateIds).map(text).includes(text(item.id)) || list(item.moduleIds).map(text).includes(text(module.id)));
    const status = module.status;
    const technicalUrl = safeUrl(project.techUrl);

    function relationRows(relations, side) {
      if (!relations.length) return `<p class="empty-copy">${escapeHTML(t('noRecord', {}, project))}</p>`;
      return `<div class="relation-chips">${relations.map((relation) => {
        const other = side === 'incoming' ? relation.source : relation.target;
        const target = moduleById(project, other);
        const label = relation.label || t('related', {}, project);
        return target ? `<button type="button" data-action="open-module" data-module-id="${escapeHTML(target.id)}"><strong>${escapeHTML(target.title)}</strong><span>${escapeHTML(label)}${relation.isGap ? ` · ${escapeHTML(t('hasGap', {}, project))}` : ''}</span></button>` : '';
      }).join('')}</div>`;
    }

    drawerRoot.innerHTML = `<div class="drawer-layer is-open" data-testid="module-drawer">
      <button class="drawer-scrim" type="button" data-action="close-drawer" aria-label="${escapeHTML(t('closeDetails', {}, project))}"></button>
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" style="--domain:${color(domain?.color)}">
        <header class="drawer-header">
          <div class="drawer-kicker"><span>${domain ? escapeHTML(domain.label) : escapeHTML(t('uncategorizedDomain', {}, project))}</span><i></i><span>${layer ? escapeHTML(layer.label) : escapeHTML(t('uncategorizedLayer', {}, project))}</span></div>
          <button class="icon-button" type="button" data-action="close-drawer" aria-label="${escapeHTML(t('closeDetails', {}, project))}">${icon('x')}</button>
          <h2 id="drawer-title">${escapeHTML(module.title)}</h2>
          ${module.summary ? `<p>${escapeHTML(module.summary)}</p>` : ''}
          <div class="module-identity"><span>${escapeHTML(t('moduleId', {}, project))}</span><code>${escapeHTML(module.id)}</code><button type="button" data-action="copy-module-id" data-module-id="${escapeHTML(module.id)}">${escapeHTML(t('copy', {}, project))}</button></div>
          <div class="drawer-badges">${statusPill(project, module)}${module.scope ? `<span class="scope-badge">${escapeHTML(module.scope)}</span>` : ''}${module.isGap ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(list(module.gapLabels).join(locale(project) === 'zh-CN' ? '、' : ', ') || t('hasGap', {}, project))}</span>` : ''}</div>
        </header>
        <div class="drawer-content">
          <section><h3>${icon('info')} ${escapeHTML(t('businessExplanation', {}, project))}</h3><p>${escapeHTML(module.description || module.summary || t('noDetailedExplanation', {}, project))}</p></section>
          <section><h3>${icon('kanban')} ${escapeHTML(t('developmentRecord', {}, project))}</h3>
            ${status ? `<dl class="status-summary"><div><dt>${escapeHTML(t('currentNote', {}, project))}</dt><dd>${escapeHTML(status.summary || t('unrecorded', {}, project))}</dd></div></dl>
              <h4>${escapeHTML(t('recentWork', {}, project))}</h4>${pathRows(status.work, t('noWorkRecords', {}, project))}
              <h4>${escapeHTML(t('blockers', {}, project))}</h4>${pathRows(status.blockers, t('noBlockers', {}, project))}
              <h4>${escapeHTML(t('acceptance', {}, project))}</h4>${acceptanceRows(status.acceptance, project)}
              <h4>${escapeHTML(t('evidence', {}, project))}</h4>${list(status.evidence).length ? `<ul class="evidence-list">${list(status.evidence).map((item) => `<li><strong>${escapeHTML(item.title)}</strong><code>${escapeHTML(item.path)}</code><span>${escapeHTML(item.recordedAt ? displayTime(item.recordedAt, project) : t('dateNotRecorded', {}, project))} · ${escapeHTML(item.scope || t('scopeNotRecorded', {}, project))}</span></li>`).join('')}</ul>` : `<p class="empty-copy">${escapeHTML(t('noEvidence', {}, project))}</p>`}` : `<p class="empty-copy">${escapeHTML(t('noDevelopmentStatus', {}, project))}</p>`}
          </section>
          <section><h3>${icon('graph')} ${escapeHTML(t('relationshipsTitle', {}, project))}</h3><div class="relation-columns"><div><h4>${escapeHTML(t('upstream', {}, project))}</h4>${relationRows(incoming, 'incoming')}</div><div><h4>${escapeHTML(t('downstream', {}, project))}</h4>${relationRows(outgoing, 'outgoing')}</div></div></section>
          <section><h3>${icon('arrow-right')} ${escapeHTML(t('relatedFlows', {}, project))}</h3>${flows.length ? `<div class="drawer-links">${flows.map((flow) => `<button type="button" data-action="open-flow" data-flow-id="${escapeHTML(flow.id)}"><span>${escapeHTML(flow.title)}</span>${icon('arrow-up-right')}</button>`).join('')}</div>` : `<p class="empty-copy">${escapeHTML(t('noRelatedFlows', {}, project))}</p>`}</section>
          <section><h3>${icon('code')} ${escapeHTML(t('technicalResources', {}, project))}</h3>
            <div class="drawer-links">
              ${states.map((item) => safeUrl(item.url) ? `<a href="${escapeHTML(safeUrl(item.url))}" target="_blank" rel="noopener"><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.description)}</small></span>${icon('arrow-up-right')}</a>` : '').join('')}
              ${technicalUrl ? `<a href="${escapeHTML(technicalUrl)}" target="_blank" rel="noopener"><span><strong>${escapeHTML(t('projectTechnicalDiagram', {}, project))}</strong><small>${escapeHTML(t('viewArchitectureArtifact', {}, project))}</small></span>${icon('arrow-up-right')}</a>` : ''}
            </div>
            ${list(module.sources).length ? `<h4>${escapeHTML(t('factSources', {}, project))}</h4><ul class="source-list">${list(module.sources).map((item) => `<li><span>${icon('files')} ${escapeHTML(item.title)}</span><code>${escapeHTML(item.path)}</code></li>`).join('')}</ul>` : `<p class="empty-copy">${escapeHTML(t('noSources', {}, project))}</p>`}
          </section>
        </div>
      </aside>
    </div>`;
    requestAnimationFrame(() => document.querySelector('.detail-drawer [data-action="close-drawer"]')?.focus());
  }

  function closeDrawer() {
    state.moduleId = null;
    const drawerRoot = document.querySelector('#drawer-root');
    if (drawerRoot) drawerRoot.innerHTML = '';
    const target = state.returnFocus;
    state.returnFocus = null;
    if (target && document.contains(target)) target.focus();
  }

  async function copyValue(value) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text(value));
        return true;
      } catch (_error) {
        // Continue with the local selection fallback below.
      }
    }
    const input = document.createElement('textarea');
    input.value = text(value);
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_error) {
      copied = false;
    }
    input.remove();
    return copied;
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const project = currentProject();
    if (!project) return;
    if (action === 'switch-view') {
      state.view = button.dataset.view;
      state.moduleId = null;
      renderApp();
    } else if (action === 'matrix-scope') {
      state.matrixScope = button.dataset.scope;
      renderApp();
    } else if (action === 'open-module') {
      if (!state.moduleId) state.returnFocus = button;
      state.moduleId = button.dataset.moduleId;
      renderDrawer(project);
    } else if (action === 'close-drawer') {
      closeDrawer();
    } else if (action === 'select-flow' || action === 'open-flow') {
      state.flowId = button.dataset.flowId;
      state.view = 'flows';
      state.moduleId = null;
      state.returnFocus = null;
      renderApp();
    } else if (action === 'status-filter') {
      state.statusFilter = button.dataset.status;
      renderApp();
    } else if (action === 'copy-module-id') {
      copyValue(button.dataset.moduleId).then((copied) => {
        button.textContent = copied ? t('copied', {}, project) : t('selectToCopy', {}, project);
      });
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-action="select-project"]')) {
      initState(target.value);
      updateProjectQuery();
      renderApp();
    } else if (target.matches('[data-action="flow-filter"]')) {
      state.flowFilter = target.value;
      renderApp();
    }
  });

  root.addEventListener('input', (event) => {
    if (!event.target.matches('[data-action="search"]')) return;
    state.search = event.target.value;
    renderApp();
    const next = document.querySelector('[data-action="search"]');
    next?.focus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.moduleId) {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      document.querySelector('[data-action="search"]')?.focus();
    }
    if (event.key === 'Tab' && state.moduleId) {
      const drawer = document.querySelector('.detail-drawer');
      const focusable = drawer ? [...drawer.querySelectorAll('button, a[href], select, input')].filter((item) => !item.disabled) : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  initState(queryProjectId());
  renderApp();
})();
