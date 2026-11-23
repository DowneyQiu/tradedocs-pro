/* TradeDocs Pro - core state, storage sync and shared helpers.
   Copyright (c) 2026 拓珀新材料（成都）有限公司.
   Licensed under the TradeDocs Pro Source-Available / Non-Commercial Distribution License 1.0; see LICENSE.
   No external dependencies, no network calls except the local 127.0.0.1 service. */
(function () {
  'use strict';
  const TD = window.TD = window.TD || {};

  TD.VERSION = '3.0.0';
  TD.COLLECTIONS = ['orders', 'customers', 'products', 'accounts', 'entities', 'settings'];
  TD.BUSINESS = ['orders', 'customers', 'products', 'settings'];
  TD.CURRENCIES = ['USD', 'EUR', 'CNY', 'AED', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'RUB', 'SAR', 'INR', 'THB'];
  TD.INCOTERMS = ['DDP', 'EXW', 'FOB', 'CIF', 'CFR', 'DDU', 'FCA', 'DAP'];
  // Select-driven trade terms. Every preset still leaves the underlying text
  // field editable, so unusual terms (L/C, CAD, Indian buyers paying 100%
  // in advance, etc.) never get blocked by the dropdown.
  TD.PAYMENT_PRESETS = [
    { pct: 100, label: '100% 全额预付 / T/T in advance' },
    { pct: 80, label: '80% 定金 + 20% 发货前' },
    { pct: 50, label: '50% 定金 + 50% 发货前' },
    { pct: 30, label: '30% 定金 + 70% 发货前' },
    { pct: 0, label: '无定金 · 发货前 100% 付清' },
  ];
  TD.LEAD_DAYS = [7, 10, 15, 20, 25, 30, 45, 60];
  TD.VALID_DAYS = [7, 10, 15, 30, 45, 60, 90];
  TD.SHIP_MODES = ['SEA', 'AIR', 'RAIL', 'TRUCK', 'COURIER / EXPRESS', 'MULTIMODAL'];

  /** One source of truth for the payment sentence. The deposit percentage and
   *  the printed sentence must never disagree (a real defect found in a user's
   *  exported PI: "100%" in the table but "50% deposit" in the terms line). */
  TD.paymentText = function (pct) {
    const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    if (p === 100) return '100% T/T in advance';
    if (p === 0) return 'T/T 100% balance before shipment';
    return 'T/T ' + p + '% deposit, ' + (100 - p) + '% balance before shipment';
  };
  TD.paymentPercentInText = function (text) {
    const m = String(text || '').match(/(\d{1,3})\s*%/);
    return m ? Number(m[1]) : null;
  };
  TD.STAGES = ['报价中', '已报价待回复', '待收预付款', '生产中', '待收尾款', '待发货', '已发货', '已完成', '已取消'];
  TD.DOC_KINDS = ['Quotation', 'Proforma Invoice', 'Sales Contract', 'Commercial Invoice', 'Packing List'];

  /** Multi-term quotation options. ONE record drives the step-2 per-line unit
   *  price matrix, the comparison table on the combined Quotation, and the
   *  separately exported single-term quotations. The product lines own the
   *  quantities; a scheme never carries its own "quantity tier" (that field
   *  existed in r6 and produced a meaningless total/qty "average price").
   *  A formal quotation / invoice still carries exactly ONE Incoterm. */
  TD.priceOptions = function (order) {
    const raw = order && order.priceOptions;
    if (!Array.isArray(raw)) return [];
    return raw.map(function (o) {
      return {
        incoterm: String(o.incoterm || '').trim(),
        place: String(o.place || '').trim(),
        // Deprecated: kept only so pre-r8 orders still parse. Never printed,
        // never used for maths or document numbers.
        qty: TD.num(o.qty),
        total: TD.num(o.total),
        freight: String(o.freight || '').trim(),
        note: String(o.note || '').trim(),
        // unitPrices[i] is the unit price of order.lines[i] under this term.
        // '' means "not quoted separately -> use the primary unit price".
        unitPrices: Array.isArray(o.unitPrices) ? o.unitPrices.map(function (v) {
          if (v === '' || v == null) return '';
          const n = Number(v);
          return isFinite(n) && n >= 0 ? n : '';
        }) : [],
      };
    }).filter(function (o) {
      return o.incoterm || o.total > 0 || o.place || o.freight || o.note || o.unitPrices.length;
    });
  };

  /** The scheme whose unit prices are the base prices printed in the item
   *  table: the first one matching the order's primary Incoterm, else the
   *  first scheme. Single definition shared by the editor and all outputs. */
  TD.termOptionBaseIndex = function (order) {
    const opts = TD.priceOptions(order || {});
    const primary = String((order && order.incoterm) || '').trim();
    const hit = opts.findIndex(function (o) { return o.incoterm === primary; });
    return hit >= 0 ? hit : (opts.length ? 0 : -1);
  };

  /** True when at least one line has a term-specific unit price. */
  TD.termOptionHasUnitPrices = function (o) {
    return !!(o && Array.isArray(o.unitPrices) && o.unitPrices.some(function (v) {
      return v !== '' && v != null && isFinite(Number(v));
    }));
  };

  /** Count lines that were not quoted separately (they fall back to the
   *  primary unit price). The editor warns about these so a half-filled
   *  matrix can never silently masquerade as a fully quoted term. */
  TD.termOptionMissingCount = function (lines, o) {
    if (!TD.termOptionHasUnitPrices(o)) return 0;
    const src = Array.isArray(lines) ? lines : [];
    let missing = 0;
    src.forEach(function (line, i) {
      const v = o.unitPrices[i];
      if (v === '' || v == null || !isFinite(Number(v))) missing += 1;
    });
    return missing;
  };

  /** All-in total for one term = sum(qty * term unit price). Returns null when
   *  no per-line prices were entered (hand-filled total stays authoritative,
   *  which keeps every pre-r8 order working unchanged). */
  TD.termOptionTotal = function (lines, o) {
    if (!TD.termOptionHasUnitPrices(o)) return null;
    const src = Array.isArray(lines) ? lines : [];
    return src.reduce(function (sum, line, i) {
      const v = o.unitPrices[i];
      const price = (v === '' || v == null || !isFinite(Number(v))) ? TD.num(line.price) : Number(v);
      return sum + TD.num(line.qty) * price;
    }, 0);
  };

  /** DDP / DAP / CIF etc. mean the seller pays the main carriage. A global
   *  "Freight Collect" line on such a quotation is a real contradiction. */
  TD.sellerPaysFreight = function (term) {
    return ['DDP', 'DAP', 'DDU', 'CIF', 'CFR', 'CIP', 'CPT'].indexOf(
      String(term || '').toUpperCase()) >= 0;
  };

  /** Derive one self-contained Quotation per trade term. Used when the buyer
   *  wants a separate FOB quote and a separate DDP quote. Every derived order
   *  has its own unit prices, total, Incoterm, freight wording and number. */
  TD.termQuoteOrders = function (order, selection) {
    const opts = TD.priceOptions(order || {});
    if (!opts.length) return [];
    const lines = Array.isArray(order.lines) ? order.lines : [];
    let chosen;
    if (selection == null || selection === 'all') chosen = opts.map(function (_, i) { return i; });
    else chosen = [].concat(selection).map(Number).filter(function (i) {
      return Number.isInteger(i) && i >= 0 && i < opts.length;
    });
    const used = {};
    return chosen.map(function (idx) {
      const o = opts[idx];
      const term = o.incoterm || order.incoterm || 'FOB';
      const computed = TD.termOptionTotal(lines, o);
      const target = computed != null ? computed : (TD.num(o.total) || TD.num(order.total));
      // A pre-r8 option may carry only a hand-filled all-in total (quantity
      // tiers). Printing the primary unit prices beside a different TOTAL
      // would produce a self-contradictory quotation, so scale the line prices
      // to the scheme total and derive TOTAL from those very same lines.
      let scale = 1;
      if (computed == null) {
        const raw = lines.reduce(function (sum, l) {
          return sum + TD.num(l.qty) * TD.num(l.price);
        }, 0);
        if (raw > 0 && target > 0) scale = target / raw;
      }
      const termLines = lines.map(function (l, i) {
        const v = o.unitPrices[i];
        const own = (v === '' || v == null || !isFinite(Number(v))) ? TD.num(l.price) : Number(v);
        const price = Math.round(own * scale * 10000) / 10000;
        return Object.assign({}, l, { price: price });
      });
      const total = Math.round(termLines.reduce(function (sum, l) {
        return sum + TD.num(l.qty) * TD.num(l.price);
      }, 0) * 100) / 100;
      let shipVia = String(o.freight || order.shipVia || '');
      if (TD.sellerPaysFreight(term) && /freight\s*collect|collect/i.test(shipVia)) {
        shipVia = shipVia.replace(/freight\s*collect|collect/ig, 'Freight prepaid by seller');
      }
      // e.g. QUO-2026-001-FOB. The old r6 suffix used the scheme's free-text
      // "quantity tier", which could disagree with the real line quantities;
      // a second quote for the same term gets -2, -3 instead.
      const base = [order.no || '', term].filter(Boolean).join('-');
      used[base] = (used[base] || 0) + 1;
      const no = used[base] > 1 ? base + '-' + used[base] : base;
      // A scheme note is customer-facing ("Duties included"); the BASE marker
      // is internal bookkeeping and must never be printed.
      const note = String(o.note || '').trim();
      return Object.assign({}, order, {
        no: no,
        lines: termLines,
        total: total,
        incoterm: term,
        incotermPlace: o.place || order.incotermPlace || '',
        shipVia: shipVia,
        termQuoteNote: note && !/^base$/i.test(note) ? note : '',
        // A single-term quotation must not print the comparison table.
        priceOptions: [],
      });
    });
  };

  /** Which documents belong to which business stage. A quotation must not
   *  silently ship a five-page bundle containing a packing list labelled
   *  "do not send" and a commercial invoice with bank details. */
  TD.QUOTE_STAGES = ['报价中', '已报价待回复'];
  TD.stageDocKinds = function (state) {
    if (TD.QUOTE_STAGES.includes(state)) return ['Quotation'];
    if (['待收预付款', '生产中', '待收尾款'].includes(state)) return ['Proforma Invoice'];
    if (['待发货', '已发货', '已完成'].includes(state)) return ['Commercial Invoice', 'Packing List'];
    return ['Quotation'];
  };
  TD.DOC_CODES = { 'Quotation': 'Q', 'Proforma Invoice': 'PI', 'Sales Contract': 'SC', 'Commercial Invoice': 'CI', 'Packing List': 'PL' };
  // Optional brand-compliance guard. Ships empty: add your own unwanted
  // tokens here (or in settings) to block them from customer-facing documents.
  TD.BANNED_WORDS = [];

  // ------------------------------------------------------------------ state
  TD.get = function (key) {
    try { return JSON.parse(localStorage.getItem('tdshare_' + key) || '[]'); }
    catch (e) { return []; }
  };
  TD.set = function (key, value) {
    localStorage.setItem('tdshare_' + key, JSON.stringify(value));
    TD.syncCollection(key, value);
  };

  TD.isLocalServer = function () {
    return location.protocol === 'http:' && location.hostname === '127.0.0.1';
  };

  /** Delegated click handler for the #view panel. renderView() replaces the
   *  panel's innerHTML but keeps the same DOM node, so repeated addEventListener
   *  calls used to stack up: after switching orders a few times, one click on a
   *  document card fired several handlers and produced several PDFs/downloads.
   *  Keep exactly one handler per view render. */
  TD.bindViewClick = function (handler) {
    const panel = document.getElementById('view');
    if (!panel) return;
    if (panel.__tdClickHandler) panel.removeEventListener('click', panel.__tdClickHandler);
    panel.__tdClickHandler = handler;
    panel.addEventListener('click', handler);
  };

  const queues = new Map();
  let pending = 0;
  function storagePill(text, state) {
    const pill = document.getElementById('storagePill');
    if (!pill) return;
    pill.textContent = text;
    pill.dataset.state = state || 'saved';
    pill.title = state === 'error'
      ? '数据仍在当前浏览器缓存中，但未确认写入 SQLite。请保持本地服务运行，修改任意一条资料后重试。'
      : '';
  }
  TD.syncCollection = function (collection, records) {
    if (!TD.isLocalServer()) {
      storagePill('● 浏览器缓存模式（请通过启动器打开）', 'error');
      return Promise.resolve(false);
    }
    const payload = JSON.stringify(records);
    const previous = queues.get(collection) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      pending += 1;
      storagePill('● 正在保存到本机数据库…', 'saving');
      try {
        const response = await fetch('/api/collection/' + encodeURIComponent(collection), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
        return true;
      } finally { pending = Math.max(0, pending - 1); }
    });
    queues.set(collection, write);
    return write.then((ok) => {
      if (pending === 0) storagePill('● SQLite 本地数据库已连接', 'saved');
      return ok;
    }).catch((error) => {
      console.error('TradeDocs Pro 本机数据库同步失败:', error);
      if (pending === 0) storagePill('● SQLite 未同步（浏览器缓存仍保留）', 'error');
      return false;
    });
  };

  TD.syncFromSqlite = async function () {
    if (!TD.isLocalServer()) {
      storagePill('● 浏览器缓存模式（请通过启动器打开）', 'error');
      return false;
    }
    try {
      const response = await fetch('/api/data');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const hasBusiness = TD.BUSINESS.some((key) => (data[key] || []).length);
      let merged = data;
      // Only a never-used database may inherit legacy browser-cache data. Once the
      // SQLite database has held real records, it is authoritative — otherwise a
      // stale cache could resurrect orders after a cleanup or a restore.
      // Sales edition: the local SQLite database is the ONLY source of truth.
      // Browser storage is a write-through cache. Never import records left
      // by another installation that happens to share this origin.
      if (!hasBusiness && TD.BUSINESS.some((key) => TD.get(key).length)) {
        console.info('TradeDocs Pro：已忽略本机浏览器缓存中的其它版本数据。');
      }
      for (const key of TD.COLLECTIONS) {
        localStorage.setItem('tdshare_' + key, JSON.stringify(merged[key] || []));
      }
      // Accounts / entities are always authoritative from SQLite.
      storagePill('● SQLite 本地数据库已连接', 'saved');
      return true;
    } catch (error) {
      console.error('TradeDocs Pro 读取本机数据库失败:', error);
      storagePill('● SQLite 未连接（浏览器缓存仍保留）', 'error');
      return false;
    }
  };

  // ---------------------------------------------------------------- settings
  TD.DEFAULT_APP_SETTINGS = {
    id: 'app', kind: 'app-settings',
    docNumberTemplate: 'TPNM-{kind}-{order}',
    defaultIncoterm: 'DDP', defaultPayment: 'T/T 50% deposit, 50% balance before shipment',
    defaultLead: '20-25 working days', defaultValid: '30 days', defaultDepositPct: 50,
    showBankDefault: true, showProductImagesDefault: false,
    defaultLanguage: 'en', defaultTheme: 'classicBlue',
    brandCheckEnabled: true,
  };
  TD.appSettings = function () {
    const row = TD.get('settings').find((item) => item.id === 'app' && item.kind === 'app-settings');
    return Object.assign({}, TD.DEFAULT_APP_SETTINGS, row || {});
  };
  TD.saveAppSettings = function (patch) {
    const rows = TD.get('settings');
    const next = Object.assign(TD.appSettings(), patch, { id: 'app', kind: 'app-settings' });
    const index = rows.findIndex((item) => item.id === 'app');
    if (index >= 0) rows[index] = next; else rows.push(next);
    TD.set('settings', rows);
    return next;
  };

  // ------------------------------------------------------------------ helpers
  TD.esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  };
  TD.val = function (id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };
  TD.checked = function (id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  };
  TD.setVal = function (id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? '' : value;
  };
  TD.setChecked = function (id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  };
  TD.uid = function () {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };
  TD.today = function () {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  TD.num = function (value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback || 0);
  };
  TD.money = function (value, digits) {
    const d = digits == null ? 2 : digits;
    return TD.num(value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  TD.formatUnitPrice = function (value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.00';
    let text = n.toFixed(4);
    while (text.includes('.') && text.split('.')[1].length > 2 && text.endsWith('0')) text = text.slice(0, -1);
    return text;
  };
  TD.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  TD.downloadText = function (text, filename, mime) {
    TD.downloadBlob(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), filename);
  };
  TD.csvCell = function (value) {
    let x = String(value == null ? '' : value);
    if (/^[=+@\-]/.test(x)) x = "'" + x;
    return '"' + x.replace(/"/g, '""') + '"';
  };
  TD.csvParse = function (text) {
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim()));
  };
  TD.options = function (list, selected) {
    return list.map((item) => {
      const value = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? item : item.label;
      return '<option value="' + TD.esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + TD.esc(label) + '</option>';
    }).join('');
  };
  TD.confirm = function (message) { return window.confirm(message); };
  TD.alert = function (message) { window.alert(message); };

  // Bright, readable compliance banner used across views.
  TD.notice = function (target, html, tone) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    el.hidden = !html;
    el.className = 'notice' + (tone ? ' ' + tone : '');
    el.innerHTML = html || '';
  };
})();
