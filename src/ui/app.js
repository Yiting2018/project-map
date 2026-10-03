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
    { id: 'map', label: '架构地图', icon: 'squares-four' },
    { id: 'flows', label: '业务链路', icon: 'graph' },
    { id: 'status', label: '开发状态', icon: 'kanban' }
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

  function text(value) {
    return value == null ? '' : String(value);
  }

  function displayTime(value) {
    if (!value) return '时间未记录';
    if (!text(value).includes('T')) return text(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
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
      return { id: '__unrecorded', label: '未记录', color: '#94a3b8' };
    }
    const configured = statusById(project, module.status.phase);
    return configured
      ? { id: text(configured.id), label: text(configured.label), color: color(configured.color) }
      : { id: text(module.status.phase), label: text(module.status.phase) || '未记录', color: '#94a3b8' };
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
      aria-label="查看 ${escapeHTML(module.title)} 详情"
      style="--domain:${color(domain?.color)}"
    >
      <span class="module-card__top">
        <span class="module-card__title">${escapeHTML(module.title)}</span>
        ${statusPill(project, module, true)}
      </span>
      ${!compact && module.summary ? `<span class="module-card__summary">${escapeHTML(module.summary)}</span>` : ''}
      ${compact && (gaps.length || hasBlockers) ? `<span class="module-card__meta">
        ${gaps.length ? `<span class="gap-flag">${icon('warning-circle')} 缺口</span>` : ''}
        ${hasBlockers ? `<span class="blocker-flag">${icon('warning-circle')} 阻塞</span>` : ''}
      </span>` : ''}
      ${!compact ? `<span class="module-card__meta">
        ${module.scope ? `<span>${escapeHTML(module.scope)}</span>` : '<span>未标注范围</span>'}
        ${gaps.length ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(gaps.join('、'))}</span>` : ''}
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
          <strong>Project Map</strong>
          <small>只读项目驾驶舱</small>
        </span>
      </div>
      <label class="project-picker">
        <span>当前项目</span>
        <span class="select-wrap">
          <select data-action="select-project" data-testid="project-selector" aria-label="选择项目">
            ${projects.map((item) => `<option value="${escapeHTML(item.id)}"${text(item.id) === state.projectId ? ' selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}
          </select>
          ${icon('caret-down')}
        </span>
      </label>
      <div class="snapshot-brief" title="快照修订 ${escapeHTML(snapshot.revision)}">
        ${icon('clock')}
        <span><strong>${escapeHTML(snapshot.label || '静态快照')}</strong><small>模型核对 ${escapeHTML(displayTime(snapshot.observedAt || snapshot.builtAt))}</small></span>
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
      <span><strong>快照说明</strong>${escapeHTML(project.notice || '暂无快照说明。')}</span>
    </aside>`;
  }

  function navAndSearch() {
    return `<div class="toolbar">
      <nav class="view-nav" aria-label="Dashboard 视图" data-testid="primary-nav">
        ${NAV.map((item) => `<button type="button" data-action="switch-view" data-view="${item.id}" class="nav-button${state.view === item.id ? ' is-active' : ''}" aria-current="${state.view === item.id ? 'page' : 'false'}">${icon(item.icon)}${item.label}</button>`).join('')}
      </nav>
      <label class="search-box">
        ${icon('magnifying-glass')}
        <span class="sr-only">搜索模块</span>
        <input data-action="search" data-testid="module-search" type="search" value="${escapeHTML(state.search)}" placeholder="搜索模块…" autocomplete="off">
        <kbd>⌘ K</kbd>
      </label>
    </div>`;
  }

  function domainLegend(project) {
    if (!list(project.domains).length) return '';
    return `<div class="domain-legend" aria-label="领域图例">
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
            <div class="matrix-corner"><span>层级</span><span>领域</span></div>
            ${domains.map((domain) => `<div class="domain-heading" style="--domain:${color(domain.color)}">
              <span class="domain-icon">${icon(domain.icon)}</span>
              <span><strong>${escapeHTML(domain.label)}</strong>${domain.description ? `<small>${escapeHTML(domain.description)}</small>` : ''}</span>
            </div>`).join('')}
            ${layers.map((layer) => {
              const row = [`<div class="layer-heading"><strong>${escapeHTML(layer.label)}</strong>${layer.description ? `<small>${escapeHTML(layer.description)}</small>` : ''}</div>`];
              domains.forEach((domain) => {
                const modules = visible.filter((module) => text(module.layerId) === text(layer.id) && text(module.domainId) === text(domain.id));
                row.push(`<div class="matrix-cell" style="--domain:${color(domain.color)}">${modules.length ? modules.map((module) => moduleButton(project, module, state.matrixScope === 'key' ? 'map-key' : 'map')).join('') : '<span class="empty-cell">暂无模块</span>'}</div>`);
              });
              return row.join('');
            }).join('')}
          </div>
        </div>`
      : `<div class="empty-panel">${icon('squares-four')}<strong>暂无可展示的矩阵</strong><span>领域或层级数据为空。</span></div>`;

    return `<section class="content-section" aria-labelledby="map-title">
      <div class="section-heading section-heading--split">
        <div><h2 id="map-title">系统架构与领域地图</h2><p>按领域和层级阅读当前快照，选择卡片查看统一详情。</p></div>
        <div class="segmented" aria-label="地图展示范围" data-testid="matrix-scope-toggle">
          <button type="button" data-action="matrix-scope" data-scope="key" class="${state.matrixScope === 'key' ? 'is-active' : ''}">关键模块</button>
          <button type="button" data-action="matrix-scope" data-scope="all" class="${state.matrixScope === 'all' ? 'is-active' : ''}">全部模块</button>
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
          <div><p class="eyebrow">FLOW ENTRIES</p><h3 id="flow-entry-title">流程入口</h3></div>
          ${kinds.length > 1 ? `<label class="compact-select">筛选
            <select data-action="flow-filter" aria-label="筛选流程类型">
              <option value="all">全部</option>
              ${kinds.map((kind) => `<option value="${escapeHTML(kind)}"${state.flowFilter === kind ? ' selected' : ''}>${kind === 'sequence' ? '动态流程' : kind === 'relationships' ? '关系视图' : escapeHTML(kind)}</option>`).join('')}
            </select>
          </label>` : ''}
        </div>
        <div class="flow-entry-list">
          ${flows.length ? flows.map((flow) => `<button type="button" class="flow-entry" data-action="open-flow" data-flow-id="${escapeHTML(flow.id)}">
            <span class="flow-entry__icon">${icon(flow.kind === 'sequence' ? 'arrow-right' : 'graph')}</span>
            <span><strong>${escapeHTML(flow.title)}</strong><small>${escapeHTML(flow.description || (flow.kind === 'sequence' ? '动态流程' : '关系视图'))}</small></span>
            ${icon('arrow-up-right')}
          </button>`).join('') : '<p class="empty-copy">当前筛选下暂无流程。</p>'}
        </div>
      </section>
      <section class="panel-card recent-card" aria-labelledby="recent-title">
        <div class="panel-card__head"><div><p class="eyebrow">RECENT RECORD</p><h3 id="recent-title">最近记录工作</h3></div>${icon('clipboard')}</div>
        ${recent ? `<div class="recent-work">
          <strong>${escapeHTML(recent.title)}</strong>
          ${recent.summary ? `<p>${escapeHTML(recent.summary)}</p>` : ''}
          ${recent.location ? `<span>${icon('map-trifold')} ${escapeHTML(recent.location)}</span>` : ''}
          ${recent.source ? `<span>${icon('files')} ${escapeHTML(recent.source.title)} · <code>${escapeHTML(recent.source.path)}</code></span>` : ''}
        </div>` : '<p class="empty-copy">尚无最近工作记录。</p>'}
      </section>
    </div>`;
  }

  function endpointButton(project, moduleId, fallback) {
    const module = moduleById(project, moduleId);
    if (!module) return `<span class="flow-endpoint is-missing">${escapeHTML(fallback || moduleId || '未知模块')}</span>`;
    const domain = domainById(project, module.domainId);
    return `<button type="button" class="flow-endpoint" style="--domain:${color(domain?.color)}" data-action="open-module" data-module-id="${escapeHTML(module.id)}">${escapeHTML(module.title)}</button>`;
  }

  function flowDiagram(project, flow) {
    const edges = list(flow.edges);
    if (!edges.length) return '<div class="empty-panel is-small"><strong>暂无关系记录</strong><span>此流程没有可展示的边。</span></div>';
    if (flow.kind === 'sequence') {
      return `<ol class="sequence-list">${edges.map((edge, index) => `<li class="sequence-step${edge.isGap ? ' has-gap' : ''}">
        <span class="step-index">${index + 1}</span>
        <div class="step-route">${endpointButton(project, edge.source)}<span class="route-arrow">${icon('arrow-right')}</span>${endpointButton(project, edge.target)}</div>
        <span class="step-label">${escapeHTML(edge.label || '调用')}</span>
        ${edge.isGap ? `<span class="gap-flag">${icon('warning-circle')} 存在缺口</span>` : ''}
      </li>`).join('')}</ol>`;
    }
    return `<div class="relationship-list">${edges.map((edge) => `<div class="relationship-row${edge.isGap ? ' has-gap' : ''}">
      <div class="relationship-route">${endpointButton(project, edge.source)}<span>${icon('arrow-right')}<small>${escapeHTML(edge.label || '关联')}</small></span>${endpointButton(project, edge.target)}</div>
      ${edge.isGap ? `<span class="gap-flag">${icon('warning-circle')} 存在缺口</span>` : ''}
    </div>`).join('')}</div>`;
  }

  function renderFlows(project) {
    const flows = list(project.flows);
    let flow = flows.find((item) => text(item.id) === state.flowId) || flows[0];
    if (flow) state.flowId = text(flow.id);
    const linkedModules = flow ? list(flow.moduleIds).map((id) => moduleById(project, id)).filter(Boolean).filter(matchesSearch) : [];
    return `<section class="content-section" aria-labelledby="flows-title">
      <div class="section-heading"><p class="eyebrow">BUSINESS FLOWS</p><h2 id="flows-title">业务链路</h2><p>查看模块如何交接，以及目前还缺少哪些连接。关系视图不代表执行先后。</p></div>
      ${flows.length ? `<div class="flow-layout" data-testid="flow-view">
        <aside class="flow-sidebar" aria-label="流程列表">
          ${flows.map((item) => `<button type="button" data-action="select-flow" data-flow-id="${escapeHTML(item.id)}" class="flow-tab${text(item.id) === state.flowId ? ' is-active' : ''}">
            <span>${icon(item.kind === 'sequence' ? 'arrow-right' : 'graph')}<strong>${escapeHTML(item.title)}</strong></span>
            <small>${item.kind === 'sequence' ? '动态流程' : item.kind === 'relationships' ? '关系视图' : escapeHTML(item.kind)}</small>
          </button>`).join('')}
        </aside>
        <article class="flow-canvas">
          <div class="flow-titlebar">
            <div><span class="kind-label">${flow.kind === 'sequence' ? '动态流程' : flow.kind === 'relationships' ? '关系视图' : escapeHTML(flow.kind)}</span><h3>${escapeHTML(flow.title)}</h3>${flow.description ? `<p>${escapeHTML(flow.description)}</p>` : ''}</div>
            ${safeUrl(flow.techUrl) ? `<a class="secondary-link" href="${escapeHTML(safeUrl(flow.techUrl))}" target="_blank" rel="noopener">${icon('code')} 技术图 ${icon('arrow-up-right')}</a>` : ''}
          </div>
          ${flow.conclusion ? `<aside class="flow-conclusion">${icon('info')}<span><strong>结论</strong>${escapeHTML(flow.conclusion)}</span></aside>` : ''}
          ${flowDiagram(project, flow)}
          ${flow.scope ? `<p class="flow-scope"><strong>适用范围</strong>${escapeHTML(flow.scope)}</p>` : ''}
          <div class="linked-modules"><h4>涉及模块</h4><div>${linkedModules.length ? linkedModules.map((module) => moduleButton(project, module, 'flow')).join('') : '<p class="empty-copy">当前搜索下暂无关联模块。</p>'}</div></div>
        </article>
      </div>` : '<div class="empty-panel">'+icon('graph')+'<strong>暂无业务链路</strong><span>项目快照未提供流程。</span></div>'}
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
      id: '__unrecorded', label: '未记录', color: '#94a3b8',
      count: list(project.modules).filter((module) => !module.status).length
    }];
    return `<section class="content-section" aria-labelledby="status-title">
      <div class="section-heading"><p class="eyebrow">DELIVERY RECORDS</p><h2 id="status-title">开发状态</h2><p>状态、阻塞和验收只展示项目侧记录；缺失信息保持未记录。</p></div>
      <div class="status-filters" role="group" aria-label="筛选开发状态" data-testid="status-filters">
        <button type="button" data-action="status-filter" data-status="all" class="${state.statusFilter === 'all' ? 'is-active' : ''}"><span>全部</span><strong>${list(project.modules).length}</strong></button>
        ${grouped.map((item) => `<button type="button" data-action="status-filter" data-status="${escapeHTML(item.id)}" class="${state.statusFilter === item.id ? 'is-active' : ''}" style="--status:${item.color}"><i aria-hidden="true"></i><span>${escapeHTML(item.label)}</span><strong>${item.count}</strong></button>`).join('')}
      </div>
      <div class="status-grid" data-testid="status-grid">
        ${modules.length ? modules.map((module) => moduleButton(project, module, 'status')).join('') : '<div class="empty-panel is-small"><strong>没有匹配的模块</strong><span>请调整搜索或状态筛选。</span></div>'}
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
      root.innerHTML = `<main class="fatal-state"><strong>没有可展示的项目</strong><p>请先构建并注入有效的 PROJECT_MAP_DATA。</p></main>`;
      return;
    }
    document.title = `${text(project.name)} · Project Map`;
    root.innerHTML = `${header(project)}<main id="main-content" class="page-shell">${pageIntro(project)}${navAndSearch()}${renderMain(project)}</main><div id="drawer-root"></div>`;
    if (state.moduleId) renderDrawer(project);
  }

  function pathRows(items, emptyLabel) {
    return list(items).length
      ? `<ul class="detail-list">${list(items).map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`
      : `<p class="empty-copy">${escapeHTML(emptyLabel)}</p>`;
  }

  function acceptanceRows(items) {
    if (!list(items).length) return '<p class="empty-copy">尚未定义验收项。</p>';
    const resultLabels = { passed: '通过', failed: '未通过', not_run: '未运行' };
    const resultIcons = { passed: 'check-circle', failed: 'warning-circle', not_run: 'circle-dashed' };
    return `<ul class="acceptance-list">${list(items).map((item) => `<li data-result="${escapeHTML(item.result)}">${icon(resultIcons[item.result] || 'circle-dashed')}<span>${escapeHTML(item.title)}</span><strong>${escapeHTML(resultLabels[item.result] || item.result || '未记录')}</strong></li>`).join('')}</ul>`;
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
      if (!relations.length) return '<p class="empty-copy">暂无记录。</p>';
      return `<div class="relation-chips">${relations.map((relation) => {
        const other = side === 'incoming' ? relation.source : relation.target;
        const target = moduleById(project, other);
        return target ? `<button type="button" data-action="open-module" data-module-id="${escapeHTML(target.id)}"><strong>${escapeHTML(target.title)}</strong><span>${escapeHTML(relation.label || '关联')}${relation.isGap ? ' · 存在缺口' : ''}</span></button>` : '';
      }).join('')}</div>`;
    }

    drawerRoot.innerHTML = `<div class="drawer-layer is-open" data-testid="module-drawer">
      <button class="drawer-scrim" type="button" data-action="close-drawer" aria-label="关闭详情"></button>
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" style="--domain:${color(domain?.color)}">
        <header class="drawer-header">
          <div class="drawer-kicker"><span>${domain ? escapeHTML(domain.label) : '未分类领域'}</span><i></i><span>${layer ? escapeHTML(layer.label) : '未分类层级'}</span></div>
          <button class="icon-button" type="button" data-action="close-drawer" aria-label="关闭详情">${icon('x')}</button>
          <h2 id="drawer-title">${escapeHTML(module.title)}</h2>
          ${module.summary ? `<p>${escapeHTML(module.summary)}</p>` : ''}
          <div class="module-identity"><span>模块 ID</span><code>${escapeHTML(module.id)}</code><button type="button" data-action="copy-module-id" data-module-id="${escapeHTML(module.id)}">复制</button></div>
          <div class="drawer-badges">${statusPill(project, module)}${module.scope ? `<span class="scope-badge">${escapeHTML(module.scope)}</span>` : ''}${module.isGap ? `<span class="gap-flag">${icon('warning-circle')} ${escapeHTML(list(module.gapLabels).join('、') || '存在缺口')}</span>` : ''}</div>
        </header>
        <div class="drawer-content">
          <section><h3>${icon('info')} 业务解释</h3><p>${escapeHTML(module.description || module.summary || '暂无详细解释。')}</p></section>
          <section><h3>${icon('kanban')} 开发记录</h3>
            ${status ? `<dl class="status-summary"><div><dt>当前说明</dt><dd>${escapeHTML(status.summary || '未记录')}</dd></div></dl>
              <h4>最近记录工作</h4>${pathRows(status.work, '暂无工作记录。')}
              <h4>阻塞项</h4>${pathRows(status.blockers, '暂无阻塞记录。')}
              <h4>验收项</h4>${acceptanceRows(status.acceptance)}
              <h4>验收证据</h4>${list(status.evidence).length ? `<ul class="evidence-list">${list(status.evidence).map((item) => `<li><strong>${escapeHTML(item.title)}</strong><code>${escapeHTML(item.path)}</code><span>${escapeHTML(item.recordedAt || '日期未记录')} · ${escapeHTML(item.scope || '范围未记录')}</span></li>`).join('')}</ul>` : '<p class="empty-copy">暂无证据记录。</p>'}` : '<p class="empty-copy">此模块尚未记录开发状态。</p>'}
          </section>
          <section><h3>${icon('graph')} 上下游关系</h3><div class="relation-columns"><div><h4>上游</h4>${relationRows(incoming, 'incoming')}</div><div><h4>下游</h4>${relationRows(outgoing, 'outgoing')}</div></div></section>
          <section><h3>${icon('arrow-right')} 关联流程</h3>${flows.length ? `<div class="drawer-links">${flows.map((flow) => `<button type="button" data-action="open-flow" data-flow-id="${escapeHTML(flow.id)}"><span>${escapeHTML(flow.title)}</span>${icon('arrow-up-right')}</button>`).join('')}</div>` : '<p class="empty-copy">暂无关联流程。</p>'}</section>
          <section><h3>${icon('code')} 技术资料</h3>
            <div class="drawer-links">
              ${states.map((item) => safeUrl(item.url) ? `<a href="${escapeHTML(safeUrl(item.url))}" target="_blank" rel="noopener"><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.description)}</small></span>${icon('arrow-up-right')}</a>` : '').join('')}
              ${technicalUrl ? `<a href="${escapeHTML(technicalUrl)}" target="_blank" rel="noopener"><span><strong>项目技术图</strong><small>查看项目架构产物</small></span>${icon('arrow-up-right')}</a>` : ''}
            </div>
            ${list(module.sources).length ? `<h4>事实来源</h4><ul class="source-list">${list(module.sources).map((item) => `<li><span>${icon('files')} ${escapeHTML(item.title)}</span><code>${escapeHTML(item.path)}</code></li>`).join('')}</ul>` : '<p class="empty-copy">暂无来源记录。</p>'}
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
        button.textContent = copied ? '已复制' : '请选择复制';
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
