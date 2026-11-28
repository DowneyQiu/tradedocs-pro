/* Order editor: one form drives every document. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  TD.LINE_FIELDS = ['name', 'model', 'qty', 'unit', 'price', 'hsCode', 'origin', 'productId',
    'material', 'specification', 'hardness', 'color', 'dimensions', 'packageMethod',
    'qtyPerCarton', 'grossWeight', 'netWeight', 'cartonDimensions', 'docDescription',
    'image', 'detailImage', 'priceSource', 'moq', 'totalGW', 'totalNW', 'totalVOL',
    'unitGrossWeight', 'unitNetWeight', 'unitCbm'];
  // Extra order-level fields introduced by the reference-video feature set.
  TD.EXTRA_ORDER_FIELDS = ['lcNo', 'blNo', 'containerNo', 'sealNo', 'piNo', 'etd', 'vessel',
    'shippingMark', 'sideMark', 'markNote', 'packingNote', 'packingMode', 'docBody',
    'sellerSignature', 'buyerSignature', 'discountPct', 'vatPct', 'terms',
    'language', 'theme', 'complianceNote', 'consignee', 'notifyParty'];
  TD.EXTRA_BOOL_FIELDS = ['markNone', 'showMOQ', 'showGW', 'showNW', 'showVOL',
    'showHS', 'showSignature', 'showStamp', 'compact', 'ciForPayment'];
  // Scheme meta fields edited in the step-2 matrix header / footer.
  // Quantity and total are NOT here: they come from the product lines.
  TD.PRICE_OPTION_FIELDS = ['incoterm', 'place', 'freight', 'note'];
  const SNAPSHOT_FIELDS = ['productId', 'material', 'specification', 'hardness', 'color',
    'dimensions', 'packageMethod', 'qtyPerCarton', 'grossWeight', 'netWeight',
    'cartonDimensions', 'docDescription', 'image', 'detailImage'];
  TD._currentCustomerId = '';

  TD.serializeOrderLine = function (line) {
    return JSON.stringify(Object.fromEntries(TD.LINE_FIELDS.map((f) => [f, line[f] == null ? '' : line[f]])));
  };
  TD.parseOrderLine = function (text) {
    const value = String(text || '').trim();
    if (value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) { /* fall through */ }
    }
    const [name, model, qty, unit, price, hsCode, origin] = value.split('|').map((p) => p.trim());
    return { name, model, qty, unit, price, hsCode, origin };
  };

  // ------------------------------------------------- multi-term price options
  // ONE source of truth: the hidden #priceOptions textarea holds the whole
  // scheme list. Step 2 is the ONLY editor (add/remove scheme, per-line unit
  // prices, place / freight / remarks). Step 3 shows a read-only review plus
  // tooling and compliance. There is no second editable grid and no free-text
  // "quantity tier": quantities belong to the product lines, so a scheme can
  // never disagree with the quantities or amounts typed in step 2.
  TD.TERM_OPTION_META = ['incoterm', 'place', 'freight', 'note'];

  TD.currentSchemes = function () {
    const ta = document.getElementById('priceOptions');
    if (!ta) return [];
    let rows = [];
    try { const v = JSON.parse(ta.value || '[]'); if (Array.isArray(v)) rows = v; } catch (e) { rows = []; }
    return rows;
  };
  TD.writeSchemes = function (rows) {
    const ta = document.getElementById('priceOptions');
    if (ta) ta.value = JSON.stringify(rows || []);
  };
  TD.schemeNormalized = function (rows, j) {
    return TD.priceOptions({ priceOptions: [rows[j] || {}] })[0] || null;
  };

  /** Snapshot of the current item grid, used for all term-price maths. */
  TD.currentFormLines = function () {
    const ta = document.getElementById('items');
    return String(ta ? ta.value : '').split('\n').filter(Boolean).map(TD.parseOrderLine);
  };

  TD.readPriceOptions = function () {
    return TD.priceOptions({ priceOptions: TD.currentSchemes() });
  };

  /** Load an order's schemes into the editor. Old r6 rows carrying only a
   *  hand-filled total are kept as-is (their total stays authoritative). */
  TD.loadPriceOptions = function (text) {
    let rows = [];
    try { const v = JSON.parse(String(text || '[]')); if (Array.isArray(v)) rows = v; } catch (e) { rows = []; }
    TD.writeSchemes(rows);
    TD.renderTermPriceMatrix();
    TD.renderTermPriceTotals();
    TD.renderPriceOptionsReview();
  };

  /** Keep every scheme's stored total in sync with its per-line prices, then
   *  mirror the numbers into the matrix footer, the summary and the step-3
   *  read-only review. Never rebuilds the matrix while a cell has focus:
   *  it only rebuilds when the number of product lines has changed. */
  TD.renderTermPriceTotals = function () {
    const host = document.getElementById('termPriceMatrix');
    const lines = TD.currentFormLines();
    if (host && host.dataset.lineCount !== String(lines.length)) {
      TD.renderTermPriceMatrix();
      return;
    }
    const rows = TD.currentSchemes();
    let changed = false;
    rows.forEach(function (r, j) {
      const o = TD.schemeNormalized(rows, j);
      if (!o) return;
      const computed = TD.termOptionTotal(lines, o);
      if (computed == null) return;               // old hand-filled total: keep it
      const v = Math.round(computed * 100) / 100;
      if (TD.num(r.total) !== v) { r.total = v; changed = true; }
    });
    if (changed) TD.writeSchemes(rows);
    if (host) host.querySelectorAll('[data-total]').forEach(function (cell) {
      const j = Number(cell.dataset.total), o = TD.schemeNormalized(rows, j);
      if (!o) { cell.textContent = '—'; return; }
      const computed = TD.termOptionTotal(lines, o);
      cell.textContent = TD.money(computed != null ? computed : TD.num(o.total));
    });
    const summary = document.getElementById('termPriceTotals');
    if (summary) {
      if (!rows.length) summary.textContent = '';
      else {
        const cur = TD.val('currency') || '';
        summary.textContent = '自动汇总：' + rows.map(function (r, j) {
          const o = TD.schemeNormalized(rows, j) || {};
          const computed = TD.termOptionTotal(lines, o);
          const missing = TD.termOptionMissingCount(lines, o);
          return [o.incoterm, o.place].filter(Boolean).join(' ') + ' ' + cur + ' ' +
            TD.money(computed != null ? computed : TD.num(o.total)) +
            (missing ? '（' + missing + ' 行留空，按主价计入）' : '');
        }).join('　|　');
      }
    }
    TD.renderPriceOptionsReview();
  };
  // Kept as an alias: syncItemsTextarea and older callers use this name.
  TD.refreshPriceOptionTotals = TD.renderTermPriceTotals;

  /** Step 3 is read-only. This small recap tells the user where the numbers
   *  come from without offering a second set of inputs that could drift. */
  TD.renderPriceOptionsReview = function () {
    const host = document.getElementById('priceOptionsReview');
    if (!host) return;
    const lines = TD.currentFormLines();
    const rows = TD.currentSchemes();
    if (!rows.length) {
      host.innerHTML = '<p class="sub">本单未设置多术语方案。客户要 FOB / DAP 比价时，请回第 ② 步「按贸易术语逐项报价」添加；这里只核对，不重复录入。</p>';
      return;
    }
    const cur = TD.val('currency') || '';
    const qtyText = lines.length
      ? lines.map(function (l) { return TD.money(TD.num(l.qty), 0); }).join(' + ')
      : '—';
    let html = '<table class="table"><thead><tr><th>贸易术语</th><th>地点</th>' +
      '<th>产品数量（按第 ② 步）</th><th>整单总价</th><th>运费 / 备注</th></tr></thead><tbody>';
    rows.forEach(function (r, j) {
      const o = TD.schemeNormalized(rows, j) || {};
      const computed = TD.termOptionTotal(lines, o);
      const total = computed != null ? computed : TD.num(o.total);
      const meta = [o.freight, o.note].filter(function (x) {
        return x && !/^base$/i.test(x);
      }).join(' · ') || '—';
      html += '<tr><td><b>' + E(o.incoterm || '—') + '</b></td><td>' + E(o.place || '—') + '</td>' +
        '<td>' + E(qtyText) + '</td><td>' + E(cur + ' ' + TD.money(total)) + '</td>' +
        '<td>' + E(meta) + '</td></tr>';
    });
    html += '</tbody></table>';
    host.innerHTML = html;
  };

  // ------------------------------------------- step-2 per-line term price matrix
  // A formal document carries ONE Incoterm. This grid is the single editor for
  // all schemes: one row per product, one column per trade term. It also owns
  // the per-scheme place / freight / remarks fields. Nothing here is printed
  // as a multi-term item table; Quotation prints a comparison block instead.
  TD.renderTermPriceMatrix = function () {
    const host = document.getElementById('termPriceMatrix');
    if (!host) return;
    const lines = TD.currentFormLines();
    const rows = TD.currentSchemes();
    host.dataset.lineCount = String(lines.length);
    if (!lines.length) {
      host.innerHTML = '<p class="sub">先在上方添加产品行，再在这里为每个贸易术语填单价。</p>';
      TD.renderTermPriceTotals();
      return;
    }
    if (!rows.length) {
      host.innerHTML = '<p class="sub">还没有报价方案。选一个贸易术语，点「＋ 添加术语方案」即可新增一列；首列会自动用当前主术语生成。</p>';
      TD.renderTermPriceTotals();
      return;
    }
    const primary = TD.val('incoterm') || 'FOB';
    let baseMarked = false;
    const cols = rows.map(function (r, j) {
      const isBase = !baseMarked && String(r.incoterm || '').trim() === primary;
      if (isBase) baseMarked = true;
      return { r: r, j: j, isBase: isBase };
    });
    const termOptions = function (sel) {
      return TD.INCOTERMS.map(function (t) {
        return '<option value="' + E(t) + '"' + (sel === t ? ' selected' : '') + '>' + E(t) + '</option>';
      }).join('');
    };
    let html = '<table class="termgrid"><thead><tr><th>产品 / 型号</th><th>数量</th>' +
      cols.map(function (c) {
        return '<th><select data-meta="incoterm" data-opt="' + c.j + '" aria-label="贸易术语">' +
          termOptions(String(c.r.incoterm || '')) + '</select>' +
          (c.isBase ? '<small>(BASE) 主术语</small>' : '<small>第 ' + (c.j + 1) + ' 方案</small>') +
          '<button type="button" class="btn danger" data-del="' + c.j + '" title="删除此术语方案">×</button></th>';
      }).join('') + '</tr></thead><tbody>';
    lines.forEach(function (l, i) {
      html += '<tr><td>' + E(l.name || ('产品 ' + (i + 1))) +
        (l.model ? ' <small>' + E(l.model) + '</small>' : '') + '</td>' +
        '<td class="num">' + E(TD.money(TD.num(l.qty), 0)) + '</td>' +
        cols.map(function (c) {
          if (c.isBase) return '<td class="num base">' + E(TD.formatUnitPrice(TD.num(l.price))) +
            '<small>主术语基准价</small></td>';
          const v = (c.r.unitPrices || [])[i];
          return '<td><input type="number" min="0" step="0.0001" data-opt="' + c.j +
            '" data-line="' + i + '" placeholder="留空=主价" value="' + E(v == null || v === '' ? '' : v) + '"></td>';
        }).join('') + '</tr>';
    });
    html += '</tbody><tfoot>' +
      '<tr><td colspan="2">地点 / Named place</td>' + cols.map(function (c) {
        return '<td><input data-meta="place" data-opt="' + c.j + '" placeholder="Shanghai / Milano" value="' +
          E(c.r.place || '') + '"></td>';
      }).join('') + '</tr>' +
      '<tr><td colspan="2">运费责任 / Freight</td>' + cols.map(function (c) {
        return '<td><input data-meta="freight" data-opt="' + c.j + '" placeholder="Freight prepaid by seller" value="' +
          E(c.r.freight || '') + '"></td>';
      }).join('') + '</tr>' +
      '<tr><td colspan="2">备注 / Remarks</td>' + cols.map(function (c) {
        return '<td><input data-meta="note" data-opt="' + c.j + '" placeholder="Duties included" value="' +
          E(c.r.note || '') + '"></td>';
      }).join('') + '</tr>' +
      '<tr><td colspan="2"><b>整单总价（自动汇总）</b></td>' +
      cols.map(function (c) { return '<td class="num" data-total="' + c.j + '">—</td>'; }).join('') +
      '</tr></tfoot></table>';
    host.innerHTML = html;

    host.querySelectorAll('input[data-line]').forEach(function (input) {
      input.addEventListener('input', function () {
        const j = Number(input.dataset.opt), i = Number(input.dataset.line);
        const rs = TD.currentSchemes();
        if (!rs[j]) return;
        if (!Array.isArray(rs[j].unitPrices)) rs[j].unitPrices = [];
        rs[j].unitPrices[i] = input.value === '' ? '' : TD.num(input.value);
        TD.writeSchemes(rs);
        TD.refreshPriceOptionTotals();
      });
    });
    host.querySelectorAll('[data-meta]').forEach(function (el) {
      const apply = function () {
        const j = Number(el.dataset.opt), f = el.dataset.meta;
        const rs = TD.currentSchemes();
        if (!rs[j]) return;
        rs[j][f] = String(el.value || '').trim();
        if (f === 'incoterm' && !String(rs[j].freight || '').trim()) {
          rs[j].freight = TD.sellerPaysFreight(el.value) ? 'Freight prepaid by seller' : '';
          const fr = host.querySelector('input[data-meta="freight"][data-opt="' + j + '"]');
          if (fr) fr.value = rs[j].freight;
        }
        TD.writeSchemes(rs);
        TD.refreshPriceOptionTotals();
      };
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });
    host.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { TD.removeTermPriceColumn(Number(btn.dataset.del)); });
    });
    TD.renderTermPriceTotals();
  };

  /** Create the BASE scheme from the current primary term and line total. */
  TD.fillPriceOptionsFromBase = function () {
    if (TD.currentSchemes().length) return;
    const lines = TD.currentFormLines();
    const total = lines.reduce(function (s, l) { return s + TD.num(l.qty) * TD.num(l.price); }, 0);
    TD.writeSchemes([{
      incoterm: TD.val('incoterm') || 'FOB',
      place: TD.val('incotermPlace') || '',
      total: Math.round(total * 100) / 100,
      freight: '', note: '', unitPrices: [],
    }]);
    TD.renderTermPriceMatrix();
    TD.renderPriceOptionsReview();
  };

  TD.removeTermPriceColumn = function (j) {
    const rows = TD.currentSchemes();
    if (!rows[j]) return;
    rows.splice(j, 1);
    TD.writeSchemes(rows);
    TD.renderTermPriceMatrix();
    TD.renderPriceOptionsReview();
  };

  /** Add one trade-term column, pre-filled with the base prices so the new
   *  scheme's total is always derived from real per-line prices. */
  TD.addTermPriceColumn = function () {
    const sel = document.getElementById('newTermSelect');
    const term = sel ? String(sel.value || '').trim() : '';
    if (!term) return;
    TD.fillPriceOptionsFromBase();
    const rows = TD.currentSchemes();
    if (rows.some(function (r) {
      return String(r.incoterm || '').trim() === term && !String(r.place || '').trim();
    })) {
      TD.alert('已有 ' + term + ' 方案；如需同一术语报不同地点，请先在上方该列填「地点」再新增，或在第 ③ 步核对区确认已有方案。');
      return;
    }
    const lines = TD.currentFormLines();
    const total = lines.reduce(function (s, l) { return s + TD.num(l.qty) * TD.num(l.price); }, 0);
    rows.push({
      incoterm: term, place: '',
      total: Math.round(total * 100) / 100,
      freight: TD.sellerPaysFreight(term) ? 'Freight prepaid by seller' : '',
      note: '',
      unitPrices: lines.map(function (l) { return TD.num(l.price); }),
    });
    TD.writeSchemes(rows);
    TD.renderTermPriceMatrix();
    TD.renderPriceOptionsReview();
  };

  /** Copy the primary unit price into every blank cell, as a starting point
   *  for adding freight / duty on top. */
  TD.fillTermPricesWithBase = function () {
    const lines = TD.currentFormLines();
    const rows = TD.currentSchemes();
    if (!lines.length || !rows.length) return;
    const primary = TD.val('incoterm') || 'FOB';
    let baseMarked = false;
    rows.forEach(function (r) {
      const isBase = !baseMarked && String(r.incoterm || '').trim() === primary;
      if (isBase) { baseMarked = true; return; }
      if (!Array.isArray(r.unitPrices)) r.unitPrices = [];
      lines.forEach(function (l, i) {
        if (r.unitPrices[i] === '' || r.unitPrices[i] == null) r.unitPrices[i] = TD.num(l.price);
      });
    });
    TD.writeSchemes(rows);
    TD.refreshPriceOptionTotals();
  };
  TD.setDocKinds = function (kinds) {
    document.querySelectorAll('#docKinds .doc').forEach(function (el) {
      el.classList.toggle('sel', (kinds || []).indexOf(el.dataset.kind) >= 0);
    });
  };

  // ------------------------------------------------------------- setup
  TD.initOrderForm = function () {
    const currency = document.getElementById('currency');
    const refCurrency = document.getElementById('refCurrency');
    if (currency) currency.innerHTML = TD.options(TD.CURRENCIES);
    if (refCurrency) refCurrency.innerHTML = '<option value="">不显示</option>' + TD.options(TD.CURRENCIES);
    const incoterm = document.getElementById('incoterm');
    if (incoterm) {
      incoterm.innerHTML = TD.options(TD.INCOTERMS);
      // The primary term decides which step-2 column is the non-editable BASE
      // column; changing it must re-mark the matrix immediately.
      incoterm.addEventListener('change', function () {
        if (TD.renderTermPriceMatrix) TD.renderTermPriceMatrix();
        if (TD.renderPriceOptionsReview) TD.renderPriceOptionsReview();
      });
    }
    const newTerm = document.getElementById('newTermSelect');
    if (newTerm) newTerm.innerHTML = TD.options(TD.INCOTERMS);
    const state = document.getElementById('state');
    if (state) state.innerHTML = TD.options(TD.STAGES);
    const lang = document.getElementById('language');
    if (lang) lang.innerHTML = TD.options(TD.LANGUAGES.map((l) => ({ value: l.code, label: l.label })));
    const theme = document.getElementById('theme');
    if (theme) theme.innerHTML = TD.options(TD.THEMES.map((t) => ({ value: t.id, label: t.name })));
    const docs = document.getElementById('docKinds');
    if (docs) {
      docs.innerHTML = TD.DOC_KINDS.map((k, i) =>
        '<span class="doc' + (i === 0 ? ' sel' : '') + '" data-kind="' + E(k) + '">' + E(k) + '</span>').join('');
      docs.addEventListener('click', (event) => {
        const el = event.target.closest('.doc');
        if (el) el.classList.toggle('sel');
      });
    }
    const buyer = document.getElementById('buyer');
    if (buyer) buyer.addEventListener('change', TD.onBuyerChange);
    TD.bindAccountSelectors();
    TD.refreshProductDatalist();
  };

  TD.selectedDocKinds = function () {
    return [...document.querySelectorAll('#docKinds .doc.sel')].map((el) => el.dataset.kind);
  };

  TD.refreshProductDatalist = function () {
    const list = document.getElementById('productList');
    if (list) list.innerHTML = TD.get('products').map((p) => '<option value="' + E(p.name) + '">' + E(p.model || '') + '</option>').join('');
    const units = document.getElementById('unitList');
    if (units) {
      const all = new Set(['PCS', 'KG', 'SET', 'M', 'M2', 'PC', 'EA', 'LOT']);
      TD.get('products').forEach((p) => {
        String(p.unit || '').split(/[,，/]/).map((x) => x.trim()).filter(Boolean).forEach((u) => all.add(u));
        String(p.unitOptions || '').split(/[,，/]/).map((x) => x.trim()).filter(Boolean).forEach((u) => all.add(u));
      });
      units.innerHTML = [...all].map((u) => '<option value="' + E(u) + '">').join('');
    }
  };

  // ------------------------------------------------------------- customer pricing
  TD.customerPriceFor = function (product, currency) {
    const customer = TD.get('customers').find((c) => c.id === TD._currentCustomerId);
    const today = TD.today();
    if (customer && Array.isArray(customer.prices)) {
      const hit = customer.prices.find((row) => {
        const sameProduct = (row.productId && row.productId === product.id) ||
          (!row.productId && row.model && row.model === product.model);
        const sameCurrency = !row.currency || row.currency === currency;
        const from = row.validFrom || '0000-00-00';
        const until = row.validUntil || '9999-12-31';
        return sameProduct && sameCurrency && today >= from && today <= until;
      });
      if (hit && Number.isFinite(Number(hit.price))) {
        return { price: Number(hit.price), source: 'customer', label: '客户专属价' };
      }
    }
    return { price: TD.num(product.price), source: 'master', label: '产品档案价' };
  };

  TD.onBuyerChange = function () {
    const name = TD.val('buyer');
    const customer = TD.get('customers').find((c) => c.name === name);
    if (!customer) { TD._currentCustomerId = ''; TD.applyCustomerPrices(); TD.updateSellerWarnings(); return; }
    TD._currentCustomerId = customer.id || '';
    // Assign unconditionally: missing fields must clear, never inherit the previous customer.
    TD.setVal('country', customer.country || '');
    TD.setVal('city', customer.city || '');
    TD.setVal('buyerAddress', customer.address || '');
    TD.setVal('shipTo', customer.shippingAddress || '');
    TD.setVal('contact', customer.contact || '');
    TD.setVal('email', customer.email || '');
    TD.setVal('buyerPhone', customer.phone || '');
    TD.setVal('buyerTaxId', customer.taxId || '');
    TD.setVal('payment', customer.payment || TD.appSettings().defaultPayment);
    TD.setVal('incoterm', customer.incoterm || TD.appSettings().defaultIncoterm);
    if (customer.defaultCurrency) TD.setVal('currency', customer.defaultCurrency);
    TD.applyCustomerPrices();
    TD.refreshAccountOptions();
    TD.updateSellerWarnings();
  };

  TD.applyCustomerPrices = function () {
    const currency = TD.val('currency') || 'USD';
    for (const row of document.querySelectorAll('#itemGrid .itemrow')) {
      if (row.querySelector('[data-f="priceSource"]').value === 'manual') continue;
      const productId = row.querySelector('[data-f="productId"]').value;
      const product = TD.get('products').find((p) => p.id === productId);
      if (!product) continue;
      const resolved = TD.customerPriceFor(product, currency);
      row.querySelector('[data-f="price"]').value = resolved.price;
      row.querySelector('[data-f="priceSource"]').value = resolved.source;
      const detail = row.querySelector('.itemdetails');
      if (detail && resolved.source === 'customer') detail.dataset.price = '客户专属价';
    }
    TD.syncItemsTextarea();
  };

  // ------------------------------------------------------------- item grid
  TD.addItemRow = function (data) {
    data = data || {};
    const grid = document.getElementById('itemGrid');
    if (!grid) return;
    const row = document.createElement('div');
    row.className = 'itemrow';
    row.innerHTML =
      '<input data-f="name" list="productList" placeholder="品名">' +
      '<input data-f="model" placeholder="型号">' +
      '<input data-f="qty" type="number" min="0" step="any" placeholder="数量">' +
      '<input data-f="unit" list="unitList" placeholder="单位">' +
      '<input data-f="price" type="number" min="0" step="0.0001" placeholder="单价">' +
      '<input data-f="moq" type="number" min="0" step="any" placeholder="MOQ">' +
      '<span class="itemamount">0.00</span>' +
      '<button type="button" class="btn danger" aria-label="删除此行">×</button>' +
      '<span class="itemdetails"></span>' +
      TD.LINE_FIELDS.filter((f) => !['name', 'model', 'qty', 'unit', 'price', 'moq'].includes(f))
        .map((f) => '<input data-f="' + f + '" type="hidden">').join('');
    for (const input of row.querySelectorAll('[data-f]')) {
      const f = input.dataset.f;
      input.value = f === 'productId' ? (data.productId || data.id || '') : (data[f] == null ? '' : data[f]);
    }
    if (!row.querySelector('[data-f="unit"]').value) row.querySelector('[data-f="unit"]').value = 'PCS';
    if (!row.querySelector('[data-f="priceSource"]').value) row.querySelector('[data-f="priceSource"]').value = data.productId ? 'master' : 'manual';

    const updateDetails = () => {
      const hidden = (f) => row.querySelector('[data-f="' + f + '"]').value;
      const bits = [hidden('material'), hidden('specification'),
        hidden('hardness') && 'Shore A ' + hidden('hardness'), hidden('color'), hidden('dimensions')].filter(Boolean);
      const source = hidden('priceSource');
      const priceTag = source === 'customer' ? ' · 客户专属价' : source === 'master' ? ' · 档案价' : '';
      row.querySelector('.itemdetails').textContent = bits.length
        ? bits.join(' · ') + priceTag
        : (hidden('productId') ? '产品档案快照已保存' + priceTag : '未关联产品档案' + priceTag);
    };
    updateDetails();

    row.querySelector('button').onclick = () => { row.remove(); TD.syncItemsTextarea(); };
    row.addEventListener('input', (event) => {
      if (event.target.dataset.f === 'price') row.querySelector('[data-f="priceSource"]').value = 'manual';
      TD.syncItemsTextarea();
      updateDetails();
    });
    const fillFromProduct = (product) => {
      if (!product) return;
      const resolved = TD.customerPriceFor(product, TD.val('currency') || 'USD');
      const values = {
        name: product.name, model: product.model || '', unit: product.unit || 'PCS',
        price: resolved.price, priceSource: resolved.source,
        hsCode: product.hsCode || '', origin: product.origin || 'China',
        productId: product.id, material: product.material || '', specification: product.specification || '',
        hardness: product.hardness || '', color: product.color || '', dimensions: product.dimensions || '',
        packageMethod: product.packageMethod || '', qtyPerCarton: product.qtyPerCarton ?? '',
        grossWeight: product.grossWeight ?? '', netWeight: product.netWeight ?? '',
        cartonDimensions: product.cartonDimensions || '', docDescription: product.docDescription || '',
        image: product.image || '', detailImage: product.detailImage || '',
        moq: product.moq ?? '', unitGrossWeight: product.unitGrossWeight ?? '',
        unitNetWeight: product.unitNetWeight ?? '', unitCbm: product.unitCbm ?? '',
      };
      for (const [f, value] of Object.entries(values)) {
        const input = row.querySelector('[data-f="' + f + '"]');
        if (input) input.value = value == null ? '' : value;
      }
      updateDetails();
      TD.syncItemsTextarea();
    };
    row.querySelector('[data-f="name"]').addEventListener('change', () => {
      const name = row.querySelector('[data-f="name"]').value.trim();
      const hits = TD.get('products').filter((p) => p.name === name);
      if (hits.length === 1) fillFromProduct(hits[0]);
    });
    row.querySelector('[data-f="model"]').addEventListener('change', () => {
      const model = row.querySelector('[data-f="model"]').value.trim();
      const hit = model && TD.get('products').find((p) => String(p.model || '').trim() === model);
      if (hit) fillFromProduct(hit);
    });
    grid.appendChild(row);
    TD.syncItemsTextarea();
    return row;
  };

  TD.syncItemsTextarea = function () {
    const grid = document.getElementById('itemGrid');
    const textarea = document.getElementById('items');
    if (!grid || !textarea) return;
    const rows = [...grid.querySelectorAll('.itemrow')].map((row) => {
      const item = {};
      row.querySelectorAll('[data-f]').forEach((input) => { item[input.dataset.f] = input.value.trim(); });
      const qty = TD.num(item.qty), per = TD.num(item.qtyPerCarton);
      const unitGW = TD.num(item.unitGrossWeight) || (per > 0 ? TD.num(item.grossWeight) / per : 0);
      const unitNW = TD.num(item.unitNetWeight) || (per > 0 ? TD.num(item.netWeight) / per : 0);
      const unitCbm = TD.num(item.unitCbm) || (per > 0 ? TD.parseDimensions(item.cartonDimensions).cbm / per : 0);
      item.totalGW = String(Math.round(qty * unitGW * 1000) / 1000);
      item.totalNW = String(Math.round(qty * unitNW * 1000) / 1000);
      item.totalVOL = String(Math.round(qty * unitCbm * 100000) / 100000);
      const amount = qty * TD.num(item.price);
      row.querySelector('.itemamount').textContent = TD.money(amount);
      return item;
    }).filter((item) => item.name || item.model);
    textarea.value = rows.map(TD.serializeOrderLine).join('\n');
    const total = rows.reduce((sum, item) => sum + TD.num(item.qty) * TD.num(item.price), 0);
    const label = document.getElementById('itemsTotal');
    if (label) label.textContent = '产品行：' + rows.length + '　订单金额：' + (TD.val('currency') || '') + ' ' + TD.money(total);
    TD.updateSellerWarnings();
    if (TD.refreshPriceOptionTotals) TD.refreshPriceOptionTotals();
  };

  TD.loadItemGrid = function (text) {
    const grid = document.getElementById('itemGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const lines = String(text || '').split('\n').filter(Boolean);
    if (!lines.length) { TD.addItemRow(); return; }
    for (const line of lines) TD.addItemRow(TD.parseOrderLine(line));
  };

  TD.appendProductLine = function () {
    const products = TD.get('products');
    if (!products.length) { TD.alert('产品库为空，请先建立产品档案。'); return; }
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="productPicker" style="display:flex;z-index:50"><div class="modal" style="width:min(820px,96vw)">' +
      '<div class="panelhead"><h2>从产品库添加</h2><button class="btn" data-close>关闭</button></div>' +
      '<p class="sub">按名称、型号、材料或规格搜索。选客户后自动取客户专属价，本单可手动覆盖且不改产品主档。</p>' +
      '<input id="ppSearch" type="search" placeholder="搜索产品名称 / 型号 / FKM / 规格" autocomplete="off">' +
      '<div id="ppResults" style="display:grid;gap:8px;max-height:44vh;overflow:auto;margin:12px 0"></div>' +
      '<div id="ppSelection" hidden style="border-top:1px solid #dce5ed;padding-top:14px">' +
      '<div id="ppChosen" class="sub" style="margin-bottom:9px"></div>' +
      '<div class="form"><label>订货数量<input id="ppQty" type="number" min="0" step="any" value="1"></label>' +
      '<label>本单单价<input id="ppPrice" type="number" min="0" step="any"></label></div></div>' +
      '<div class="modalfoot"><button class="btn" data-close>取消</button><button class="btn primary" id="ppAdd" disabled>添加到订单</button></div>' +
      '</div></div>';
    const overlay = document.getElementById('productPicker');
    const search = document.getElementById('ppSearch');
    const results = document.getElementById('ppResults');
    let selectedId = '';
    const currency = TD.val('currency') || 'USD';
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const matched = products.filter((p) => [p.name, p.model, p.material, p.specification, p.color,
        p.hardness, p.dimensions].join(' ').toLowerCase().includes(q));
      results.innerHTML = matched.map((p) => {
        const price = TD.customerPriceFor(p, currency);
        return '<button type="button" class="card" data-product="' + E(p.id) + '" style="text-align:left;cursor:pointer;padding:11px;border:1px solid ' +
          (p.id === selectedId ? '#2b6eab' : '#dce5ed') + '"><b>' + E(p.name) + '</b><br><span class="sub">型号 ' + E(p.model || '—') +
          ' · 材料 ' + E(p.material || '—') + ' · 单位 ' + E(p.unit || 'PCS') + ' · ' + E(price.label) + ' ' + TD.money(price.price) + ' ' + E(currency) + '</span></button>';
      }).join('') || '<p class="sub">没有匹配的产品。</p>';
    };
    results.addEventListener('click', (event) => {
      const button = event.target.closest('[data-product]');
      if (!button) return;
      const product = products.find((p) => p.id === button.dataset.product);
      if (!product) return;
      selectedId = product.id;
      const price = TD.customerPriceFor(product, currency);
      document.getElementById('ppChosen').textContent = product.name + (product.model ? ' · ' + product.model : '') + ' · ' + price.label;
      document.getElementById('ppQty').value = '1';
      document.getElementById('ppPrice').value = String(price.price);
      document.getElementById('ppSelection').hidden = false;
      document.getElementById('ppAdd').disabled = false;
      render();
    });
    search.addEventListener('input', render);
    document.getElementById('ppAdd').addEventListener('click', () => {
      const product = products.find((p) => p.id === selectedId);
      const qty = Number(document.getElementById('ppQty').value);
      const price = Number(document.getElementById('ppPrice').value);
      if (!product) return;
      if (!(qty > 0)) { TD.alert('请填写大于零的订货数量。'); return; }
      if (!Number.isFinite(price) || price < 0) { TD.alert('请填写有效的本单单价。'); return; }
      const resolved = TD.customerPriceFor(product, currency);
      TD.addItemRow(Object.assign({}, product, {
        productId: product.id, qty, price,
        priceSource: Math.abs(price - resolved.price) < 1e-9 ? resolved.source : 'manual',
      }));
      host.innerHTML = '';
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) host.innerHTML = '';
    });
    render(); search.focus();
  };

  // ------------------------------------------------------------- carton grid
  function splitCarton(text) {
    const p = String(text || '').split('|').map((x) => x.trim());
    if (p.length >= 7) return { no: p[0], model: p[1], description: p[2], qty: p[3], gross: p[4], net: p[5], dim: p[6],
      mark: p[7] || '', packType: p[8] || '', pkgUnit: p[9] || '', unit: p[10] || '' };
    return { no: p[0], model: '', description: p[1] || '', qty: p[2], gross: p[3], net: p[4], dim: p[5] || '',
      mark: '', packType: '', pkgUnit: '', unit: '' };
  }

  TD.addCartonRow = function (data) {
    data = data || {};
    const grid = document.getElementById('cartonGrid');
    if (!grid) return;
    const row = document.createElement('div');
    row.className = 'cartonrow';
    row.innerHTML =
      '<input data-cf="no" placeholder="箱号">' +
      '<input data-cf="model" placeholder="型号">' +
      '<input data-cf="description" placeholder="产品描述">' +
      '<input data-cf="qty" type="number" min="0" step="any" placeholder="数量">' +
      '<input data-cf="gross" type="number" min="0" step="0.001" placeholder="整箱毛重 kg">' +
      '<input data-cf="net" type="number" min="0" step="0.001" placeholder="产品净重 kg">' +
      '<input data-cf="dim" placeholder="箱规 40x30x25">' +
      '<input data-cf="mark" placeholder="本箱唛头 / Shipping Mark">' +
      '<input data-cf="packType" type="hidden"><input data-cf="pkgUnit" type="hidden"><input data-cf="unit" type="hidden">' +
      '<button type="button" class="btn danger" aria-label="删除箱内产品">×</button>';
    for (const input of row.querySelectorAll('[data-cf]')) input.value = data[input.dataset.cf] == null ? '' : data[input.dataset.cf];
    if (!row.querySelector('[data-cf="packType"]').value) row.querySelector('[data-cf="packType"]').value = 'Carton';
    if (!row.querySelector('[data-cf="pkgUnit"]').value) row.querySelector('[data-cf="pkgUnit"]').value = 'Ctns';
    row.querySelector('button').onclick = () => { row.remove(); TD.syncCartonsTextarea(); };
    row.addEventListener('input', TD.syncCartonsTextarea);
    grid.appendChild(row);
    TD.syncCartonsTextarea();
  };

  TD.syncCartonsTextarea = function () {
    const grid = document.getElementById('cartonGrid');
    const textarea = document.getElementById('cartons');
    if (!grid || !textarea) return;
    const rows = [...grid.querySelectorAll('.cartonrow')].map((row) => {
      const item = {};
      row.querySelectorAll('[data-cf]').forEach((input) => { item[input.dataset.cf] = input.value.trim(); });
      return item;
    }).filter((item) => item.no || item.description || item.model);
    textarea.value = rows.map((r) => [r.no, r.model, r.description, r.qty, r.gross, r.net, r.dim,
      r.mark, r.packType, r.pkgUnit, r.unit].join(' | ')).join('\n');
    const boxes = new Set(rows.map((r) => r.no).filter(Boolean));
    const parsed = TD.parseCartons(textarea.value, TD.currentFormLines());
    const label = document.getElementById('cartonSummary');
    if (label) label.textContent = '产品装箱行：' + rows.length + '　包装箱：' + boxes.size +
      '　装箱数量：' + parsed.totals.qty +
      (parsed.totals.pendingGross || parsed.totals.pendingCbm
        ? '　待核对箱：' + Math.max(parsed.totals.pendingGross, parsed.totals.pendingCbm) : '');
  };

  TD.loadCartonGrid = function (text) {
    const grid = document.getElementById('cartonGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const rows = String(text || '').split('\n').filter(Boolean);
    for (const line of rows) TD.addCartonRow(splitCarton(line));
    TD.syncCartonsTextarea();
  };

  TD.currentFormLines = function () {
    const textarea = document.getElementById('items');
    return String(textarea ? textarea.value : '').split('\n').filter(Boolean).map(TD.parseOrderLine);
  };

  TD.autoBuildPacking = function () {
    TD.syncItemsTextarea();
    const lines = TD.currentFormLines();
    if (!lines.length) { TD.alert('请先录入产品行和订货数量。'); return; }
    const out = [], missing = [];
    let cartonNo = 1;
    for (const item of lines) {
      const qty = TD.num(item.qty);
      const per = TD.num(item.qtyPerCarton);
      const dim = String(item.cartonDimensions || '').trim();
      const gross = TD.num(item.grossWeight);
      const net = TD.num(item.netWeight);
      if (!(per > 0) || !dim || !TD.parseDimensions(dim).valid) { missing.push(item.model || item.name); continue; }
      const description = [item.name, item.model, item.material, item.specification,
        item.hardness ? 'Shore A ' + item.hardness : '', item.color].filter(Boolean).join(' · ');
      const count = Math.ceil(qty / per);
      for (let i = 0; i < count; i++) {
        const inBox = Math.min(per, qty - i * per);
        const ratio = inBox / per;
        out.push([cartonNo++, item.model || '', description, inBox,
          (gross * ratio).toFixed(3), (net * ratio).toFixed(3), dim].join(' | '));
      }
    }
    if (missing.length) {
      TD.alert('以下订单行缺少有效的每箱数量或箱规，无法生成装箱草案：\n' + [...new Set(missing)].join('、') +
        '\n请补全产品档案或手动录入装箱明细。');
      return;
    }
    TD.setVal('cartons', out.join('\n'));
    TD.loadCartonGrid(out.join('\n'));
    TD.setChecked('packingConfirmed', false);
    TD.alert('已生成 ' + out.length + ' 箱【装箱草案】。\n\n该草案按理论包装参数计算，不是实际发货事实。请核对实装箱数、毛净重与箱规，确认后勾选「已核对实际箱数、毛净重与箱规」。');
  };

  TD.showPackingReport = function () {
    TD.syncItemsTextarea(); TD.syncCartonsTextarea();
    const order = TD.readOrderForm();
    const report = TD.packingReport(order);
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="packReport" style="display:flex;z-index:55"><div class="modal">' +
      '<div class="panelhead"><h2>装箱核对报告</h2><button class="btn" data-close>关闭</button></div>' +
      (report.errors.length ? '<div class="notice error"><ul>' + report.errors.map((x) => '<li>' + E(x) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="notice' + (report.warnings.length ? '' : ' info') + '"><b>提示（' + report.warnings.length + '）</b>' +
      (report.warnings.length ? '<ul>' + report.warnings.map((x) => '<li>' + E(x) + '</li>').join('') + '</ul>' : '<p>没有发现待核对项。</p>') + '</div>' +
      '<h3>逐型号数量核对</h3><div class="tablewrap"><table class="table"><thead><tr><th>型号</th><th>订单</th><th>装箱</th><th>差异</th></tr></thead><tbody>' +
      report.parsed.perModel.map((r) => '<tr><td>' + E(r.key) + (r.unmatched ? ' <span class="badge bad">未匹配</span>' : '') + '</td><td>' + r.ordered +
        '</td><td>' + r.packed + '</td><td>' + (r.diff ? '<span class="badge bad">' + (r.diff > 0 ? '+' : '') + r.diff + '</span>' : '<span class="badge ok">0</span>') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<h3>按箱汇总</h3><div class="tablewrap"><table class="table"><thead><tr><th>箱号</th><th>数量</th><th>毛重 kg</th><th>净重 kg</th><th>CBM</th><th>箱规</th></tr></thead><tbody>' +
      (report.parsed.boxes.map((b) => '<tr><td>' + E(b.no) + '</td><td>' + b.qty + '</td><td>' +
        (b.grossPending ? '<span class="badge bad">待核对</span>' : TD.money(b.gross)) + '</td><td>' + TD.money(b.net) + '</td><td>' +
        (b.dimPending ? '<span class="badge bad">待核对</span>' : b.cbm.toFixed(3)) + '</td><td>' + E(b.dimensions || '—') + '</td></tr>').join('') ||
        '<tr><td colspan="6" class="sub">尚未录入装箱明细。</td></tr>') + '</tbody></table></div>' +
      '<div class="modalfoot"><button class="btn" data-close>返回订单修正</button></div></div></div>';
    const overlay = document.getElementById('packReport');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) host.innerHTML = '';
    });
  };

  // ------------------------------------------------------------- read / write
  TD.readOrderForm = function () {
    TD.syncItemsTextarea();
    TD.syncCartonsTextarea();
    const lines = TD.currentFormLines().map((item) => {
      const line = Object.fromEntries(TD.LINE_FIELDS.map((f) => [f, item[f] == null ? '' : item[f]]));
      line.qty = TD.num(line.qty);
      line.price = TD.num(line.price);
      line.total = Math.round(line.qty * line.price * 10000) / 10000;
      return line;
    });
    // ---- tooling cost is a real charge, not a footnote -------------------
    // Saving an order turns step-3's tooling amount into the LAST item line.
    // That one source of truth feeds Total Amount, amount in words, PI
    // advance, contract value and CI, so the buyer never sees two totals.
    // Re-saving is idempotent: drop the previously generated line first.
    const toolingCost = TD.num(TD.val('toolingCost'));
    const toolingNote = String(TD.val('toolingNote') || '').trim();
    const isToolingName = (line) =>
      /^mould\s*\/\s*tooling cost$/i.test(String(line.name || '').trim());
    const goods = lines.filter((line) => String(line.priceSource || '') !== 'tooling');
    if (toolingCost > 0) {
      const blank = Object.fromEntries(TD.LINE_FIELDS.map((f) => [f, '']));
      const toolingLine = Object.assign(blank, {
        name: 'Mould / Tooling Cost',
        model: '',
        qty: 1,
        unit: 'SET',
        price: toolingCost,
        total: Math.round(toolingCost * 10000) / 10000,
        docDescription: toolingNote ||
          'One-off tooling charge, already included in the total above; not charged again on repeat orders of the same size.',
        priceSource: 'tooling',
      });
      const existing = goods.findIndex(isToolingName);
      if (existing >= 0) {
        const prior = goods[existing].docDescription;
        goods[existing] = Object.assign(goods[existing], toolingLine);
        if (!toolingNote && prior) goods[existing].docDescription = prior;
      } else goods.push(toolingLine);
    }
    const overlay = document.getElementById('overlay');
    const extra = {};
    for (const f of TD.EXTRA_ORDER_FIELDS) extra[f] = TD.val(f);
    for (const f of TD.EXTRA_BOOL_FIELDS) extra[f] = TD.checked(f);
    extra.discountPct = TD.num(extra.discountPct);
    extra.vatPct = TD.num(extra.vatPct);
    const printRefs = {};
    document.querySelectorAll('#printRefs [data-ref]').forEach((el) => { printRefs[el.dataset.ref] = el.checked; });
    extra.printRefs = printRefs;
    // Per-document dates / remarks are edited in the document studio, not in
    // this wizard. Carry them over when an existing order is re-saved; a new
    // or duplicated order starts empty on purpose.
    const editId = overlay.dataset.edit || '';
    const previous = editId ? TD.get('orders').find((o) => o.id === editId) : null;
    extra.docMeta = (previous && previous.docMeta) || {};
    return Object.assign({
      id: overlay.dataset.edit || TD.uid(),
      no: TD.val('no'), date: TD.val('date'), po: TD.val('po'),
      buyer: TD.val('buyer'), customerId: TD._currentCustomerId,
      country: TD.val('country'), city: TD.val('city'),
      buyerAddress: TD.val('buyerAddress'), shipTo: TD.val('shipTo'),
      contact: TD.val('contact'), email: TD.val('email'),
      buyerPhone: TD.val('buyerPhone'), buyerTaxId: TD.val('buyerTaxId'),
      currency: TD.val('currency'), refCurrency: TD.val('refCurrency'),
      fxRate: TD.num(TD.val('fxRate')), fxDate: TD.val('fxDate'),
      incoterm: TD.val('incoterm'), incotermPlace: TD.val('incotermPlace'),
      payment: TD.val('payment'), lead: TD.val('lead'), valid: TD.val('valid'),
      depositPct: TD.num(TD.val('depositPct')),
      shipVia: TD.val('shipVia'), portLoad: TD.val('portLoad'), portDest: TD.val('portDest'),
      entity: TD.val('entity'), entityId: TD.val('entity'), account: TD.val('account'),
      showBank: TD.checked('showBank'), showProductImages: TD.checked('showProductImages'),
      packingConfirmed: TD.checked('packingConfirmed'),
      docNoOverride: TD.val('docNoOverride'),
      cartons: String(document.getElementById('cartons').value || ''),
      notes: TD.val('notes'), state: TD.val('state'),
      priceOptions: TD.readPriceOptions(),
      toolingCost: toolingCost,
      toolingNote: toolingNote,
      lines: goods, total: Math.round(goods.reduce((s, l) => s + l.total, 0) * 10000) / 10000,
    }, extra);
  };

  function fillForm(order) {
    const simple = ['no', 'date', 'po', 'buyer', 'country', 'city', 'buyerAddress', 'shipTo',
      'contact', 'email', 'buyerPhone', 'buyerTaxId', 'currency', 'refCurrency', 'fxRate',
      'fxDate', 'incoterm', 'incotermPlace', 'payment', 'lead', 'valid', 'depositPct',
      'shipVia', 'portLoad', 'portDest', 'notes', 'state', 'docNoOverride']
      .concat(TD.EXTRA_ORDER_FIELDS);
    for (const key of simple) TD.setVal(key, order[key] == null ? '' : order[key]);
    TD.setChecked('showBank', order.showBank !== false);
    TD.setChecked('showProductImages', !!order.showProductImages);
    TD.setChecked('packingConfirmed', !!order.packingConfirmed);
    TD.setVal('language', order.language || 'en');
    TD.setVal('theme', order.theme || 'classicBlue');
    TD.setVal('packingMode', order.packingMode || 'byCarton');
    TD.setChecked('showHS', order.showHS !== false);
    TD.setChecked('showSignature', order.showSignature !== false);
    TD.setChecked('showStamp', order.showStamp === true);
    // Legacy orders have no compact flag: keep their original full output
    // exactly as filed. Only explicitly saved compact orders change.
    TD.setChecked('compact', !!order.compact);
    TD.setChecked('ciForPayment', !!order.ciForPayment);
    for (const f of ['showMOQ', 'showGW', 'showNW', 'showVOL', 'markNone']) TD.setChecked(f, !!order[f]);
    const refs = Object.assign({ invoiceNo: true, contractNo: true, po: true, piNo: true,
      quotationNo: true, lcNo: true, blNo: true, containerNo: true }, order.printRefs || {});
    document.querySelectorAll('#printRefs [data-ref]').forEach((el) => { el.checked = refs[el.dataset.ref] !== false; });
    TD._currentCustomerId = order.customerId || (TD.get('customers').find((c) => c.name === order.buyer) || {}).id || '';
    document.getElementById('buyerlist').innerHTML = TD.get('customers').map((c) => '<option value="' + E(c.name) + '">').join('');
    TD.loadItemGrid((order.lines || []).map(TD.serializeOrderLine).join('\n'));
    TD.loadCartonGrid(order.cartons || '');
    TD.loadPriceOptions(JSON.stringify(order.priceOptions || []));
    TD.setVal('toolingCost', order.toolingCost == null ? '' : order.toolingCost);
    TD.setVal('toolingNote', order.toolingNote || '');
    TD.setDocKinds(TD.stageDocKinds(order.state || '报价中'));
    TD.refreshAccountOptions(order.account, order.entityId || order.entity);
    TD.updateSellerWarnings();
    TD.syncPresetsFromOrder(order);
  }

  TD.openModal = function () {
    const overlay = document.getElementById('overlay');
    delete overlay.dataset.edit;
    document.getElementById('orderModalTitle').textContent = '新建订单 / 报价';
    const cfg = TD.appSettings();
    const form = document.getElementById('orderForm');
    form.querySelectorAll('input,textarea').forEach((el) => { if (el.type !== 'checkbox') el.value = ''; });
    TD.setVal('date', TD.today());
    TD.setVal('fxDate', TD.today());
    let seq = TD.get('orders').length + 1, number;
    do { number = 'TPQ-' + new Date().getFullYear() + '-' + String(seq++).padStart(3, '0'); }
    while (TD.get('orders').some((o) => o.no === number));
    TD.setVal('no', number);
    TD.setVal('currency', 'USD');
    TD.setVal('incoterm', cfg.defaultIncoterm);
    TD.setVal('payment', cfg.defaultPayment);
    TD.setVal('lead', cfg.defaultLead);
    TD.setVal('valid', cfg.defaultValid);
    TD.setVal('depositPct', cfg.defaultDepositPct);
    TD.setVal('state', '报价中');
    TD.setChecked('showBank', cfg.showBankDefault !== false);
    TD.setChecked('showProductImages', !!cfg.showProductImagesDefault);
    TD.setChecked('packingConfirmed', false);
    TD.setVal('language', cfg.defaultLanguage || 'en');
    TD.setVal('theme', cfg.defaultTheme || 'classicBlue');
    TD.setVal('packingMode', 'byCarton');
    TD.setChecked('showMOQ', false);
    TD.setChecked('showGW', false);
    TD.setChecked('showNW', false);
    TD.setChecked('showVOL', false);
    TD.setChecked('showHS', true);
    TD.setChecked('showSignature', true);
    // Default for NEW orders: clean filed-style documents. Old saved orders
    // keep their previous full layout (see fillForm).
    TD.setChecked('showStamp', false);
    TD.setChecked('compact', true);
    TD.setChecked('ciForPayment', false);
    TD.setChecked('markNone', true);
    TD.setVal('discountPct', '0');
    TD.setVal('vatPct', '0');
    document.querySelectorAll('#printRefs [data-ref]').forEach((el) => { el.checked = true; });
    TD._currentCustomerId = '';
    document.getElementById('buyerlist').innerHTML = TD.get('customers').map((c) => '<option value="' + E(c.name) + '">').join('');
    TD.loadItemGrid('');
    TD.loadCartonGrid('');
    TD.loadPriceOptions('[]');
    TD.setVal('toolingCost', '');
    TD.setVal('toolingNote', '');
    TD.setDocKinds(TD.stageDocKinds('报价中'));
    TD.refreshProductDatalist();
    TD.refreshAccountOptions();
    paymentAuto = true;
    TD.syncPresetsFromOrder({ depositPct: cfg.defaultDepositPct, payment: cfg.defaultPayment,
      lead: cfg.defaultLead, valid: cfg.defaultValid, shipVia: '' });
    TD.resetWizard();
    overlay.style.display = 'flex';
    overlay.scrollTop = 0;
  };

  TD.closeModal = function () {
    document.getElementById('overlay').style.display = 'none';
    delete document.getElementById('overlay').dataset.edit;
  };

  TD.edit = function (id) {
    const order = TD.get('orders').find((o) => o.id === id);
    if (!order) return;
    TD.openModal();
    document.getElementById('overlay').dataset.edit = id;
    document.getElementById('orderModalTitle').textContent = '修改订单 ' + order.no;
    fillForm(order);
    document.getElementById('overlay').style.display = 'flex';
  };

  TD.duplicateOrder = function (id) {
    const order = TD.get('orders').find((o) => o.id === id);
    if (!order) return;
    TD.openModal();
    document.getElementById('orderModalTitle').textContent = '复制订单（新单）';
    fillForm(order);
    let seq = TD.get('orders').length + 1, number;
    do { number = 'TPQ-' + new Date().getFullYear() + '-' + String(seq++).padStart(3, '0'); }
    while (TD.get('orders').some((o) => o.no === number));
    TD.setVal('no', number);
    TD.setVal('date', TD.today());
    TD.setVal('po', '');
    TD.setVal('state', '报价中');
    TD.setChecked('packingConfirmed', false);
    // Never carry last order's prices into a copied quote: a stale price sent
    // to a customer is the exact "copy the previous PO and forget to edit it"
    // defect found in the real DSV / commercial invoice samples.
    TD.loadPriceOptions('[]');
    TD.setVal('toolingCost', '');
    TD.setVal('toolingNote', '');
    // A tooling charge belongs to the original order. fillForm() already
    // loaded its generated item line, so drop that line too; otherwise the
    // copy would still bill the previous order's mould.
    TD.loadItemGrid((order.lines || []).filter((l) =>
      String(l.priceSource || '') !== 'tooling' &&
      !/^mould\s*\/\s*tooling cost$/i.test(String(l.name || '').trim()))
      .map(TD.serializeOrderLine).join('\n'));
    TD.setVal('complianceNote', '');
    // Shipment-stage parties are order-specific; never carry them over.
    TD.setVal('consignee', '');
    TD.setVal('notifyParty', '');
    TD.setDocKinds(TD.stageDocKinds('报价中'));
    document.getElementById('overlay').style.display = 'flex';
  };

  TD.saveOrder = function () {
    const order = TD.readOrderForm();
    const problems = [];
    if (!order.no) problems.push('请填写订单 / 报价编号。');
    if (!order.buyer) problems.push('请填写客户公司。');
    if (!TD.contractEntity()) problems.push('出单主体资料缺失，请检查本机主体档案。');
    if (!order.lines.length) problems.push('请至少录入一条产品行。');
    if (order.lines.some((l) => !l.name || !(l.qty > 0) || !(l.price >= 0))) problems.push('存在无效产品行（缺名称、数量非正或单价为负）。');
    if (order.refCurrency && order.refCurrency === order.currency) problems.push('参考币种不能与结算币种相同。');
    if (order.refCurrency && !(order.fxRate > 0)) problems.push('已选参考币种，请填写大于零的参考汇率。');
    if (!(order.depositPct >= 0 && order.depositPct <= 100)) problems.push('预付款比例须在 0–100% 之间。');
    // A real exported PI showed "100%" in the deposit table while the terms
    // line still read "50% deposit". Block that contradiction at save time.
    if (String(order.payment || '').trim() !== TD.paymentText(order.depositPct)) {
      const inText = TD.paymentPercentInText(order.payment);
      if (inText != null && inText !== Math.round(order.depositPct)) {
        problems.push('付款方式文字里的比例（' + inText + '%）与预付款比例（' + order.depositPct +
          '%）不一致，会在同一张 PI 上自相矛盾。请在第 3 步重新选择预设，或把两处改成同一个比例。');
      }
    }
    if (!(order.discountPct >= 0 && order.discountPct <= 100)) problems.push('折扣率须在 0–100% 之间。');
    if (!(order.vatPct >= 0 && order.vatPct <= 100)) problems.push('税率须在 0–100% 之间。');
    // Reference numbers must stay in their own business slot (the video's core warning).
    const refSlots = [['客户 P/O', order.po], ['L/C 信用证号', order.lcNo],
      ['B/L 提单号', order.blNo], ['集装箱号', order.containerNo]];
    for (let i = 0; i < refSlots.length; i++) {
      for (let j = i + 1; j < refSlots.length; j++) {
        if (refSlots[i][1] && refSlots[i][1] === refSlots[j][1]) {
          problems.push('「' + refSlots[i][0] + '」与「' + refSlots[j][0] + '」填了同一个编号，请按业务环节分开填写，避免后续返工。');
        }
      }
    }
    const optRows = order.priceOptions || [];
    for (const o of optRows) {
      if (!o.incoterm) problems.push('报价方案缺少贸易术语，请在第 ② 步「按贸易术语逐项报价」里补全。');
      if (!(o.total > 0)) problems.push('报价方案「' + (o.incoterm || '?') +
        '」的整单总价为 0；请检查第 ② 步产品行的数量与单价。');
    }
    if (optRows.length) {
      const keys = optRows.map((o) => o.incoterm + '|' + o.place);
      if (new Set(keys).size !== keys.length) problems.push('存在贸易术语与地点完全相同的报价方案，请在第 ② 步区分地点或删除重复列，避免客户看到两行一样的价。');
    }
    if (TD.get('orders').some((o) => o.no === order.no && o.id !== order.id)) problems.push('订单编号已存在，请修改后再保存。');
    const banned = TD.brandCheck([order.buyer, order.notes, order.po, order.buyerAddress, order.shipTo,
      order.shippingMark, order.sideMark, order.terms, order.docBody, order.packingNote,
      order.lcNo, order.blNo, order.containerNo, order.consignee, order.notifyParty,
      ...optRows.flatMap((o) => [o.place, o.freight, o.note]), order.toolingNote,
      order.complianceNote,
      ...Object.values(order.docMeta || {}).flatMap((m) => [m.date, m.remark]),
      ...order.lines.flatMap((l) => [l.name, l.model, l.docDescription])].join(' '));
    if (banned.length) problems.push('订单内容含对外禁用词（' + banned.length + ' 处），请改为核定的对外品牌名。');
    if (problems.length) { TD.alert('订单未保存：\n\n' + problems.join('\n')); return null; }

    const rows = TD.get('orders');
    const index = rows.findIndex((o) => o.id === order.id);
    const previous = index >= 0 ? rows[index] : null;
    if (previous) {
      const settings = TD.get('settings');
      settings.push({ id: 'revision:' + order.id + ':' + Date.now(), kind: 'order-revision',
        orderId: order.id, orderNo: previous.no, at: new Date().toISOString(), snapshot: previous });
      TD.set('settings', settings);
      order.createdAt = previous.createdAt || new Date().toISOString();
      rows[index] = order;
    } else {
      order.createdAt = new Date().toISOString();
      rows.push(order);
    }
    order.updatedAt = new Date().toISOString();
    TD.set('orders', rows);
    TD.closeModal();
    TD.refresh();
    TD.renderActiveView();
    return order;
  };

  TD.saveOrderOnly = function () {
    if (TD.saveOrder()) TD.alert('订单已保存到本机数据库。');
  };
  // A quotation is not a shipment pack. Warn (never hard-block) when a quote
  // stage order is about to produce a contract / CI / packing list - the real
  // Italian quote came out as a 5-page bundle whose packing list literally
  // said "do not send" and whose CI carried bank details.
  function confirmStageDocs(kinds) {
    const state = TD.val('state');
    if (!TD.QUOTE_STAGES.includes(state)) return true;
    const extra = kinds.filter((k) => ['Commercial Invoice', 'Packing List', 'Sales Contract'].includes(k));
    if (!extra.length) return true;
    return TD.confirm('当前订单阶段是「' + state + '」，对外通常只需 Quotation；客户确认付款时再补 PI。\n\n' +
      '你勾选了：' + extra.join('、') + '。报价阶段一般还没有实际装箱数据，装箱单会在出单前被系统拦下；' +
      '商业发票 / 合同也不属于报价环节。\n\n' +
      '要发给客户，请到「单证中心」点对应卡片逐份导出（一份单证一个文件）。仍要继续吗？');
  }
  TD.saveAndPreviewDocs = function () {
    const kinds = TD.selectedDocKinds();
    if (!kinds.length) { TD.alert('请至少选择一种单证。'); return; }
    if (!confirmStageDocs(kinds)) return;
    const order = TD.saveOrder();
    if (order) TD.previewBundle(order.id, kinds);
  };
  TD.saveAndPrintBundle = function () {
    const kinds = TD.selectedDocKinds();
    if (!kinds.length) { TD.alert('请至少选择一种单证。'); return; }
    if (!confirmStageDocs(kinds)) return;
    if (!TD.confirm('这会生成【一个多页 PDF】，把所选单证连在一起，只适合自己留档。\n\n' +
      '发给客户 / 货代请用「单证中心」的单张卡片分别导出，一份一个文件。\n\n仍要合并打印吗？')) return;
    const order = TD.saveOrder();
    if (order) TD.previewBundle(order.id, kinds);
  };

  /** Primary action after saving: go straight to the visual card wall so the
   *  operator picks exactly the ONE document they want to send. */
  TD.saveAndOpenStudio = function () {
    const order = TD.saveOrder();
    if (!order) return;
    TD.closeModal();
    TD.openStudioFor(order.id);
  };

  TD.setOrderStage = function (id, value) {
    const rows = TD.get('orders');
    const order = rows.find((o) => o.id === id);
    if (!order || order.state === value) return;
    const settings = TD.get('settings');
    settings.push({ id: 'revision:' + id + ':' + Date.now(), kind: 'order-revision', orderId: id,
      orderNo: order.no, at: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify(order)) });
    TD.set('settings', settings);
    order.state = value;
    TD.set('orders', rows);
    TD.refresh(); TD.renderActiveView();
  };

  TD.deleteOrder = function (id) {
    const rows = TD.get('orders');
    const order = rows.find((o) => o.id === id);
    if (!order) return;
    if (!TD.confirm('将订单 ' + order.no + ' 移入回收站？之后可在订单历史中恢复。')) return;
    const settings = TD.get('settings');
    settings.push({ id: TD.uid(), kind: 'deleted-order', deletedAt: new Date().toISOString(), order });
    TD.set('settings', settings);
    TD.set('orders', rows.filter((o) => o.id !== id));
    TD.refresh(); TD.renderActiveView();
    TD.alert('订单已移入回收站。');
  };

  // ---------------------------------------------------------------- wizard
  // The old modal showed nine sections at once. It is now a five-step flow;
  // "单页显示全部" restores the flat layout for users who prefer it.
  TD.STEP_GUIDES = {
    1: '第 1 步 / 共 5 步 · 客户与报价：填客户公司和编号即可，从客户档案选择会自动带出地址与专属价。',
    2: '第 2 步 · 产品与金额：用「从产品库选择」快速带入产品行，合计自动计算；客户要比价时展开「按贸易术语逐项报价」，一列一个术语填单价，数量与总价都由产品行自动汇总。参考币种只给客户看折算价。',
    3: '第 3 步 · 交易条款与收款：付款比例用下拉选（印度客户可选 100% 全额预付），系统自动生成一致的付款文字；交期、有效期、装运方式都可选天数或自定义。术语报价在这里只核对、不重复录入；模具费在此填金额，保存后自动并入商品明细表与总额，合规认证说明亦在此填。出单主体在左侧【出单主体】页统一维护，这里只需选收款账户。',
    4: '第 4 步 · 装箱与唛头（可跳过）：准备发货时才需要填，装箱数量必须与订单数量一致。默认 N/M 无唛头，系统不会替客户编造唛头。',
    5: '第 5 步 · 单证样式与出单：选语言、配色、显示项，然后点「保存并打开单证中心」。那里每种单证是一张卡片，想打印哪份就点哪份，各自一个独立文件；合并打印整套只用于自己留档。'
  };
  TD.FORM_STEP_COUNT = 5;
  let formStep = 1;
  let paymentAuto = true; // true = the payment sentence is generated from depositPct

  TD.currentStep = function () { return formStep; };
  TD.formSingleMode = function () {
    const el = document.getElementById('formSingle');
    return !!(el && el.checked);
  };
  TD.gotoStep = function (n) {
    const step = Math.max(1, Math.min(TD.FORM_STEP_COUNT, Number(n) || 1));
    formStep = step;
    const single = TD.formSingleMode();
    document.querySelectorAll('.formstep').forEach((el) => {
      el.hidden = single ? false : Number(el.dataset.step) !== step;
    });
    document.querySelectorAll('#formSteps .step').forEach((btn) => {
      const k = Number(btn.dataset.step);
      btn.classList.toggle('active', !single && k === step);
      btn.classList.toggle('done', !single && k < step);
    });
    const guide = document.getElementById('stepGuide');
    if (guide) { guide.hidden = single; guide.textContent = single ? '' : TD.STEP_GUIDES[step]; }
    const nav = document.getElementById('wizardNav');
    if (nav) nav.hidden = single;
    const pos = document.getElementById('wizardPos');
    if (pos) pos.textContent = '第 ' + step + ' / ' + TD.FORM_STEP_COUNT + ' 步';
    const prev = document.getElementById('wizardPrev');
    const next = document.getElementById('wizardNext');
    if (prev) prev.disabled = step <= 1;
    if (next) next.disabled = step >= TD.FORM_STEP_COUNT;
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.scrollTop = 0;
  };
  TD.stepBy = function (delta) { TD.gotoStep(formStep + delta); };
  TD.resetWizard = function () { TD.gotoStep(1); };
  TD.setFormMode = function (single) {
    const el = document.getElementById('formSingle');
    if (el) el.checked = !!single;
    try { localStorage.setItem('tdshare_formSingle', single ? '1' : '0'); } catch (e) { /* private mode */ }
    TD.gotoStep(formStep);
  };

  // ---------------------------------------------------------------- presets
  function fillSelect(id, entries, customLabel) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = entries.map((e) =>
      '<option value="' + E(String(e.value)) + '">' + E(e.label) + '</option>').join('') +
      '<option value="__custom">' + E(customLabel) + '</option>';
  }
  function daysFrom(text) {
    const m = String(text || '').trim().match(/^(\d{1,3})\s*(?:working\s*)?days?$/i);
    return m ? m[1] : '__custom';
  }
  TD.setPresetFromValue = function (id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const exists = Array.from(el.options).some((o) => o.value === value);
    el.value = exists ? value : '__custom';
  };
  /** Re-derive the dropdowns when an existing order is loaded for editing. */
  TD.syncPresetsFromOrder = function (order) {
    const o = order || {};
    const pct = Math.round(TD.num(o.depositPct));
    paymentAuto = String(o.payment || '').trim() === TD.paymentText(pct);
    TD.setPresetFromValue('paymentPreset', String(pct));
    TD.setPresetFromValue('leadPreset', daysFrom(o.lead));
    TD.setPresetFromValue('validPreset', daysFrom(o.valid));
    TD.setPresetFromValue('shipViaPreset', String(o.shipVia || '__custom'));
  };
  TD.initFormPresets = function () {
    fillSelect('paymentPreset', TD.PAYMENT_PRESETS.map((p) => ({ value: p.pct, label: p.label })),
      '自定义比例 / 自定义付款文字…');
    fillSelect('leadPreset', TD.LEAD_DAYS.map((d) => ({ value: d, label: d + ' 个工作日' })),
      '自定义交期…');
    fillSelect('validPreset', TD.VALID_DAYS.map((d) => ({ value: d, label: d + ' 天' })),
      '自定义有效期…');
    fillSelect('shipViaPreset', TD.SHIP_MODES.map((m) => ({ value: m, label: m })),
      '自定义装运方式…');

    const on = (id, evt, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    };
    on('paymentPreset', 'change', function () {
      if (this.value === '__custom') { paymentAuto = false; return; }
      TD.setVal('depositPct', this.value);
      paymentAuto = true;
      TD.setVal('payment', TD.paymentText(this.value));
    });
    on('depositPct', 'input', function () {
      const pct = Number(this.value);
      if (paymentAuto) TD.setVal('payment', TD.paymentText(pct));
      TD.setPresetFromValue('paymentPreset', paymentAuto ? String(Math.round(pct)) : '__custom');
    });
    on('payment', 'input', function () {
      paymentAuto = false;
      TD.setPresetFromValue('paymentPreset', '__custom');
    });
    on('leadPreset', 'change', function () {
      if (this.value !== '__custom') TD.setVal('lead', this.value + ' working days');
    });
    on('validPreset', 'change', function () {
      if (this.value !== '__custom') TD.setVal('valid', this.value + ' days');
    });
    on('shipViaPreset', 'change', function () {
      if (this.value !== '__custom') TD.setVal('shipVia', this.value);
    });
    on('lead', 'input', function () { TD.setPresetFromValue('leadPreset', daysFrom(this.value)); });
    on('valid', 'input', function () { TD.setPresetFromValue('validPreset', daysFrom(this.value)); });
    on('shipVia', 'input', function () { TD.setPresetFromValue('shipViaPreset', this.value || '__custom'); });

    const bar = document.getElementById('formSteps');
    if (bar) bar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.step');
      if (btn) TD.gotoStep(Number(btn.dataset.step));
    });
    on('formSingle', 'change', function () { TD.setFormMode(this.checked); });
    try {
      const single = document.getElementById('formSingle');
      if (single) single.checked = localStorage.getItem('tdshare_formSingle') === '1';
    } catch (e) { /* private mode */ }
    TD.gotoStep(1);
  };

  TD.initFormPresets();
})();
