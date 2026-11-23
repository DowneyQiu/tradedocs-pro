/* Navigation, dashboards, archives, import/export, backups and app settings. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  const VIEW_META = {
    dashboard: ['工作台', '订单、客户与单证概览 · 离线单机版 · SQLite 本地存储'],
    orders: ['订单与单证', '搜索、修改、复制订单；从同一订单快照生成单证'],
    studio: ['单证中心 / 预览导出', '五种单证一键预览与导出 · 11 种语言 · 9 款配色 · 箱唛打印'],
    customers: ['客户管理', '客户档案、专属报价与单证特殊要求'],
    products: ['产品管理', '橡胶材料与密封制品档案、包装参数与本机图片'],
    packing: ['装箱管理', '按实际箱号汇总；混装箱体积只计一次；逐型号核对数量'],
    accounts: ['收款账户', '本机账户资料 · 按币种管理与披露规则'],
    entities: ['出单主体', '唯一出单主体的抬头、地址、联系方式与 Logo'],
    rates: ['汇率管理', '手动参考汇率台账；结算金额不受影响'],
    profit: ['利润分析', '内部成本核算，不会出现在任何客户单证'],
    history: ['历史记录', '订单修改快照与回收站'],
    settings: ['公司与系统设置', '本机数据、模板规则、备份与恢复'],
    about: ['帮助与支持', '快速上手、系统边界、常见问题与版权信息'],
  };
  TD._activeView = 'dashboard';

  TD.boot = async function () {
    const version = document.getElementById('sideVersion');
    if (version) version.textContent = 'v' + TD.VERSION;
    TD.initOrderForm();
    document.querySelectorAll('.nav').forEach((nav) => {
      nav.addEventListener('click', () => TD.setActiveNav(nav.dataset.view));
    });
    await TD.syncFromSqlite();
    // Re-apply after SQLite is authoritative, so a logo uploaded
    // earlier survives a cleared browser cache.
    if (TD.applyBrandLogo) TD.applyBrandLogo();
    TD.refresh();
    // The fixed contracting entity is shown on step 3 even before the order
    // modal is opened, so resolve it once at boot instead of showing a placeholder.
    if (TD.refreshAccountOptions) TD.refreshAccountOptions();
    TD.refreshProductDatalist();
    TD.setActiveNav('dashboard');
    TD.renderGlobalNotice();
  };

  TD.renderGlobalNotice = function () {
    const el = document.getElementById('globalNotice');
    if (!el) return;
    // First-run setup guidance. Both items are generic product guidance;
    // no company-specific data is hardcoded here.
    const notes = [
      '首次使用请在【出单主体】中录入贵公司的法定名称、地址与联系方式，并在【收款账户】中补齐银行资料；正式出单前请逐项核对。',
      '客户可见单证只使用【公司与系统设置】中核定的对外品牌名；生成单证前会自动扫描并阻断禁用词残留。',
    ];
    TD.notice(el, '<b>资料与合规提示</b><ul>' + notes.map((n) => '<li>' + E(n) + '</li>').join('') + '</ul>', 'info');
  };

  // ------------------------------------------------------------- dashboard
  // Scope: only orders created inside this system. Amounts are always
  // shown per settlement currency (USD and EUR are never added together).
  // Orders without recorded internal cost are excluded from margin figures,
  // never treated as zero cost.
  const COST_KEYS = ['productCost', 'inlandFreight', 'internationalFreight', 'customs', 'other'];
  TD.dashboardStats = function () {
    const orders = TD.get('orders') || [];
    const quoteStages = TD.QUOTE_STAGES || ['报价中', '已报价待回复'];
    const live = orders.filter((o) => o.state !== '已取消');
    const isQuote = (o) => quoteStages.includes(String(o.state || '报价中').trim());
    const quotes = live.filter(isQuote);
    const won = live.filter((o) => !isQuote(o));
    const now = new Date();
    const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const add = (bag, cur, value) => { const k = cur || 'USD'; bag[k] = (bag[k] || 0) + value; };
    const quotedByCur = {}, wonByCur = {};
    for (const o of quotes) add(quotedByCur, o.currency, TD.num(o.total));
    for (const o of won) add(wonByCur, o.currency, TD.num(o.total));
    const costMap = new Map((TD.get('settings') || []).filter((r) => r.kind === 'order-cost')
      .map((r) => [r.orderId, r]));
    const profitByCur = {}, revenueWithCost = {};
    let covered = 0;
    for (const o of won) {
      const c = costMap.get(o.id);
      if (!c) continue;
      covered += 1;
      const cost = COST_KEYS.reduce((sum, k) => sum + TD.num(c[k]), 0);
      add(profitByCur, o.currency, TD.num(o.total) - cost);
      add(revenueWithCost, o.currency, TD.num(o.total));
    }
    const marginByCur = [];
    for (const c of Object.keys(revenueWithCost)) {
      if (TD.num(revenueWithCost[c]) > 0)
        marginByCur.push([c, TD.num(profitByCur[c]) / TD.num(revenueWithCost[c]) * 100]);
    }
    // Rank by order count, never by a cross-currency sum.
    const group = (keyOf) => {
      const m = new Map();
      for (const o of live) {
        const k = keyOf(o) || '未填写';
        const row = m.get(k) || { name: k, count: 0, byCur: {} };
        row.count += 1;
        add(row.byCur, o.currency, TD.num(o.total));
        m.set(k, row);
      }
      return [...m.values()]
        .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)))
        .slice(0, 5);
    };
    return {
      monthQuotes: orders.filter((o) => String(o.date || '').slice(0, 7) === month).length,
      quotes: quotes.length, won: won.length, live: live.length,
      pending: quotes.filter((o) => o.state === '已报价待回复').length,
      conversionRate: live.length ? Math.round(won.length / live.length * 1000) / 10 : 0,
      quotedByCur, wonByCur, profitByCur, marginByCur, covered,
      customers: group((o) => o.buyer), countries: group((o) => o.country),
      archives: { customers: (TD.get('customers') || []).length, products: (TD.get('products') || []).length },
    };
  };
  const CUR_TEXT = (bag) => {
    const keys = Object.keys(bag || {});
    return keys.length ? keys.sort().map((c) => E(c) + ' ' + TD.money(bag[c])).join('　') : '';
  };
  TD.refresh = function () {
    const orders = TD.get('orders');
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const s = TD.dashboardStats();
    set('quotes', s.monthQuotes);
    set('wonCount', s.won);
    set('quotesNote', '报价阶段 ' + s.quotes + ' 笔 · 已取消不计入');
    setHtml('wonAmount', CUR_TEXT(s.wonByCur) || '—');
    set('wonAmountNote', s.won ? '按结算币种分列 · 不跨币种相加' : '暂无已成交订单');
    setHtml('profitValue', CUR_TEXT(s.profitByCur) || '—');
    set('profitNote', s.won
      ? (s.covered + ' / ' + s.won + ' 笔已录成本' + (s.marginByCur.length
          ? ' · 毛利率 ' + s.marginByCur.map(([c, v]) => E(c) + ' ' + v.toFixed(1) + '%').join('　')
          : ''))
      : '订单成交并录入内部成本后自动计算');
    const insights = document.getElementById('insightGrid');
    if (insights) {
      const rank = (rows) => rows.length
        ? rows.map((r) => '<div class="rankrow"><span>' + E(r.name) + '</span><span class="rankval">' +
            (CUR_TEXT(r.byCur) || '—') + '<small>' + r.count + ' 笔</small></span></div>').join('')
        : '<div class="sub">暂无订单数据</div>';
      insights.innerHTML =
        '<div class="insight"><span>报价转化率</span><b>' + s.conversionRate.toFixed(1) + '%</b><small>' + s.won + ' / ' + s.live + ' 笔已成交（不含已取消）</small></div>' +
        '<div class="insight"><span>待客户回复</span><b>' + s.pending + '</b><small>已发出报价、等待回复</small></div>' +
        '<div class="insight"><span>在报金额（未成交）</span><b class="multivalue">' + (CUR_TEXT(s.quotedByCur) || '—') + '</b><small>按结算币种分列，不计入成交</small></div>' +
        '<div class="insight wide"><span>客户贡献（按币种分列）</span><div class="ranklist">' + rank(s.customers) + '</div></div>' +
        '<div class="insight wide"><span>国家 / 地区分布（按币种分列）</span><div class="ranklist">' + rank(s.countries) + '</div></div>' +
        '<div class="insight"><span>成本与毛利覆盖</span><b>' + s.covered + ' / ' + s.won + '</b><small>已成交订单中已录内部成本的笔数</small>' +
        '<button class="btn link" onclick="TD.setActiveNav(\'profit\')">录入 / 查看利润分析 →</button></div>';
    }
    const query = String(document.getElementById('orderSearch')?.value || '').trim().toLowerCase();
    const visible = orders.filter((o) => !query || [o.no, o.buyer, o.po, o.country,
      ...(o.lines || []).flatMap((l) => [l.name, l.model, l.material])].join(' ').toLowerCase().includes(query));
    const rows = document.getElementById('rows');
    if (rows) {
      rows.innerHTML = visible.slice(-8).reverse().map((o) => '<tr><td><b>' + E(o.no) + '</b></td><td>' + E(o.buyer) +
        '</td><td>' + E(o.date || '') + '</td><td>' + E(o.currency) + ' ' + TD.money(o.total) + '</td>' +
        '<td><span class="status">' + E(o.state || '报价中') + '</span></td>' +
        '<td><div class="actions">' +
        '<select data-doc-for="' + E(o.id) + '" style="width:auto;min-width:150px">' +
        TD.DOC_KINDS.map((k) => '<option>' + E(k) + '</option>').join('') + '</select>' +
        '<button class="btn" data-action="preview" data-id="' + E(o.id) + '">预览单证</button>' +
        '<button class="btn" data-action="edit" data-id="' + E(o.id) + '">修改</button>' +
        '<button class="btn" data-action="copy" data-id="' + E(o.id) + '">复制</button>' +
        '<button class="btn danger" data-action="delete" data-id="' + E(o.id) + '">删除</button>' +
        '</div></td></tr>').join('');
      if (!rows.dataset.bound) {
        rows.addEventListener('click', (event) => {
          const button = event.target.closest('[data-action]');
          if (!button) return;
          const id = button.dataset.id;
          if (button.dataset.action === 'preview') {
            const select = button.closest('tr').querySelector('[data-doc-for]');
            TD.preview(id, select ? select.value : 'Quotation');
          } else if (button.dataset.action === 'edit') TD.edit(id);
          else if (button.dataset.action === 'copy') TD.duplicateOrder(id);
          else if (button.dataset.action === 'delete') TD.deleteOrder(id);
        });
        rows.dataset.bound = '1';
      }
    }
    const empty = document.getElementById('empty');
    if (empty) {
      empty.style.display = visible.length ? 'none' : 'block';
      empty.textContent = query ? '没有匹配订单。' : (orders.length ? '暂无可显示订单。' : '还没有订单，创建第一笔报价开始使用。');
    }
    const checks = document.getElementById('dashboardChecks');
    if (checks) {
      const entities = TD.contractEntities().length, accounts = TD.accounts().length;
      const unverified = TD.accounts().filter((a) => a.status !== 'active' || a.verified === false).length;
      checks.innerHTML = '<b>本机状态</b><br>出单主体：' + entities + ' 个（固定）　收款账户：' + accounts +
        ' 个　待核对账户：' + unverified + ' 个<br>品牌合规扫描：' + (TD.appSettings().brandCheckEnabled ? '已启用' : '<span class="badge bad">已关闭</span>') +
        '<br>参考币种：仅用于展示，不改变结算金额。内部成本与利润不会写入客户单证。';
    }
  };

  // ------------------------------------------------------------- nav / views
  TD.setActiveNav = function (view) {
    view = view || 'dashboard';
    TD._activeView = view;
    document.querySelectorAll('.nav').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
    const meta = VIEW_META[view] || [view, ''];
    document.getElementById('pageTitle').textContent = meta[0];
    document.getElementById('pageSubtitle').textContent = meta[1];
    document.getElementById('dashboard').hidden = view !== 'dashboard';
    const panel = document.getElementById('view');
    panel.hidden = view === 'dashboard';
    if (view !== 'dashboard') TD.renderView(view);
  };
  TD.renderActiveView = function () {
    if (TD._activeView !== 'dashboard') TD.renderView(TD._activeView);
  };

  function viewHead(title, buttons) {
    return '<div class="panelhead"><h2>' + E(title) + '</h2><div class="actions">' + (buttons || '') + '</div></div>';
  }

  TD.renderView = function (view) {
    const panel = document.getElementById('view');
    const renderers = {
      orders: renderOrders, studio: TD.studioHtml, customers: () => renderMaster('customers'),
      products: () => renderMaster('products'), packing: renderPacking,
      accounts: renderAccounts, entities: renderEntities, rates: renderRates,
      profit: renderProfit, history: renderHistory, settings: renderSettings,
      about: renderAbout,
    };
    panel.innerHTML = (renderers[view] || (() => '<p class="sub">未知页面。</p>'))();
    const binders = { orders: bindOrders, studio: TD.bindStudio, customers: () => bindMaster('customers'),
      products: () => bindMaster('products'), packing: bindPacking, rates: bindRates,
      profit: bindProfit, history: bindHistory, settings: bindSettings };
    if (binders[view]) binders[view]();
  };

  // ---- orders ----
  function renderOrders() {
    const orders = TD.get('orders');
    return viewHead('订单历史与进度', '<button class="btn" data-cmd="trash">回收站</button><button class="btn primary" data-cmd="new">＋ 新建订单</button>') +
      '<p class="sub">阶段变更会写入本机数据库并保留修改前快照。单证一律从已保存的订单快照生成。</p>' +
      '<input id="archiveSearch" placeholder="搜索订单号、客户、PO、国家或产品型号" style="max-width:420px">' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>订单号 / 日期</th><th>客户 / PO</th><th>产品</th><th>金额</th><th>阶段</th><th>操作</th></tr></thead><tbody id="archiveRows"></tbody></table></div>';
  }
  function bindOrders() {
    const panel = document.getElementById('view');
    const search = document.getElementById('archiveSearch');
    const body = document.getElementById('archiveRows');
    const render = () => {
      const q = String(search.value || '').trim().toLowerCase();
      const rows = TD.get('orders').slice().reverse().filter((o) => [o.no, o.buyer, o.po, o.country,
        ...(o.lines || []).flatMap((l) => [l.name, l.model, l.material, l.specification])].join(' ').toLowerCase().includes(q));
      body.innerHTML = rows.map((o) => '<tr><td><b>' + E(o.no) + '</b><br><span class="sub">' + E(o.date || '') + '</span></td>' +
        '<td>' + E(o.buyer) + '<br><span class="sub">PO: ' + E(o.po || '—') + '</span></td>' +
        '<td>' + (o.lines || []).map((l) => E(l.name) + (l.model ? ' · ' + E(l.model) : '')).join('<br>') + '</td>' +
        '<td>' + E(o.currency) + ' ' + TD.money(o.total) + '</td>' +
        '<td><select data-stage="' + E(o.id) + '">' + TD.options(TD.STAGES, o.state || '报价中') + '</select></td>' +
        '<td><div class="actions"><select data-doc="' + E(o.id) + '" style="width:auto;min-width:140px">' +
        TD.DOC_KINDS.map((k) => '<option>' + E(k) + '</option>').join('') + '</select>' +
        '<button class="btn" data-action="preview" data-id="' + E(o.id) + '">预览</button>' +
        '<button class="btn" data-action="studio" data-id="' + E(o.id) + '">单证中心</button>' +
        '<button class="btn" data-action="edit" data-id="' + E(o.id) + '">修改</button>' +
        '<button class="btn" data-action="copy" data-id="' + E(o.id) + '">复制</button>' +
        '<button class="btn" data-action="history" data-id="' + E(o.id) + '">变更记录</button>' +
        '<button class="btn danger" data-action="delete" data-id="' + E(o.id) + '">删除</button></div></td></tr>').join('') ||
        '<tr><td colspan="6" class="sub">暂无匹配订单。</td></tr>';
    };
    search.addEventListener('input', render);
    body.addEventListener('change', (event) => {
      if (event.target.matches('[data-stage]')) TD.setOrderStage(event.target.dataset.stage, event.target.value);
    });
    body.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const id = button.dataset.id, action = button.dataset.action;
      const doc = button.closest('tr').querySelector('[data-doc]')?.value || 'Quotation';
      if (action === 'preview') TD.preview(id, doc);
      else if (action === 'bundle') TD.previewBundle(id, TD.DOC_KINDS);
      else if (action === 'studio') TD.openStudioFor(id);
      else if (action === 'edit') TD.edit(id);
      else if (action === 'copy') TD.duplicateOrder(id);
      else if (action === 'history') TD.showOrderRevisions(id);
      else if (action === 'delete') TD.deleteOrder(id);
    });
    panel.querySelector('.panelhead').addEventListener('click', (event) => {
      const cmd = event.target.closest('[data-cmd]')?.dataset.cmd;
      if (cmd === 'new') TD.openModal();
      if (cmd === 'trash') TD.showOrderTrash();
    });
    render();
  }

  function bindPacking() {
    const table = document.querySelector('#view .table');
    table.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'edit') TD.edit(button.dataset.id);
      if (button.dataset.action === 'pl') TD.preview(button.dataset.id, 'Packing List');
    });
    const head = document.querySelector('#view .panelhead');
    head.addEventListener('click', (event) => {
      if (event.target.closest('[data-cmd="new"]')) TD.openModal();
    });
  }

  // ---- master data ----
  function renderMaster(kind) {
    const label = kind === 'customers' ? '客户' : '产品';
    return viewHead(label + '档案', '<button class="btn" data-cmd="trash">回收站</button><button class="btn primary" data-cmd="new">＋ 新增' + label + '</button>') +
      '<div class="actions" style="margin-bottom:12px"><button class="btn" data-cmd="export">导出 ' + label + ' XLSX / CSV</button>' +
      '<button class="btn" data-cmd="template">下载导入模板 CSV</button>' +
      '<label class="btn">导入 Excel / CSV<input id="importFile" type="file" accept=".csv,.xlsx,text/csv" hidden></label>' +
      '<input id="masterSearch" style="max-width:340px" placeholder="搜索' + label + '名称、联系人、型号或规格"></div>' +
      '<div id="masterRecords">' + TD.renderRecords(kind) + '</div>';
  }
  function bindMaster(kind) {
    const panel = document.getElementById('view');
    const search = document.getElementById('masterSearch');
    const records = document.getElementById('masterRecords');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      records.querySelectorAll('.record').forEach((row) => {
        row.hidden = !!q && !row.textContent.toLowerCase().includes(q);
        if (!row.hidden) shown++;
      });
      let note = records.querySelector('[data-no-results]');
      if (!note) { note = document.createElement('p'); note.dataset.noResults = '1'; note.className = 'sub'; records.appendChild(note); }
      note.textContent = q && !shown ? '没有匹配的档案。' : '';
    });
    panel.querySelector('.panelhead').addEventListener('click', (event) => {
      const cmd = event.target.closest('[data-cmd]')?.dataset.cmd;
      if (cmd === 'new') TD.manage(kind);
      if (cmd === 'trash') TD.showMasterTrash(kind);
    });
    panel.querySelector('[data-cmd="export"]').addEventListener('click', () => TD.exportMasterCsv(kind));
    panel.querySelector('[data-cmd="template"]').addEventListener('click', () => TD.downloadImportTemplate(kind));
    document.getElementById('importFile').addEventListener('change', (event) => TD.importMasterCsv(event, kind));
  }

  // ---- packing ----
  function renderPacking() {
    const rows = TD.get('orders').slice().reverse().map((o) => {
      const report = TD.packingReport(o);
      const t = report.parsed.totals;
      const expected = report.parsed.orderQty;
      const diffs = report.parsed.perModel.filter((r) => r.diff !== 0).length;
      const state = !t.boxes ? '未录入' : (diffs || t.pendingGross || t.pendingCbm) ? '待核对' :
        (o.packingConfirmed ? '数量一致' : '草案未确认');
      return '<tr><td><b>' + E(o.no) + '</b><br><span class="sub">' + E(o.date || '') + '</span></td>' +
        '<td>' + E(o.buyer) + '</td><td><span class="status ' + (state === '数量一致' ? 'ok' : state === '待核对' ? 'bad' : '') + '">' + state + '</span></td>' +
        '<td>' + t.boxes + '</td><td>' + t.qty + ' / ' + expected + '</td><td>' + (t.pendingGross ? '<span class="badge bad">' + t.pendingGross + ' 箱待核对</span> ' : '') + TD.money(t.gross) + '</td>' +
        '<td>' + TD.money(t.net) + '</td><td>' + (t.pendingCbm ? '<span class="badge bad">待核对</span> ' : '') + t.cbm.toFixed(3) + '</td>' +
        '<td>' + (diffs ? '<span class="badge bad">' + diffs + ' 个型号有差异</span>' : '<span class="badge ok">逐型号一致</span>') + '</td>' +
        '<td><div class="actions"><button class="btn" data-action="edit" data-id="' + E(o.id) + '">编辑装箱</button>' +
        '<button class="btn" data-action="pl" data-id="' + E(o.id) + '">预览 PL</button></div></td></tr>';
    }).join('') || '<tr><td colspan="10" class="sub">还没有订单。</td></tr>';
    return viewHead('订单装箱台账', '<button class="btn primary" data-cmd="new">＋ 新建订单</button>') +
      '<p class="sub">箱体积按箱号只累计一次；同箱出现不同毛重/箱规会标为待核对，不会静默取一个看似准确的值。</p>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>订单</th><th>客户</th><th>状态</th><th>箱数</th><th>数量</th><th>毛重 kg</th><th>净重 kg</th><th>体积 m³</th><th>逐型号</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // ---- accounts / entities ----
  function renderAccounts() {
    const accounts = TD.accounts();
    const entities = TD.entities();
    const contractId = (TD.contractEntity() || {}).id;
    const cards = accounts.map((a) => {
      const status = ['legacy_only', 'payment_only'].includes(a.status) ? '<span class="badge ok">收款专用</span>'
        : a.status === 'unverified' ? '<span class="badge warn">待核对</span>' : '<span class="badge ok">可用</span>';
      // A collection account whose payee differs from the contracting entity
      // has its own company archive (name, tax no., addresses). It is kept
      // here, never used as a document header or signatory.
      const payee = a.entityId && a.entityId !== contractId
        ? entities.find((e) => e.id === a.entityId) : null;
      const payeeBlock = payee ? '<div class="account-detail" style="margin-top:6px"><b>收款主体档案（仅收款，不作单证主体）：</b> ' +
        E(payee.legalNameCn || payee.legalNameEn || '') + ' / ' + E(payee.legalNameEn || '') + '<br>' +
        (payee.taxNo ? '<b>税号 / Tax No.:</b> ' + E(payee.taxNo) + '<br>' : '') +
        (payee.addressCn ? '<b>中文地址:</b> ' + E(payee.addressCn) + '<br>' : '') +
        (payee.addressEn ? '<b>English Address:</b> ' + E(payee.addressEn) + '<br>' : '') +
        '<b>核定:</b> ' + (payee.verified === false ? '待核对' : '已核定') + '</div>' : '';
      return '<article class="account-card"><b>' + E(a.currency) + ' · ' + E(a.beneficiary) + '</b> ' + status +
        ' <span class="tagline">版本 ' + E(a.version || '—') + ' · 来源 ' + E(a.source || '用户录入') + '</span>' +
        '<div class="account-detail"><b>账号 / Account No.:</b> ' + E(a.account_no) + '<br>' +
        '<b>开户银行 / Bank:</b> ' + E(a.bank) + (a.bank_cn ? ' / ' + E(a.bank_cn) : '') + '<br>' +
        '<b>银行地址 / Bank Address:</b> ' + E(a.bank_address || '—') + '<br>' +
        '<b>SWIFT / BIC:</b> ' + E(a.swift || '—') + (a.swift_note ? '（' + E(a.swift_note) + '）' : '') + '<br>' +
        '<b>收款人地址:</b> ' + E(a.beneficiary_address || '—') + '<br>' +
        (a.applicable ? '<b>适用范围:</b> ' + E(a.applicable) + '<br>' : '') +
        (a.note ? '<b class="warn">备注:</b> ' + E(a.note) + '<br>' : '') +
        '<b>披露规则:</b> 仅在客户确认订单、进入付款环节后提供；Quotation 与 PL 不显示。</div>' +
        payeeBlock +
        '<div class="actions" style="margin-top:10px"><button class="btn" onclick="TD.manageAccount(\'' + E(a.id) + '\')">编辑（需二次确认）</button>' +
        (payee ? ' <button class="btn" onclick="TD.manageEntity(\'' + E(payee.id) + '\')">编辑收款主体档案</button>' : '') +
        '</div></article>';
    }).join('') || '<p class="sub">没有账户资料，请通过启动器打开本地版。</p>';
    return viewHead('收款账户资料') +
      '<div class="notice"><b>披露与反欺诈规则（手册 5.3）</b><ul>' +
      '<li>仅在客户确认订单、进入正式付款环节后方可提供完整账户；首次询盘与报价阶段不得主动发送。</li>' +
      '<li>严禁向客户提供私人账户；账户变更以加盖公章的书面通知并经电话核实后生效，警惕冒充我方名义的账户变更邮件。</li>' +
      '<li>收款人名称中的括号、“Co.,Ltd”及空格请勿省略或改写，名称与账号不符将导致退汇。</li>' +
      '<li>其他币种需另取对应账户信息，不得套用现有账户。</li>' +
      '<li><b>主体与收款分离：</b>所有单证统一由【出单主体】中登记的公司出具与签署；收款账户的户名与出单主体不同属于正常收款安排，不作为第二主体，也不出现在单证抬头或签字处。</li>' +
      '<li><b>空白模板提示：</b>本版本出厂不含任何真实账户资料，请录入并核对贵公司账户后再对外发送 PI。</li></ul></div>' + cards;
  }
  function renderEntities() {
    // Only the contracting entity is shown. A payee name on a collection
    // account is not a seller entity and must not be listed here.
    const entities = TD.contractEntities();
    const cards = entities.map((e) => {
      const warnings = TD.entityWarnings({ entity: e.id });
      return '<article class="account-card"><b>' + E(e.legalNameEn) + '</b> ' +
        (e.verified === false ? '<span class="badge warn">待核对</span>' : '<span class="badge ok">已核定</span>') +
        '<div class="account-detail">中文名：' + E(e.legalNameCn || '—') + '<br>对外品牌：' + E(e.brandDisplay || '—') + ' / ' + E(e.brandDisplayCn || '—') + '<br>' +
        '英文地址：' + E(e.addressEn || '—') + '<br>联系人：' + E(e.contact || '—') + '　邮箱：' + E(e.email || '—') + '<br>' +
        '电话：' + E(e.phone || '—') + '　WhatsApp：' + E(e.whatsapp || '—') + '　官网：' + E(e.website || '—') + '<br>' +
        'Logo：' + E(e.logo || '未配置（不显示其它主体 Logo）') + '<br>' +
        '信用代码：' + E(e.creditCode || '未登记（如需在单证显示，请核定后填写）') + '</div>' +
        (warnings.length ? '<div class="notice" style="margin-top:10px"><ul>' + warnings.map((w) => '<li>' + E(w) + '</li>').join('') + '</ul></div>' : '') +
        '<div class="actions" style="margin-top:10px"><button class="btn" onclick="TD.manageEntity(\'' + E(e.id) + '\')">编辑主体资料</button></div></article>';
    }).join('') || '<p class="sub">没有主体资料，请通过启动器打开本地版。</p>';
    return viewHead('出单主体资料') +
      '<div class="notice info"><b>唯一出单主体：</b>报价、PI、合同、商业发票、装箱单、唛头及报关通关资料全部由本主体出具与签署，无需在订单中选择，也不会随收款账户改变。收款账户在【收款账户】页独立维护，其户名仅用于汇款，不构成第二个出单主体。资料来自本机 SQLite，首次由 <code>seller-config.json</code> 播种；之后所有修改以本机数据库为准。</div>' + cards;
  }

  // ---- rates / profit ----
  function fxRows() { return TD.get('settings').filter((r) => r.kind === 'fx-rate'); }
  function renderRates() {
    const rows = fxRows().slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return viewHead('手动汇率台账') +
      '<p class="sub">离线录入参考汇率；订单的结算币种与金额不会因此改变。</p>' +
      '<form id="fxForm" class="form" style="max-width:760px;margin:14px 0">' +
      '<label>基准币种<select name="base">' + TD.options(TD.CURRENCIES) + '</select></label>' +
      '<label>参考币种<select name="quote">' + TD.options(TD.CURRENCIES, 'EUR') + '</select></label>' +
      '<label>汇率<input name="rate" type="number" min="0.00000001" step="any" required></label>' +
      '<label>录入日期<input name="date" type="date" required></label>' +
      '<label class="full">备注<input name="note" placeholder="来源或用途（可选）"></label>' +
      '<div class="full"><button class="btn primary" type="submit">保存汇率</button></div></form>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>币种对</th><th>汇率</th><th>日期</th><th>备注</th><th>操作</th></tr></thead><tbody>' +
      (rows.map((r) => '<tr><td>1 ' + E(r.base) + ' = ' + E(r.quote) + '</td><td>' + E(r.rate) + '</td><td>' + E(r.date || '') + '</td><td>' + E(r.note || '') +
        '</td><td><button class="btn danger" data-delete="' + E(r.id) + '">删除</button></td></tr>').join('') || '<tr><td colspan="5" class="sub">还没有汇率记录。</td></tr>') + '</tbody></table></div>';
  }
  function bindRates() {
    const form = document.getElementById('fxForm');
    form.elements.date.value = TD.today();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const base = form.elements.base.value, quote = form.elements.quote.value, rate = Number(form.elements.rate.value);
      if (base === quote || !(rate > 0)) { TD.alert('请选择不同币种并填写大于零的汇率。'); return; }
      const id = 'fx:' + base + ':' + quote;
      const record = { id, kind: 'fx-rate', base, quote, rate, date: form.elements.date.value,
        note: form.elements.note.value.trim() };
      TD.set('settings', [...TD.get('settings').filter((r) => r.id !== id), record]);
      TD.renderActiveView();
    });
    document.querySelector('#view .table').addEventListener('click', (event) => {
      const id = event.target.closest('[data-delete]')?.dataset.delete;
      if (!id) return;
      TD.set('settings', TD.get('settings').filter((r) => r.id !== id));
      TD.renderActiveView();
    });
  }
  const COST_FIELDS = [['productCost', '产品采购成本'], ['inlandFreight', '国内运输费'],
    ['internationalFreight', '国际运输费'], ['customs', '报关费用'], ['other', '其他费用']];
  function costFor(id) { return TD.get('settings').find((r) => r.kind === 'order-cost' && r.orderId === id) || {}; }
  function renderProfit() {
    const rows = TD.get('orders').slice().reverse().map((o) => {
      const cost = costFor(o.id);
      const total = COST_FIELDS.reduce((s, [k]) => s + TD.num(cost[k]), 0);
      const profit = TD.num(o.total) - total;
      return '<tr><td><b>' + E(o.no) + '</b><br>' + E(o.buyer) + '</td><td>' + E(o.currency) + ' ' + TD.money(o.total) + '</td>' +
        '<td>' + (cost.id ? E(o.currency) + ' ' + TD.money(total) : '未录入') + '</td>' +
        '<td>' + (cost.id ? E(o.currency) + ' ' + TD.money(profit) : '—') + '</td>' +
        '<td>' + (cost.id ? (TD.num(o.total) > 0 ? (profit / TD.num(o.total) * 100).toFixed(1) + '%' : '—') : '—') + '</td>' +
        '<td><button class="btn" data-cost="' + E(o.id) + '">' + (cost.id ? '修改成本' : '录入成本') + '</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="sub">暂无订单。</td></tr>';
    return viewHead('订单利润分析') +
      '<div class="notice info">成本数据只保存在内部设置中，不会出现在任何客户单证；单证生成前会扫描内部字样并阻断。</div>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>订单 / 客户</th><th>销售额</th><th>成本合计</th><th>毛利润</th><th>毛利率</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function bindProfit() {
    document.querySelector('#view .table').addEventListener('click', (event) => {
      const id = event.target.closest('[data-cost]')?.dataset.cost;
      if (!id) return;
      const order = TD.get('orders').find((o) => o.id === id);
      if (!order) return;
      const existing = costFor(id);
      const host = document.getElementById('modalHost');
      host.innerHTML = '<div class="overlay" id="costModal" style="display:flex;z-index:45"><div class="modal">' +
        '<div class="panelhead"><h2>内部成本 · ' + E(order.no) + '</h2><button class="btn" data-close>关闭</button></div>' +
        '<p class="sub">币种 ' + E(order.currency) + '。仅供内部核算，不写入客户单证。</p>' +
        '<form id="costForm" class="form">' + COST_FIELDS.map(([k, label]) =>
          '<label>' + E(label) + ' (' + E(order.currency) + ')<input name="' + k + '" type="number" min="0" step="0.01" value="' + E(existing[k] ?? '') + '"></label>').join('') +
        '</form><div class="modalfoot"><button class="btn" data-close>取消</button><button class="btn primary" id="costSave">保存内部成本</button></div></div></div>';
      const overlay = document.getElementById('costModal');
      overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-close]')) host.innerHTML = ''; });
      document.getElementById('costSave').onclick = () => {
        const form = document.getElementById('costForm');
        const record = Object.assign({}, existing, { id: 'cost:' + id, orderId: id, kind: 'order-cost',
          currency: order.currency, updatedAt: new Date().toISOString() });
        for (const [k] of COST_FIELDS) record[k] = TD.num(form.elements[k].value);
        TD.set('settings', [...TD.get('settings').filter((r) => r.id !== record.id), record]);
        host.innerHTML = ''; TD.renderActiveView();
      };
    });
  }

  // ---- history ----
  function renderHistory() {
    const revisions = TD.get('settings').filter((r) => r.kind === 'order-revision')
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const edits = TD.get('settings').filter((r) => r.kind === 'account-edit')
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return viewHead('历史记录', '<button class="btn" data-cmd="trash">订单回收站</button>') +
      '<h3>订单修改快照</h3><div class="tablewrap"><table class="table"><thead><tr><th>时间</th><th>订单</th><th>修改前金额</th><th>阶段</th><th>操作</th></tr></thead><tbody>' +
      (revisions.map((r) => '<tr><td>' + E(String(r.at || '').replace('T', ' ').slice(0, 19)) + '</td><td>' + E(r.orderNo || '—') +
        '</td><td>' + E(r.snapshot?.currency || '') + ' ' + TD.money(r.snapshot?.total) + '</td><td>' + E(r.snapshot?.state || '—') +
        '</td><td>' + (r.orderId ? '<button class="btn" data-revisions="' + E(r.orderId) + '">查看该订单</button>' : '') + '</td></tr>').join('') ||
        '<tr><td colspan="5" class="sub">暂无修改快照。</td></tr>') + '</tbody></table></div>' +
      '<h3 style="margin-top:20px">账户资料修改审计</h3><div class="tablewrap"><table class="table"><thead><tr><th>时间</th><th>账户 ID</th><th>修改前账号</th><th>修改后账号</th></tr></thead><tbody>' +
      (edits.map((r) => '<tr><td>' + E(String(r.at || '').replace('T', ' ').slice(0, 19)) + '</td><td>' + E(r.accountId) + '</td><td>' + E(r.accountNoBefore) + '</td><td>' + E(r.accountNoAfter) + '</td></tr>').join('') ||
        '<tr><td colspan="4" class="sub">暂无账户修改记录。</td></tr>') + '</tbody></table></div>' +
      '<h3 style="margin-top:20px">永久单据存档（开过的单据留痕）</h3>' +
      '<p class="sub">在「单证中心」点击「存入历史记录」即可把整套单据快照留档，可随时回溯预览或恢复为可编辑订单。</p>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>存档时间</th><th>订单号</th><th>客户</th><th>金额</th><th>包含单证</th><th>操作</th></tr></thead><tbody>' +
      ((TD.archives ? TD.archives() : []).map((a) => '<tr><td>' + E(String(a.at || '').replace('T', ' ').slice(0, 19)) + '</td><td><b>' + E(a.orderNo || '—') +
        '</b></td><td>' + E(a.buyer || '—') + '</td><td>' + E(a.currency || '') + ' ' + TD.money(a.total) + '</td><td>' + E((a.docs || []).length) + ' 份</td>' +
        '<td><div class="actions"><button class="btn" data-archive-preview="' + E(a.id) + '">回溯预览</button>' +
        '<button class="btn" data-archive-restore="' + E(a.id) + '">恢复为订单</button></div></td></tr>').join('') ||
        '<tr><td colspan="6" class="sub">还没有单据存档。</td></tr>') + '</tbody></table></div>';
  }
  function bindHistory() {
    TD.bindViewClick((event) => {
      const trash = event.target.closest('[data-cmd="trash"]');
      if (trash) { TD.showOrderTrash(); return; }
      const revisions = event.target.closest('[data-revisions]');
      if (revisions) { TD.showOrderRevisions(revisions.dataset.revisions); return; }
      const preview = event.target.closest('[data-archive-preview]');
      if (preview) { TD.previewArchive(preview.dataset.archivePreview); return; }
      const restore = event.target.closest('[data-archive-restore]');
      if (restore) TD.restoreArchive(restore.dataset.archiveRestore);
    });
  }

  TD.showOrderTrash = function () {
    const items = TD.get('settings').filter((s) => s.kind === 'deleted-order')
      .sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="orderTrash" style="display:flex;z-index:45"><div class="modal">' +
      '<div class="panelhead"><h2>订单回收站</h2><button class="btn" data-close>关闭</button></div>' +
      (items.map((s) => '<article class="record"><b>' + E(s.order?.no || '—') + '</b><span>' + E(s.order?.buyer || '—') + ' · ' +
        E(s.order?.currency || '') + ' ' + TD.money(s.order?.total) + '</span><span class="tagline">' + E(String(s.deletedAt || '').slice(0, 10)) +
        '</span><button class="btn" data-restore="' + E(s.id) + '">恢复订单</button></article>').join('') || '<p class="sub">回收站为空。</p>') + '</div></div>';
    const overlay = document.getElementById('orderTrash');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) { host.innerHTML = ''; return; }
      const id = event.target.closest('[data-restore]')?.dataset.restore;
      if (!id) return;
      const settings = TD.get('settings');
      const item = settings.find((s) => s.id === id);
      if (!item?.order) return;
      const rows = TD.get('orders');
      if (rows.some((o) => o.id === item.order.id || o.no === item.order.no)) { TD.alert('已有相同订单号，请先处理重号。'); return; }
      TD.set('orders', [...rows, item.order]);
      TD.set('settings', settings.filter((s) => s.id !== id));
      host.innerHTML = ''; TD.refresh(); TD.renderActiveView();
    });
  };
  TD.showOrderRevisions = function (id) {
    const order = TD.get('orders').find((o) => o.id === id);
    if (!order) return;
    const revisions = TD.get('settings').filter((s) => s.kind === 'order-revision' && s.orderId === id)
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="revModal" style="display:flex;z-index:45"><div class="modal">' +
      '<div class="panelhead"><h2>' + E(order.no) + ' · 修改历史</h2><button class="btn" data-close>关闭</button></div>' +
      (revisions.map((r, i) => '<article class="card" style="margin:9px 0"><b>版本 ' + (revisions.length - i) + '</b>' +
        '<div class="sub">修改前快照 · ' + E(String(r.at || '').replace('T', ' ').slice(0, 19)) + '</div>' +
        '<p>阶段 ' + E(r.snapshot?.state || '') + '　金额 ' + E(r.snapshot?.currency || '') + ' ' + TD.money(r.snapshot?.total) + '</p><ul>' +
        (r.snapshot?.lines || []).map((l) => '<li>' + E(l.name) + ' · ' + E(l.model) + ' · ' + E(l.qty) + ' ' + E(l.unit) + ' @ ' + E(l.price) + '</li>').join('') + '</ul></article>').join('') ||
        '<p class="sub">暂无修改前快照。</p>') + '</div></div>';
    const overlay = document.getElementById('revModal');
    overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-close]')) host.innerHTML = ''; });
  };


  // ---- help & support (v1.1) ----
  function renderAbout() {
    return viewHead('帮助与支持') +
      '<div class="notice info">本软件为本机离线单用户工具，不联网、不上传、不含任何远程接口。' +
      '全部数据保存在当前文件夹的 <code>tradedocs.sqlite3</code>。</div>' +
      '<div class="split"><div>' +
      '<h3 class="section-title">快速上手</h3>' +
      '<ol class="about-list">' +
      '<li><b>出单主体</b>：录入贵公司英文法定名称、英文地址、联系方式；所有单证抬头、签字方由此决定。</li>' +
      '<li><b>收款账户</b>：按币种建档，填写账号、开户行、SWIFT 并标记已核定。可设置「订单确认后才显示」。</li>' +
      '<li><b>客户与产品</b>：可先建档，也可在开单时直接填写；产品支持 HS 编码、包装数据与图片。</li>' +
      '<li><b>新建订单</b>：按 ① 客户与单据 ② 产品与金额 ③ 条款与收款 ④ 唛头与装箱 ⑤ 备注与显示项 五步填写。</li>' +
      '<li><b>单证中心</b>：卡片墙逐张预览 Quotation / Proforma Invoice / Sales Contract / ' +
      'Commercial Invoice / Packing List，每张可单独打印或下载。</li>' +
      '<li><b>备份</b>：系统自动在 <code>backups/</code> 生成快照；换电脑时先按 Ctrl+C 停服务，再复制整个文件夹。</li>' +
      '</ol>' +
      '<h3 class="section-title" style="margin-top:16px">打印提示</h3>' +
      '<p class="sub">在浏览器打印对话框选择「另存为 PDF」并勾选「背景图形」，否则配色会丢失。' +
      '页眉页脚（about:blank / 日期 / 页码）由 A4 零页边距样式自动抑制。</p>' +
      '</div><div>' +
      '<h3 class="section-title">系统边界（本程序不做的事）</h3>' +
      '<ul class="about-list">' +
      '<li>不生成货代订舱委托（Booking）、ISF / AMS、报关单、原产地证、COA、提单、电放、进仓单等由货代／海关／第三方出具的文件。</li>' +
      '<li>不联网查汇率、不自动抓取客户资信、不发送邮件。</li>' +
      '<li>不替您推断 HS 编码、重量、体积或箱数：这些须由工厂实测或报关行确认后录入；缺实测数据 Packing List 会被拦截。</li>' +
      '<li>不提供多人协同、云端同步或数据库加密。</li>' +
      '</ul>' +
      '<h3 class="section-title" style="margin-top:16px">常见问题</h3>' +
      '<ul class="about-list">' +
      '<li><b>双击没反应？</b>确认整个文件夹完整解压；在地址栏输入 <code>cmd</code> 后运行启动器看报错。</li>' +
      '<li><b>提示缺少出单主体？</b>补齐英文法定名称与英文地址。</li>' +
      '<li><b>数据会丢吗？</b>SQLite 是唯一数据源，清浏览器缓存、换浏览器、换电脑都不会丢；请定期复制整个文件夹另存。</li>' +
      '<li><b>Logo 怎么换？</b>在【公司与系统设置】的「品牌 Logo」中上传，侧栏与全部单证页眉同步生效。</li>' +
      '</ul>' +
      '<h3 class="section-title" style="margin-top:16px">版本与许可</h3>' +
      '<p class="sub">TradeDocs Pro v3.0.0 · 开源分享版 v1.0<br>' +
      '分享者：唐先生（Downey）· 拓珀新材料 Topo New Material<br>' +
      '本版本<b>源码公开、可免费自用</b>：可查看、修改、给自己公司用、无偿转给同行；' +
      '禁止拿软件本身去售卖、收费分发或对外提供收费出单服务。' +
      '企业自用不算商业化。完整条款见根目录 <code>LICENSE</code>。</p>' +
      '<p class="sub">问题与建议请到项目仓库提 Issue；本版本不提供付费技术支持。</p>' +
      '</div></div>';
  }

  // ---- settings ----
  function renderSettings() {
    const cfg = TD.appSettings();
    return viewHead('公司与本机数据') +
      '<div class="notice info">业务数据保存在当前文件夹的 <code>tradedocs.sqlite3</code>，自动快照在 <code>backups/</code>，产品图片在 <code>product-images/</code>。应用只监听 127.0.0.1，不联网、不上传。</div>' +
      '<div class="actions" style="flex-wrap:wrap;margin:12px 0">' +
      '<button class="btn" data-cmd="export-json">导出业务数据 JSON（不含账户）</button>' +
      '<button class="btn" data-cmd="export-full">导出完整备份（含账户，注意保管）</button>' +
      '<button class="btn" data-cmd="restore-json">恢复 JSON 备份</button>' +
      '<button class="btn" data-cmd="restore-snapshot">恢复 SQLite 快照</button>' +
      '<button class="btn" data-cmd="export-sqlite">导出 SQLite 快照</button>' +
      '<button class="btn" data-cmd="reseed">从初始化配置补齐缺失主体/账户</button></div>' +
      '<div class="split"><form id="appSettingsForm" class="form">' +
      '<h3 class="section-title">单证与默认规则</h3>' +
      '<label>单证编号模板<input name="docNumberTemplate" value="' + E(cfg.docNumberTemplate) + '"></label>' +
      '<label>默认贸易术语<select name="defaultIncoterm">' + TD.options(TD.INCOTERMS, cfg.defaultIncoterm) + '</select></label>' +
      '<label class="full">默认付款方式<input name="defaultPayment" value="' + E(cfg.defaultPayment) + '"></label>' +
      '<label>默认交期<input name="defaultLead" value="' + E(cfg.defaultLead) + '"></label>' +
      '<label>默认有效期<input name="defaultValid" value="' + E(cfg.defaultValid) + '"></label>' +
      '<label>默认预付款比例 (%)<input name="defaultDepositPct" type="number" min="0" max="100" value="' + E(cfg.defaultDepositPct) + '"></label>' +
      '<label>新建订单默认输出语言<select name="defaultLanguage">' +
      TD.options(TD.LANGUAGES.map((l) => ({ value: l.code, label: l.label })), cfg.defaultLanguage || 'en') + '</select></label>' +
      '<label>新建订单默认配色<select name="defaultTheme">' +
      TD.options(TD.THEMES.map((t) => ({ value: t.id, label: t.name })), cfg.defaultTheme || 'classicBlue') + '</select></label>' +
      '<label class="check"><input type="checkbox" name="showBankDefault"' + (cfg.showBankDefault ? ' checked' : '') + '> 新建订单默认勾选显示收款账户</label>' +
      '<label class="check"><input type="checkbox" name="showProductImagesDefault"' + (cfg.showProductImagesDefault ? ' checked' : '') + '> 新建订单默认显示产品图片</label>' +
      '<label class="check"><input type="checkbox" name="brandCheckEnabled"' + (cfg.brandCheckEnabled ? ' checked' : '') + '> 启用对外禁用词扫描（不建议关闭）</label>' +
      '<div class="full"><p class="sub">编号模板可用占位符：{kind} 单证代码、{order} 订单号去前缀、{no} 完整订单号、{po} 采购单号、{date} 日期、{year} 年份、{entity} 主体代码。</p>' +
      '<button class="btn primary" type="submit">保存设置</button></div></form>' +
      '<div><div id="brandLogoHost"></div>' +
      '<h3 class="section-title" style="margin-top:16px">演示数据</h3>' +
      '<p class="sub">出厂为空库。可载入一笔完全虚构、明确标注 DEMO 的示例订单，' +
        '用来熟悉五类单证与工作台；正式使用前一键清除。</p>' +
      '<div class="actions" style="flex-wrap:wrap;gap:8px;margin:10px 0">' +
        '<button class="btn" type="button" data-cmd="demo-load">载入演示数据</button>' +
        '<button class="btn" type="button" data-cmd="demo-clear">清除演示数据</button></div>' +
      '<h3 class="section-title" style="margin-top:16px">本机状态</h3><div id="healthInfo" class="sub">读取中…</div>' +
      '<h3 class="section-title" style="margin-top:16px">自动 SQLite 快照</h3><div id="snapshotList" class="sub">读取中…</div>' +
      '<h3 class="section-title" style="margin-top:16px">隐私与系统边界</h3><p class="sub">备份与数据库包含银行与客户资料，未加密；请只保存在自己的设备或受控备份位置，不要上传公共网盘、公开代码仓库或发给无关人员。本程序为单用户本机离线工具：不提供局域网多用户、云端同步或数据库加密；官方报关单、提单、原产地证等由海关或第三方签发的文件不在本程序生成范围内。随包已带 Python 运行时，无需另装。</p></div></div>';
  }
  function bindSettings() {
    const panel = document.getElementById('view');
    panel.querySelectorAll('[data-cmd]').forEach((button) => {
      button.addEventListener('click', async () => {
        const cmd = button.dataset.cmd;
        if (cmd === 'export-json') TD.exportData();
        if (cmd === 'export-full') TD.exportFullBackup();
        if (cmd === 'restore-json') document.getElementById('backupFile').click();
        if (cmd === 'restore-snapshot') TD.restoreSnapshot();
        if (cmd === 'export-sqlite') TD.exportSqlite();
        if (cmd === 'reseed') TD.reseedConfig();
        if (cmd === 'demo-load') TD.loadDemoData();
        if (cmd === 'demo-clear') TD.clearDemoData();
      });
    });
    document.getElementById('appSettingsForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      TD.saveAppSettings({
        docNumberTemplate: form.elements.docNumberTemplate.value.trim() || 'TPNM-{kind}-{order}',
        defaultIncoterm: form.elements.defaultIncoterm.value,
        defaultPayment: form.elements.defaultPayment.value.trim(),
        defaultLead: form.elements.defaultLead.value.trim(),
        defaultValid: form.elements.defaultValid.value.trim(),
        defaultDepositPct: TD.num(form.elements.defaultDepositPct.value),
        defaultLanguage: form.elements.defaultLanguage.value,
        defaultTheme: form.elements.defaultTheme.value,
        showBankDefault: form.elements.showBankDefault.checked,
        showProductImagesDefault: form.elements.showProductImagesDefault.checked,
        brandCheckEnabled: form.elements.brandCheckEnabled.checked,
      });
      TD.alert('设置已保存到本机数据库。');
    });
    if (TD.setupBrandLogo) TD.setupBrandLogo(document.getElementById('brandLogoHost'));
    fetch('/api/health').then((r) => r.ok ? r.json() : Promise.reject()).then((h) => {
      const el = document.getElementById('healthInfo');
      if (el) el.innerHTML = '版本 ' + E(h.version) + '　端口 ' + E(h.port) + '<br>数据库 ' + E(h.database) +
        '<br>主体 ' + E(h.entities) + ' 个　账户 ' + E(h.accounts) + ' 个<br>监听 127.0.0.1（仅本机）' +
        '<br>唐先生（Downey）· 拓珀新材料 Topo New Material · 源码公开 · 免费自用';
    }).catch(() => { const el = document.getElementById('healthInfo'); if (el) el.textContent = '本地服务未连接。'; });
    fetch('/api/backups').then((r) => r.ok ? r.json() : Promise.reject()).then((items) => {
      const el = document.getElementById('snapshotList');
      if (el) { el.style.whiteSpace = 'pre-line'; el.textContent = items.length
        ? items.slice(0, 12).map((i) => i.modified + ' · ' + i.name).join('\n') : '尚无自动快照（首次写入业务数据后生成）。'; }
    }).catch(() => { const el = document.getElementById('snapshotList'); if (el) el.textContent = '无法读取快照列表。'; });
  }

  // ------------------------------------------------------------- import / export
  TD.exportOrderCsv = async function () { await downloadXlsx('orders', 'TradeDocsPro-orders.xlsx'); };
  TD.exportMasterCsv = async function (kind) { await downloadXlsx(kind, 'TradeDocsPro-' + kind + '.xlsx'); };
  async function downloadXlsx(kind, filename) {
    if (!TD.isLocalServer()) { TD.alert('表格导出需要本机服务，请通过启动器打开。'); return; }
    try {
      const response = await fetch('/api/export/xlsx/' + kind);
      if (!response.ok) throw new Error((await response.json()).error || 'HTTP ' + response.status);
      TD.downloadBlob(await response.blob(), filename);
    } catch (error) { TD.alert('导出失败：' + error.message); }
  }

  TD.importMasterCsv = async function (event, kind) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    if (!TD.isLocalServer()) { TD.alert('导入需要本机服务，请通过启动器打开。'); input.value = ''; return; }
    try {
      let response;
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        response = await fetch('/api/import/xlsx/' + kind, { method: 'POST', body: file });
      } else {
        const text = await file.text();
        const rows = TD.csvParse(text.replace(/^\uFEFF/, ''));
        response = await fetch('/api/import/rows/' + kind, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '导入失败');
      TD.set(kind, result.records || []);
      TD.refresh(); TD.renderActiveView(); TD.refreshProductDatalist();
      showImportReport(kind, result);
    } catch (error) { TD.alert('导入失败，原有数据未改动：' + error.message); }
    finally { input.value = ''; }
  };
  function showImportReport(kind, result) {
    const report = [...(result.errors || []).map((x) => ({ ...x, level: '错误' })),
      ...(result.warnings || []).map((x) => ({ ...x, level: '提醒' }))];
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="importReport" style="display:flex;z-index:45"><div class="modal">' +
      '<div class="panelhead"><h2>导入结果</h2><button class="btn" data-close>关闭</button></div>' +
      '<p class="sub">成功导入 ' + E(result.applied ?? 0) + ' 行；错误 ' + E((result.errors || []).length) +
      ' 行，提醒 ' + E((result.warnings || []).length) + ' 行。含错误的行已跳过，其余行正常写入。</p>' +
      (report.length ? '<div class="tablewrap"><table class="table"><thead><tr><th>级别</th><th>行号</th><th>字段</th><th>原值</th><th>说明</th></tr></thead><tbody>' +
        report.map((r) => '<tr><td>' + (r.level === '错误' ? '<span class="badge bad">错误</span>' : '<span class="badge warn">提醒</span>') + '</td><td>' + E(r.row) + '</td><td>' + E(r.field) + '</td><td>' + E(r.value) + '</td><td>' + E(r.message) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<p class="sub">没有错误或提醒。</p>') +
      '<div class="modalfoot"><button class="btn" data-close>关闭</button>' +
      (report.length ? '<button class="btn" id="downloadImportErrors">下载错误行报告 CSV</button>' : '') + '</div></div></div>';
    const overlay = document.getElementById('importReport');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) host.innerHTML = '';
      if (event.target.id === 'downloadImportErrors') {
        const csv = '\uFEFF' + [['级别', '行号', '字段', '原值', '说明']]
          .concat(report.map((r) => [r.level, r.row, r.field, r.value, r.message]))
          .map((row) => row.map(TD.csvCell).join(',')).join('\r\n');
        TD.downloadText(csv, 'TradeDocsPro-import-errors-' + kind + '-' + TD.today() + '.csv', 'text/csv;charset=utf-8');
      }
    });
  }

  // ------------------------------------------------------------- backup / restore
  function backupPayload(includeSensitive) {
    const data = {
      orders: TD.get('orders'), customers: TD.get('customers'),
      products: TD.get('products'), settings: TD.get('settings'),
    };
    if (includeSensitive) { data.accounts = TD.get('accounts'); data.entities = TD.get('entities'); }
    return Object.assign(data, { schemaVersion: 2, exportedAt: new Date().toISOString(),
      exportSource: 'sqlite-cache', includesSensitiveData: !!includeSensitive });
  }
  TD.exportData = function () {
    TD.downloadBlob(new Blob([JSON.stringify(backupPayload(false), null, 2)], { type: 'application/json;charset=utf-8' }),
      'TradeDocsPro-business-' + TD.today() + '.json');
    TD.alert('已导出业务数据（不含账户与主体资料）。');
  };
  TD.exportFullBackup = function () {
    if (!TD.confirm('完整备份包含收款账号与银行资料。请确认只保存在自己的设备或受控备份位置，不要上传公共网盘或发给无关人员。\n\n继续导出吗？')) return;
    TD.downloadBlob(new Blob([JSON.stringify(backupPayload(true), null, 2)], { type: 'application/json;charset=utf-8' }),
      'TradeDocsPro-FULL-backup-' + TD.today() + '.json');
  };
  TD.restoreData = async function (event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('备份文件超过 50 MB。');
      const data = JSON.parse(await file.text());
      for (const key of ['orders', 'customers', 'products']) {
        if (!Array.isArray(data[key])) throw new Error('备份缺少有效的 ' + key + ' 数据。');
      }
      if (data.orders.some((o) => !o || !o.no || !Array.isArray(o.lines))) throw new Error('订单记录格式不完整。');
      if (!TD.confirm('将恢复 ' + data.orders.length + ' 笔订单、' + data.customers.length + ' 位客户、' +
        data.products.length + ' 个产品。现有业务数据会被替换；收款账户与主体资料保留本机当前版本。\n\n继续吗？')) return;
      const payload = { orders: data.orders, customers: data.customers, products: data.products,
        settings: Array.isArray(data.settings) ? data.settings : [] };
      if (TD.isLocalServer()) {
        const response = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '服务端恢复失败');
      }
      for (const [key, value] of Object.entries(payload)) localStorage.setItem('tdshare_' + key, JSON.stringify(value));
      if (TD.isLocalServer()) await TD.syncFromSqlite();
      TD.refresh(); TD.renderActiveView();
      TD.alert('恢复完成。账户与主体资料未被备份覆盖。');
    } catch (error) { TD.alert('恢复失败，原有数据未更改：' + error.message); }
    finally { input.value = ''; }
  };
  TD.restoreSnapshot = async function () {
    if (!TD.isLocalServer()) { TD.alert('SQLite 快照恢复需要本机服务。'); return; }
    try {
      const list = await (await fetch('/api/backups')).json();
      if (!list.length) { TD.alert('还没有自动快照。'); return; }
      const answer = prompt('选择要恢复的快照编号（只还原订单/客户/产品/设置；账户与主体保留）：\n' +
        list.map((x, i) => (i + 1) + '. ' + x.modified + ' · ' + x.name).join('\n'), '1');
      if (!answer) return;
      const index = Number(answer) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error('快照编号无效');
      if (!TD.confirm('恢复到 ' + list[index].modified + '？恢复前会自动生成安全快照；校验失败不会改动当前数据库。')) return;
      const response = await fetch('/api/restore-snapshot', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: list[index].name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '恢复失败');
      await TD.syncFromSqlite(); TD.refresh(); TD.renderActiveView();
      TD.alert('快照恢复完成。恢复前安全快照：' + (result.safetyBackup || '已生成'));
    } catch (error) { TD.alert('快照恢复失败：' + error.message); }
  };
  TD.exportSqlite = async function () {
    if (!TD.isLocalServer()) { TD.alert('需要本机服务。'); return; }
    try {
      const response = await fetch('/api/export/sqlite');
      if (!response.ok) throw new Error((await response.json()).error || '导出失败');
      const disposition = response.headers.get('Content-Disposition') || '';
      const name = (disposition.match(/filename="([^"]+)"/) || [])[1] || 'tradedocs-snapshot.sqlite3';
      TD.downloadBlob(await response.blob(), name);
    } catch (error) { TD.alert('导出失败：' + error.message); }
  };
  TD.reseedConfig = async function () {
    if (!TD.confirm('只补齐数据库中缺失的出单主体/账户，不会覆盖或改写已有的账号与银行资料。继续吗？')) return;
    try {
      const response = await fetch('/api/reseed-config', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'RESEED' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason || result.error || '失败');
      await TD.syncFromSqlite(); TD.refresh(); TD.renderActiveView();
      TD.alert('已补齐：' + JSON.stringify(result.added));
    } catch (error) { TD.alert('补齐失败：' + error.message); }
  };
})();
