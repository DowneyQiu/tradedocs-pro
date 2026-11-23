/* Document studio: five-document preview/export, language & theme controls,
   shipping-mark page, permanent document archive, dashboard insights and import templates.
   All data stays in the local SQLite-backed collections. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  TD._studioOrderId = '';

  // ------------------------------------------------------------ preview / export
  TD.studioOrder = function () {
    const orders = TD.get('orders');
    return orders.find((o) => o.id === TD._studioOrderId) || orders[orders.length - 1] || null;
  };

  /** Read the studio controls as a non-persistent override object. */
  TD.studioOverrides = function () {
    const get = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const chk = (id) => { const el = document.getElementById(id); return el ? !!el.checked : false; };
    return {
      language: get('stLang') || 'en',
      theme: get('stTheme') || 'classicBlue',
      showProductImages: chk('stImages'),
      showMOQ: chk('stMOQ'),
      showGW: chk('stGW'),
      showNW: chk('stNW'),
      showVOL: chk('stVOL'),
      showSignature: chk('stSignature'),
      packingMode: get('stPackingMode') || 'byCarton',
      shippingMark: get('stMainMark'),
      sideMark: get('stSideMark'),
      markNone: chk('stMarkNone'),
    };
  };

  TD.openPreview = function (id, kinds, overrides, autoPrint) {
    const rows = TD.get('orders');
    const order = rows.find((o) => o.id === id) || TD.studioOrder();
    if (!order) { TD.alert('请先新建并保存一笔订单，再预览单证。'); return null; }
    const merged = Object.assign({}, order, overrides || {});
    const list = kinds && kinds.length ? kinds : ['Quotation'];
    if (TD.guardDocuments && !TD.guardDocuments(merged, list)) return null;
    const built = TD.buildDocumentHtml(merged, list);
    const w = TD.openPrintWindow(built, autoPrint);
    return w;
  };

  TD.exportDocPdf = function (id, kind, overrides) {
    return TD.openPreview(id, [kind], overrides, true);
  };
  TD.exportBundlePdf = function (id, overrides) {
    const order = TD.get('orders').find((o) => o.id === id) || TD.studioOrder();
    // A quote-stage bundle is the exact defect seen in the real Italian PDF:
    // five pages including a packing list stamped "do not send" and a CI with
    // bank details. Warn without hard-blocking internal archiving.
    if (order && TD.QUOTE_STAGES.includes(order.state) && !TD.confirm(
      '当前订单阶段是「' + order.state + '」，对外通常只需 Quotation。\n\n' +
      '「合并导出五种单证」会生成【一个多页 PDF】，把报价单、PI、销售合同、商业发票和装箱单连在一起；' +
      '未录装箱数据时 PL 也无法通过出单前检查。\n\n' +
      '发给客户请回到上面的单证卡片，一份一份分别导出。仍要合并存档吗？')) return null;
    return TD.openPreview(id, TD.DOC_KINDS.slice(), overrides, true);
  };
  TD.exportShippingMarkPdf = function (id, overrides) {
    return TD.openPreview(id, ['Shipping Mark'], overrides, true);
  };

  /** Export one Quotation per trade term. Every file is self-contained:
   *  its own unit prices, total, Incoterm, freight wording and number. */
  TD.exportTermQuotation = function (id, overrides) {
    const rows = TD.get('orders');
    const order = rows.find((o) => o.id === id) || TD.studioOrder();
    if (!order) { TD.alert('请先选择订单。'); return null; }
    const merged = Object.assign({}, order, overrides || {});
    const opts = TD.priceOptions(merged);
    if (!opts.length) {
      TD.alert('这笔订单还没有多术语报价方案。\n\n请到订单第 ② 步「按贸易术语逐项报价」选术语、点「＋ 添加术语方案」并填好逐项单价，保存后再来这里分别导出。');
      return null;
    }
    const sel = document.getElementById('stTermQuote');
    const value = sel ? sel.value : 'all';
    const selection = value === 'all' ? 'all' : Number(value);
    const derived = TD.termQuoteOrders(merged, selection);
    if (!derived.length) { TD.alert('没有可导出的报价方案。'); return null; }
    let errors = [], warnings = [];
    for (const d of derived) {
      const check = TD.checkOrder ? TD.checkOrder(d, ['Quotation']) : { errors: [], warnings: [] };
      const scan = TD.scanRendered ? TD.scanRendered(TD.renderPage(d, 'Quotation'))
        : { banned: [], internal: [] };
      if ((scan.banned || []).length) errors.push('渲染结果含对外禁用词（共 ' + scan.banned.length + ' 处），已阻止导出。');
      for (const w of (scan.internal || [])) errors.push('渲染结果含内部数据字样：' + w);
      (check.errors || []).forEach((e) => errors.push('[' + d.incoterm + '] ' + e));
      (check.warnings || []).forEach((w) => warnings.push('[' + d.incoterm + '] ' + w));
    }
    errors = [...new Set(errors)];
    warnings = [...new Set(warnings)];
    if (errors.length) {
      TD.alert('暂不能生成按术语报价单，请先修正：\n\n' + errors.map((x, i) => (i + 1) + '. ' + x).join('\n'));
      return null;
    }
    if (warnings.length && !TD.confirm(
      '单证检查发现以下待核对项目：\n\n' + warnings.map((x, i) => (i + 1) + '. ' + x).join('\n') +
      '\n\n仍要生成单证吗？')) return null;
    return TD.openPrintWindow(TD.buildTermQuotationHtml(derived), true);
  };

  /** Persist studio settings onto the order (one snapshot drives all documents). */
  TD.applyStudioSettings = function () {
    const order = TD.studioOrder();
    if (!order) { TD.alert('请先选择订单。'); return; }
    const patch = TD.studioOverrides();
    const rows = TD.get('orders');
    const index = rows.findIndex((o) => o.id === order.id);
    if (index < 0) return;
    rows[index] = Object.assign({}, order, patch, { updatedAt: new Date().toISOString() });
    TD.set('orders', rows);
    TD._studioOrderId = order.id;
    TD.alert('已把当前语言、配色、显示项与唛头设置保存到订单。五种单证会同步使用这些设置。');
  };

  // ------------------------------------------------------------ permanent archive
  TD.archives = function () {
    return TD.get('settings').filter((s) => s.kind === 'doc-archive')
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  };

  TD.saveToHistory = function (id) {
    const order = TD.get('orders').find((o) => o.id === id);
    if (!order) { TD.alert('订单不存在。'); return; }
    const settings = TD.get('settings');
    settings.push({
      id: TD.uid(), kind: 'doc-archive', at: new Date().toISOString(),
      orderId: order.id, orderNo: order.no, buyer: order.buyer,
      currency: order.currency, total: order.total,
      docs: TD.DOC_KINDS.slice().concat(['Shipping Mark']),
      snapshot: JSON.parse(JSON.stringify(order)),
    });
    TD.set('settings', settings);
    TD.alert('已存入历史记录：' + order.no + '。可在「历史记录」中回溯查看或恢复。');
    TD.renderActiveView();
  };

  TD.restoreArchive = function (archiveId) {
    const archive = TD.get('settings').find((s) => s.id === archiveId && s.kind === 'doc-archive');
    if (!archive || !archive.snapshot) return;
    if (!TD.confirm('把历史单据 ' + archive.orderNo + ' 恢复为可编辑订单？不会覆盖现有订单。')) return;
    const rows = TD.get('orders');
    const restored = JSON.parse(JSON.stringify(archive.snapshot));
    restored.id = TD.uid();
    restored.no = restored.no + '-R' + String(rows.length + 1);
    restored.state = '报价中';
    restored.createdAt = new Date().toISOString();
    rows.push(restored);
    TD.set('orders', rows);
    TD.refresh();
    TD.renderActiveView();
    TD.alert('已恢复为新订单 ' + restored.no + '，可在「订单与单证」中编辑。');
  };

  TD.previewArchive = function (archiveId) {
    const archive = TD.get('settings').find((s) => s.id === archiveId && s.kind === 'doc-archive');
    if (!archive || !archive.snapshot) return;
    const order = archive.snapshot;
    const built = TD.buildDocumentHtml(order, TD.DOC_KINDS.slice());
    TD.openPrintWindow(built, false);
  };

  // ------------------------------------------------------------ dashboard insights
  TD.dashboardInsights = function () {
    const orders = TD.get('orders');
    const customers = TD.get('customers');
    const now = new Date();
    const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const thisMonth = orders.filter((o) => String(o.date || '').slice(0, 7) === month);
    const converted = orders.filter((o) => !(TD.QUOTE_STAGES || ['报价中', '已报价待回复']).includes(o.state) && o.state !== '已取消');
    const byCurrency = {};
    let totalUSD = 0;
    for (const o of converted) {
      const key = o.currency || 'USD';
      byCurrency[key] = (byCurrency[key] || 0) + TD.num(o.total);
      totalUSD += TD.num(o.total);
    }
    const byCustomer = new Map();
    for (const o of orders) {
      const key = o.buyer || '未填写客户';
      const row = byCustomer.get(key) || { name: key, total: 0, count: 0 };
      row.total += TD.num(o.total); row.count += 1;
      byCustomer.set(key, row);
    }
    const topCustomers = [...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    const byCountry = new Map();
    for (const o of orders) {
      const key = o.country || '未填写国家';
      byCountry.set(key, (byCountry.get(key) || 0) + TD.num(o.total));
    }
    const grand = [...byCountry.values()].reduce((a, b) => a + b, 0) || 1;
    const countries = [...byCountry.entries()].map(([name, total]) => ({ name, total, pct: Math.round(total / grand * 1000) / 10 }))
      .sort((a, b) => b.total - a.total).slice(0, 5);
    const repeat = [...byCustomer.values()].filter((c) => c.count > 1).length;
    return {
      monthQuotes: thisMonth.length,
      totalOrders: orders.length,
      conversionRate: orders.length ? Math.round(converted.length / orders.length * 1000) / 10 : 0,
      convertedCount: converted.length,
      byCurrency, totalUSD,
      pending: orders.filter((o) => ['已报价待回复', '待收预付款'].includes(o.state)).length,
      customerCount: new Set(orders.map((o) => o.buyer).filter(Boolean)).size,
      customerArchives: customers.length,
      repeatRate: byCustomer.size ? Math.round(repeat / byCustomer.size * 1000) / 10 : 0,
      topCustomers, countries,
      newCustomerPct: customers.length ? Math.round(Math.max(0, customers.length - repeat) / customers.length * 1000) / 10 : 0,
    };
  };

  // ------------------------------------------------------------ import templates
  TD.IMPORT_TEMPLATES = {
    products: ['name', 'model', 'specification', 'unit', 'unitOptions', 'hsCode', 'origin', 'price',
      'currency', 'moq', 'qtyPerCarton', 'grossWeight', 'netWeight', 'cartonDimensions',
      'packageMethod', 'docDescription', 'category'],
    customers: ['name', 'country', 'city', 'address', 'shippingAddress', 'contact', 'email',
      'phone', 'taxId', 'defaultCurrency', 'payment', 'incoterm', 'packingNotes', 'docNote',
      'whatsapp'],
  };
  TD.downloadImportTemplate = function (kind) {
    const cols = TD.IMPORT_TEMPLATES[kind];
    if (!cols) return;
    const sample = kind === 'products'
      ? ['示例产品', 'DEMO-001', 'Standard Grade', 'PCS', '', '', 'China', '12.5', 'USD', '100', '50', '75', '70', '40x30x25', 'Carton', '', '']
      : ['示例客户 GmbH', 'Germany', 'Hamburg', 'Musterstr. 1', '', 'Mr. Demo', 'demo@example.com', '', '', 'EUR', 'T/T', 'FOB', '', '', ''];
    const csv = '\ufeff' + cols.map(TD.csvCell).join(',') + '\r\n' + sample.map(TD.csvCell).join(',') + '\r\n';
    TD.downloadText(csv, 'TradeDocs_' + kind + '_导入模板.csv', 'text/csv;charset=utf-8');
  };

  // ------------------------------------------------------------ studio view
  function termQuoteOptions(current) {
    const opts = TD.priceOptions(current);
    if (!opts.length) return '<option value="all">（尚未设置多术语方案）</option>';
    const cur = current.currency || '';
    let out = '<option value="all">全部术语（各一页，一次打印 ' + opts.length + ' 份）</option>';
    opts.forEach(function (o, i) {
      out += '<option value="' + i + '">仅 ' +
        E([o.incoterm, o.place].filter(Boolean).join(' ') || ('方案 ' + (i + 1))) +
        ' · ' + E(cur) + ' ' + E(TD.money(TD.num(o.total))) + '</option>';
    });
    return out;
  }

  // ------------------------------------------------------------ visual doc cards
  /** One card per document. Every action produces ONE file for ONE document:
   *  no five-page bundle unless the operator explicitly opens the collapsed
   *  "internal archive" section at the bottom. */
  TD.DOC_CARD_META = [
    { kind: 'Quotation', zh: '报价单', when: '报价、谈单阶段发给客户', code: 'Q' },
    { kind: 'Proforma Invoice', zh: '形式发票', when: '客户确认后收预付款', code: 'PI' },
    { kind: 'Sales Contract', zh: '销售合同', when: '双方签署、确认条款', code: 'SC' },
    { kind: 'Commercial Invoice', zh: '商业发票', when: '出口报关 / 目的港清关', code: 'CI' },
    { kind: 'Packing List', zh: '装箱单', when: '发货时给货代 / 报关行', code: 'PL' },
    { kind: 'Shipping Mark', zh: '箱唛', when: '打印后贴外箱', code: 'MK' },
  ];

  /** Short, operator-facing "what this document still needs" list. This is the
   *  same pre-flight information the checker would only show at export time,
   *  surfaced on the card so the user fixes it before clicking. Nothing here
   *  is auto-filled or invented; every item points to a step in the wizard. */
  TD.docMissing = function (order, kind) {
    const out = [];
    const o = order || {};
    const lines = Array.isArray(o.lines) ? o.lines : [];
    const term = String(o.incoterm || '').trim();
    if (term && !String(o.incotermPlace || '').trim()) {
      out.push('缺术语地点 → 第 ③ 步「术语地点 / 装运港」');
    }
    const shortHs = lines.filter((l) => {
      const code = String(l.hsCode || '').trim();
      return /^\d+$/.test(code) && code.length > 0 && code.length < 10;
    }).length;
    if (shortHs) out.push(shortHs + ' 行 HS 不足 10 位 → 产品行核对后补两位（系统不会自动补 0）');
    if (kind === 'Commercial Invoice') {
      const noHs = lines.filter((l) => !l.hsCode).length;
      const noOrigin = lines.filter((l) => !l.origin).length;
      if (noHs) out.push(noHs + ' 行缺 HS Code，CI 该列会留空');
      if (noOrigin) out.push(noOrigin + ' 行缺原产国，CI 该列会留空');
    }
    if (['Proforma Invoice', 'Sales Contract'].includes(kind) && o.showBank === false) {
      out.push('未勾选「显示收款账户」→ 第 ③ 步，本单证不会打印银行资料');
    }
    if (kind === 'Quotation') {
      const opts = TD.priceOptions(o);
      if (opts.length > 1 && !(TD.num(o.toolingCost) > 0) && !String(o.toolingNote || '').trim()) {
        out.push('尚未答复模具费 / 认证 → 第 ③ 步填写金额或写明「无」');
      }
      const computed = lines.reduce((s, l) => s + TD.num(l.qty) * TD.num(l.price), 0);
      if (lines.length && Math.abs(computed - TD.num(o.total)) > 0.01) {
        out.push('整单金额与产品明细合计不一致 → 回第 ② 步重新保存');
      }
    }
    if (kind === 'Packing List' || kind === 'Shipping Mark') {
      const report = TD.packingReport(o);
      const p = report.parsed;
      if (p.issues.some((x) => x.includes('净重合计大于整箱毛重'))) {
        out.push('有箱号净重大于毛重 → 第 ④ 步核对实装重量');
      }
      if (p.totals.pendingGross) out.push(p.totals.pendingGross + ' 箱毛重未填/冲突，PL 该格会留空');
      if (p.totals.pendingCbm) out.push(p.totals.pendingCbm + ' 箱体积未填/冲突，PL 该格会留空');
      const unmatched = p.perModel.filter((r) => r.unmatched).length;
      if (unmatched) out.push(unmatched + ' 个装箱型号未匹配订单产品 → 第 ④ 步核对型号');
    }
    return [...new Set(out)].slice(0, 4);
  };

  /** Readiness badge. Nothing is invented: "missing" means the operator has
   *  not entered that data yet, and the card says exactly where to fill it. */
  TD.docReadinessBase = function (order, kind) {
    const stage = TD.stageDocKinds(order.state || '报价中');
    if (kind === 'Packing List' || kind === 'Shipping Mark') {
      const report = TD.packingReport(order);
      const p = report.parsed;
      if (!p.boxes.length) {
        return { tone: 'wait', label: '待补装箱数据',
          detail: '未录箱数、毛重、净重、体积。到订单第 ④ 步录入后即可导出。' };
      }
      if (p.perModel.some((r) => r.diff !== 0)) {
        return { tone: 'bad', label: '装箱数量不一致',
          detail: '装箱数量与订单不一致，请先回第 ④ 步核对。' };
      }
      if (p.totals.pendingGross || p.totals.pendingCbm) {
        return { tone: 'wait', label: '部分箱数据待补',
          detail: p.totals.pendingGross + ' 箱毛重、' + p.totals.pendingCbm +
            ' 箱体积未填，PL 上这些格会留空。' };
      }
      if (!order.packingConfirmed) {
        return { tone: 'warn', label: '待确认实装数据',
          detail: '已录装箱数据，但未勾选「已核对」。' };
      }
    }
    if (kind === 'Commercial Invoice' && (order.lines || []).some((l) => !l.hsCode)) {
      return { tone: 'warn', label: '部分 HS 编码未填', detail: '有产品行缺 HS Code，CI 该格会留空。' };
    }
    if (stage.includes(kind)) return { tone: 'good', label: '本阶段推荐', detail: '' };
    if (kind === 'Shipping Mark' && !TD.QUOTE_STAGES.includes(order.state || '')) {
      return { tone: 'ok', label: '可生成', detail: '' };
    }
    return { tone: 'idle', label: '本阶段一般不用', detail: '需要时仍可单独导出。' };
  };

  /** Public badge: base state plus the pre-flight to-do list. */
  TD.docReadiness = function (order, kind) {
    const base = TD.docReadinessBase(order, kind);
    base.issues = TD.docMissing(order, kind);
    return base;
  };

  /** Real A4 page rendered small inside the card. No scripts, no print
   *  toolbar; <base> keeps the local logo path working inside srcdoc. */
  TD.docThumbHtml = function (order, kind, overrides) {
    const merged = Object.assign({}, order, overrides || {});
    const base = (typeof location !== 'undefined') ? location.href.split('#')[0] : '';
    return '<!doctype html><html><head><base href="' + E(base) +
      '"><meta charset="utf-8"><style>' + TD.printCss(merged) +
      '\nhtml,body{background:#fff;margin:0}.toolbar{display:none}</style></head><body>' +
      TD.renderPage(merged, kind) + '</body></html>';
  };

  /** Download ONE document as ONE standalone .html file. Double-click to
   *  open / print it later; it never contains a second document. */
  TD.downloadOneDoc = function (id, kind, overrides) {
    const order = TD.get('orders').find((o) => o.id === id) || TD.studioOrder();
    if (!order) { TD.alert('请先选择订单。'); return null; }
    const merged = Object.assign({}, order, overrides || {});
    if (TD.guardDocuments && !TD.guardDocuments(merged, [kind])) return null;
    const built = TD.buildDocumentHtml(merged, [kind]);
    if (built.banned && built.banned.length) { TD.alert('检测到对外禁用词，已阻止下载。'); return null; }
    const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_');
    const name = safe(order.no || 'TradeDocs') + '_' + safe(TD.docTitle(kind, 'zh') || kind) + '.html';
    TD.downloadText(built.html, name, 'text/html;charset=utf-8');
    return name;
  };

  /** Jump from the order list / wizard straight into this order's cards. */
  TD.openStudioFor = function (id) {
    if (id) TD._studioOrderId = id;
    TD.setActiveNav('studio');
  };

  function docCardHtml(order, kind, overrides) {
    const meta = TD.DOC_CARD_META.find((m) => m.kind === kind);
    const st = TD.docReadiness(order, kind);
    const no = TD.documentNumber(order, kind);
    const merged = Object.assign({}, order, overrides || {});
    const thumb = TD.docThumbHtml(merged, kind);
    return '<article class="doccard" data-kind="' + E(kind) + '">' +
      '<button class="doccard-preview" type="button" data-cmd="card-preview" data-kind="' + E(kind) +
      '" title="点击预览真实单证（单独一个窗口）">' +
      '<iframe class="doccard-frame" srcdoc="' + E(thumb) + '" tabindex="-1" scrolling="no" aria-hidden="true"></iframe>' +
      '<span class="doccard-zoom">🔍 预览</span></button>' +
      '<div class="doccard-body">' +
      '<div class="doccard-head"><span class="doccard-code">' + E(meta.code) + '</span>' +
      '<div><h3>' + E(meta.zh) + '</h3><small>' + E(kind) + '</small></div></div>' +
      '<div class="doccard-no">' + E(no) + '</div>' +
      '<div class="doccard-badge ' + st.tone + '">' + E(st.label) + '</div>' +
      '<p class="sub">' + E(meta.when) + (st.detail ? '<br><span class="doccard-detail">' + E(st.detail) + '</span>' : '') + '</p>' +
      (st.issues && st.issues.length
        ? '<div class="doccard-todo"><b>这份还差：</b><ul>' +
          st.issues.map((x) => '<li>' + E(x) + '</li>').join('') + '</ul></div>'
        : '') +
      '<div class="doccard-actions">' +
      '<button class="btn" data-cmd="card-preview" data-kind="' + E(kind) + '">预览</button>' +
      '<button class="btn primary" data-cmd="card-print" data-kind="' + E(kind) + '">打印 / 另存 PDF</button>' +
      '<button class="btn" data-cmd="card-download" data-kind="' + E(kind) + '">下载单份文件</button>' +
      '</div></div></article>';
  }

  /** Per-document date / remark editor rows. Empty = use quotation date /
   *  print no remark, so a normal order never needs to open this section. */
  function docMetaRows(order) {
    const all = (order.docMeta || {});
    return TD.DOC_CARD_META.map((m) => {
      const row = all[m.kind] || {};
      return '<tr><td><b>' + E(m.zh) + '</b><br><small>' + E(m.kind) + '</small></td>' +
        '<td><input type="date" data-dm="date" data-kind="' + E(m.kind) + '" value="' + E(row.date || '') + '"></td>' +
        '<td><input type="text" data-dm="remark" data-kind="' + E(m.kind) +
        '" value="' + E(row.remark || '') + '" placeholder="留空则不打印"></td></tr>';
    }).join('');
  }

  TD.saveStudioDocMeta = function (id) {
    const rows = TD.get('orders');
    const index = rows.findIndex((o) => o.id === id);
    if (index < 0) { TD.alert('请先选择订单。'); return null; }
    const meta = {};
    document.querySelectorAll('#docMetaBox [data-dm]').forEach((el) => {
      const kind = el.dataset.kind;
      meta[kind] = meta[kind] || {};
      meta[kind][el.dataset.dm] = String(el.value || '').trim();
    });
    const clean = {};
    for (const [kind, value] of Object.entries(meta)) {
      if (value.date || value.remark) clean[kind] = value;
    }
    const updated = Object.assign({}, rows[index], {
      docMeta: clean, updatedAt: new Date().toISOString(),
    });
    rows[index] = updated;
    TD.set('orders', rows);
    TD.refresh();
    return updated;
  };

  TD.studioHtml = function () {
    const orders = TD.get('orders').slice().reverse();
    const current = TD.studioOrder();
    if (!current) {
      return '<div class="panelhead"><h2>单证中心 · 预览与导出</h2></div>' +
        '<div class="emptybox"><b>还没有订单</b><br>先新建并保存一笔订单，即可在这里一键预览 / 导出五种单证、切换 11 种语言与 9 款配色、打印箱唛。</div>';
    }
    const opt = TD.docOptions(current);
    const yes = (v) => v ? ' checked' : '';
    // Show the business stage inside every option, so the user can pick the
    // right order from the dropdown without having to select it first.
    const orderOptions = orders.map((o) => {
      const stage = String(o.state || '报价中').trim();
      return '<option value="' + E(o.id) + '"' + (o.id === current.id ? ' selected' : '') + '>' +
        '【' + E(stage) + '】' + E(o.no) + ' · ' + E(o.buyer || '') + ' · ' +
        E(o.currency || '') + ' ' + TD.money(o.total) + '</option>';
    }).join('');
    const langOptions = TD.LANGUAGES.map((l) => '<option value="' + l.code + '"' + (l.code === opt.language ? ' selected' : '') + '>' + E(l.label) + '</option>').join('');
    const themeOptions = TD.THEMES.map((t) => '<option value="' + t.id + '"' + (t.id === opt.theme.id ? ' selected' : '') + '>' + E(t.name) + '</option>').join('');
    const swatches = TD.THEMES.map((t) => '<span class="swatch" title="' + E(t.name) + '" style="background:' + t.headerBg + '"></span>').join('');
    // Each card is independent: its own preview, its own print window (and
    // therefore its own PDF), its own downloadable single-document file.
    const ov = {
      language: opt.language, theme: opt.theme.id, showProductImages: opt.showImages,
      showMOQ: opt.showMOQ, showGW: opt.showGW, showNW: opt.showNW, showVOL: opt.showVOL,
      showSignature: opt.showSignature, packingMode: opt.packingMode,
      shippingMark: current.shippingMark, sideMark: current.sideMark, markNone: !!current.markNone,
    };
    const cards = TD.DOC_CARD_META.map((m) => docCardHtml(current, m.kind, ov)).join('');

    return '<div class="panelhead"><h2>单证中心 · 预览与导出</h2><div class="actions">' +
      '<button class="btn" data-cmd="save-default">保存为订单默认设置</button>' +
      '<button class="btn" data-cmd="archive">存入历史记录</button></div></div>' +
      '<p class="sub">五种单证共用同一份订单快照；切换语言、配色、显示项与唛头后立即预览，不会写入订单，直到点击「保存为订单默认设置」。</p>' +
      '<div class="studio-grid">' +
      '<section class="panel soft"><div class="panelhead"><h2>① 选择订单</h2></div>' +
      '<label>当前单据<select id="stOrderSelect">' + orderOptions + '</select></label>' +
      '<div class="statgrid">' +
      '<div class="stat"><span>订单编号</span><b>' + E(current.no) + '</b></div>' +
      '<div class="stat"><span>客户</span><b>' + E(current.buyer || '—') + '</b></div>' +
      '<div class="stat"><span>金额</span><b>' + E(current.currency) + ' ' + TD.money(current.total) + '</b></div>' +
      '<div class="stat"><span>阶段</span><b>' + E(current.state || '报价中') + '</b></div>' +
      '</div></section>' +
      '<section class="panel soft"><div class="panelhead"><h2>② 输出语言与配色</h2></div>' +
      '<label>输出语言（11 种）<select id="stLang">' + langOptions + '</select></label>' +
      '<label>单证配色（9 款）<select id="stTheme">' + themeOptions + '</select></label>' +
      '<div class="swatches">' + swatches + '</div>' +
      '<p class="sub">语言切换只翻译单证标题、字段名与表头；产品名、地址、备注保持你填写的原文，不做机器翻译。</p></section>' +
      '<section class="panel soft"><div class="panelhead"><h2>③ 显示项与装箱模式</h2></div>' +
      '<div class="checkgrid">' +
      '<label class="check"><input type="checkbox" id="stImages"' + yes(opt.showImages) + '> 显示产品图</label>' +
      '<label class="check"><input type="checkbox" id="stMOQ"' + yes(opt.showMOQ) + '> MOQ 起订量</label>' +
      '<label class="check"><input type="checkbox" id="stGW"' + yes(opt.showGW) + '> 总毛重 / TOTAL GW</label>' +
      '<label class="check"><input type="checkbox" id="stNW"' + yes(opt.showNW) + '> 总净重 / TOTAL NW</label>' +
      '<label class="check"><input type="checkbox" id="stVOL"' + yes(opt.showVOL) + '> 总体积 / TOTAL VOL</label>' +
      '<label class="check"><input type="checkbox" id="stSignature"' + yes(opt.showSignature) + '> 签字盖章区</label>' +
      '</div><label>装箱单模式<select id="stPackingMode">' +
      '<option value="byCarton"' + (opt.packingMode === 'byCarton' ? ' selected' : '') + '>按箱汇总模式（推荐）</option>' +
      '<option value="byPiece"' + (opt.packingMode === 'byPiece' ? ' selected' : '') + '>逐件明细模式</option></select></label>' +
      '</section>' +
      '<section class="panel soft"><div class="panelhead"><h2>④ 唛头 / Shipping Mark</h2></div>' +
      '<label>主唛（每行一条）<textarea id="stMainMark" rows="4" placeholder="BUYER NAME / DESTINATION&#10;P/O No.: PO-2026-001&#10;C/NO. 1-UP">' + E(current.shippingMark || '') + '</textarea></label>' +
      '<label>侧唛 / 附加信息<input id="stSideMark" value="' + E(current.sideMark || '') + '" placeholder="G.W. / N.W. / MEAS. / MADE IN CHINA"></label>' +
      '<label class="check"><input type="checkbox" id="stMarkNone"' + yes(TD.shippingMark(current).isNM) + '> N/M（无唛头）</label>' +
      '<p class="sub">唛头会显示在装箱单 SHIPPING MARK 列，并可单独打印「箱唛页」贴箱。</p></section>' +
      '</div>' +
      '<section class="panel" style="margin-top:14px"><div class="panelhead"><h2>⑤ 单证卡片 · 想打印哪份就点哪份</h2></div>' +
      '<p class="sub">下面每一张卡片就是<b>一份单证、一个独立文件</b>。点「打印 / 另存 PDF」只会打开那一份，' +
      '在打印对话框里选「另存为 PDF」即可存成单独一个 PDF；点「下载单份文件」会存成一个独立 HTML 文件，双击就能打开再打印。' +
      '<b>不会再出现五种单证连成一个 5 页 PDF 的情况</b>——除非你主动展开最下面的「内部存档」。</p>' +
      '<div class="docwall">' + cards + '</div>' +
      '<details class="advanced" id="docMetaBox" style="margin-top:10px">' +
      '<summary>各单证独立日期与备注（可选，默认全部沿用报价日期、不打印备注）</summary>' +
      '<p class="sub">真实外贸里 PI 日期、CI 日期常与报价日期不同。这里按单证单独填；留空就沿用订单报价日期，' +
      '备注留空就完全不打印，不会留占位符。填完点「保存到本订单」后，上面卡片预览与导出的单证立即按新日期/备注出单。</p>' +
      '<div class="tablewrap"><table class="table docmeta-table"><thead><tr><th>单证</th><th>本单证日期</th><th>本单证备注（只打印你填的原文）</th></tr></thead><tbody>' +
      docMetaRows(current) + '</tbody></table></div>' +
      '<div class="actions" style="margin-top:8px"><button class="btn primary" data-cmd="save-docmeta">保存到本订单</button></div></details>' +
      '<details class="advanced" id="termQuoteBox" style="margin-top:10px">' +
      '<summary>按贸易术语分别出报价单（客户要 FOB 一份 / DDP 一份时展开）</summary>' +
      '<p class="sub">每份报价单只有<b>一种</b>贸易术语，产品单价、整单总价、术语地点、运费责任与报价单号都各自对应；' +
      '不会把 FOB / DDP 两种价格并列印在同一张明细表上。选「仅某个术语」即可单独导出一份 PDF；' +
      '选「全部术语」则一次生成多页，每页一份，打印时按页码另存即可拆开。</p>' +
      '<div class="actions" style="margin-top:8px"><select id="stTermQuote">' + termQuoteOptions(current) + '</select>' +
      '<button class="btn primary" data-cmd="exp-term">导出按术语报价单</button></div>' +
      '<p class="sub">方案里的价格与数量来自订单第 ② 步「按贸易术语逐项报价」；第 ③ 步只是只读核对。' +
      '旧订单若只留了整单总价、没有逐项单价，系统会按该总价等比折算到各行，保证明细合计与 TOTAL 一致。' +
      '单份报价单号带术语后缀（例：' + E(String(current.no || '')) + '-DDP），便于归档区分。</p></details>' +
      '<div class="printtip"><b>如何保存为 PDF</b>：点卡片上的「打印 / 另存 PDF」→ 浏览器打印对话框 → 目标打印机选「另存为 PDF」→ 保存，得到的就是<b>单独一份</b>单证。' +
      '<b>务必勾选「背景图形 / Background graphics」</b>，否则表头配色不会打印出来；' +
      '<b>页眉和页脚已由系统自动抑制（A4 零页边距）</b>，不会再出现 about:blank、打印日期与页码；万一浏览器仍显示，请在「更多设置」里关闭「页眉和页脚」。' +
      '<br><b>报价阶段只需报价单卡片</b>：客户确认付款再补 PI，出货前才需要 CI / PL / 箱唛。</div>' +
      '<details class="advanced" style="margin-top:12px">' +
      '<summary>内部存档：仍要把五种单证合成一个多页 PDF？（默认收起，不推荐对外）</summary>' +
      '<p class="sub">下面这个按钮会生成<b>一个含 5 页的 PDF</b>（报价单 + PI + 合同 + CI + 装箱单连在一起），只适合自己留档。' +
      '发给客户或货代请一律用上面的单张卡片分别导出。</p>' +
      '<div class="actions"><button class="btn" data-cmd="exp-bundle">合并导出五种单证（一个多页 PDF）</button>' +
      '<button class="btn" data-cmd="preview-all">预览整套（不打印）</button></div></details>' +
      '</section>' +
      '<section class="panel" style="margin-top:14px"><div class="panelhead"><h2>⑥ 单证关系与参考编号</h2></div>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>单证</th><th>编号</th><th>日期</th><th>本单证调用的参考编号</th></tr></thead><tbody>' +
      TD.DOC_KINDS.map((k) => '<tr><td><b>' + E(TD.docTitle(k, 'zh')) + '</b></td><td>' + E(TD.documentNumber(current, k)) +
        '</td><td>' + E(TD.docDate(current, k)) + '</td><td>' +
        E(TD.referenceRows(current, k).filter((r) => r[1]).slice(0, 6).map((r) => r[0] + ': ' + r[1]).join('　·　')) + '</td></tr>').join('') +
      '</tbody></table></div></section>';
  };

  TD.bindStudio = function () {
    const select = document.getElementById('stOrderSelect');
    if (select) select.addEventListener('change', () => { TD._studioOrderId = select.value; TD.renderView('studio'); });
    TD.bindViewClick((event) => {
      const button = event.target.closest('[data-cmd]');
      if (!button) return;
      const cmd = button.dataset.cmd;
      const order = TD.studioOrder();
      if (!order) return;
      const ov = TD.studioOverrides();
      if (cmd === 'exp') TD.exportDocPdf(order.id, button.dataset.kind, ov);
      else if (cmd === 'card-preview') TD.openPreview(order.id, [button.dataset.kind], ov, false);
      else if (cmd === 'card-print') TD.openPreview(order.id, [button.dataset.kind], ov, true);
      else if (cmd === 'card-download') TD.downloadOneDoc(order.id, button.dataset.kind, ov);
      else if (cmd === 'exp-mark') TD.exportShippingMarkPdf(order.id, ov);
      else if (cmd === 'exp-bundle') TD.exportBundlePdf(order.id, ov);
      else if (cmd === 'preview-all') TD.openPreview(order.id, TD.DOC_KINDS.slice(), ov, false);
      else if (cmd === 'exp-term') TD.exportTermQuotation(order.id, ov);
      else if (cmd === 'save-default') { TD._studioOrderId = order.id; TD.applyStudioSettings(); TD.renderView('studio'); }
      else if (cmd === 'save-docmeta') {
        const saved = TD.saveStudioDocMeta(order.id);
        if (saved) { TD._studioOrderId = order.id; TD.renderView('studio'); }
      }
      else if (cmd === 'archive') TD.saveToHistory(order.id);
    });
  };
})();
