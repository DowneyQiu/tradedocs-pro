/* Packing maths. Carton rows are grouped by real carton number.
   Mixed cartons count CBM once; conflicting gross/dimensions are marked pending
   rather than silently resolved; quantities are reconciled per product model. */
(function () {
  'use strict';
  const TD = window.TD;

  TD.parseDimensions = function (value) {
    const parts = String(value || '').toLowerCase().split(/[x×*]/).map((p) => Number(p.trim()));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
      return { valid: false, cbm: 0 };
    }
    return { valid: true, cbm: parts[0] * parts[1] * parts[2] / 1000000 };
  };

  function normalizeDim(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '');
  }

  /** Split a line into 7 fields (core) + optional mark / packing fields, or 6 fields (legacy). */
  function splitCartonLine(line) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 7) {
      return { no: parts[0], model: parts[1], description: parts[2], rawQty: parts[3],
               rawGross: parts[4], rawNet: parts[5], dim: parts[6],
               mark: parts[7] || '', packType: parts[8] || '', pkgUnit: parts[9] || '',
               unit: parts[10] || '' };
    }
    return { no: parts[0], model: '', description: parts[1] || '', rawQty: parts[2],
             rawGross: parts[3], rawNet: parts[4], dim: parts[5] || '',
             mark: '', packType: '', pkgUnit: '', unit: '' };
  }

  /** Resolve a carton product row to an order-line model key. */
  function matchModel(item, lines) {
    const list = lines || [];
    if (item.model) {
      const hit = list.find((line) => String(line.model || '').trim() &&
        String(line.model).trim().toLowerCase() === String(item.model).trim().toLowerCase());
      if (hit) return { key: String(hit.model).trim(), matched: true };
    }
    const haystack = String(item.description || '').toLowerCase();
    let best = null;
    for (const line of list) {
      const model = String(line.model || '').trim();
      const name = String(line.name || '').trim();
      if (model && haystack.includes(model.toLowerCase())) { best = { key: model, matched: true }; break; }
      if (name && haystack.includes(name.toLowerCase())) { best = { key: model || name, matched: true }; }
    }
    if (best) return best;
    return { key: String(item.model || '').trim() || String(item.description || '').trim() || '未分类', matched: false };
  }

  TD.parseCartons = function (text, lines) {
    const byNumber = new Map();
    const issues = [];
    const rows = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);

    rows.forEach((line, index) => {
      const p = splitCartonLine(line);
      const no = p.no || String(index + 1);
      const qty = Number(p.rawQty);
      const gross = Number(p.rawGross);
      const net = Number(p.rawNet);
      const dim = p.dim || '';
      const parsed = TD.parseDimensions(dim);

      if (!Number.isFinite(qty) || qty <= 0) issues.push('箱号 ' + no + '：产品数量无效或未填写。');
      if (!Number.isFinite(net) || p.rawNet === '' || net < 0) issues.push('箱号 ' + no + '：产品净重未填写或无效。');
      if (p.rawGross && (!Number.isFinite(gross) || gross <= 0)) issues.push('箱号 ' + no + '：毛重无效。');
      if (dim && !parsed.valid) issues.push('箱号 ' + no + '：尺寸无效，请按 长x宽x高（厘米）填写。');

      let box = byNumber.get(no);
      if (!box) {
        box = { no, items: [], qty: 0, gross: null, net: 0, cbm: null,
                dimensions: '', grossValues: [], dimValues: [], grossPending: false, dimPending: false,
                mark: '', packType: '', pkgUnit: '' };
        byNumber.set(no, box);
      }
      const resolved = matchModel({ model: p.model, description: p.description }, lines);
      box.items.push({ model: p.model || '', description: p.description || '', qty: Number.isFinite(qty) ? qty : 0,
                       key: resolved.key, matched: resolved.matched,
                       net: Number.isFinite(net) && net >= 0 ? net : 0,
                       unit: p.unit || '', mark: p.mark || '', packType: p.packType || '' });
      if (!box.mark && p.mark) box.mark = p.mark;
      if (!box.packType && p.packType) box.packType = p.packType;
      if (!box.pkgUnit && p.pkgUnit) box.pkgUnit = p.pkgUnit;
      box.qty += Number.isFinite(qty) ? qty : 0;
      if (Number.isFinite(gross) && gross > 0) box.grossValues.push(Math.round(gross * 1000) / 1000);
      if (Number.isFinite(net) && net >= 0) box.net += net;
      if (dim) box.dimValues.push(dim);
    });

    const boxes = [...byNumber.values()];
    for (const box of boxes) {
      const uniqueGross = [...new Set(box.grossValues)];
      const uniqueDims = [...new Set(box.dimValues.map(normalizeDim))];
      if (!box.grossValues.length) {
        issues.push('箱号 ' + box.no + '：未填写整箱毛重，已标为待核对。');
        box.grossPending = true;
      } else if (uniqueGross.length > 1) {
        issues.push('箱号 ' + box.no + '：同箱出现不同毛重值（' + uniqueGross.join(' / ') + '），已标为待核对，未自动采用任何一个值。');
        box.grossPending = true;
      } else {
        box.gross = uniqueGross[0];
      }
      if (!box.dimValues.length) {
        issues.push('箱号 ' + box.no + '：未填写有效箱规，体积标为待核对。');
        box.dimPending = true;
      } else if (uniqueDims.length > 1) {
        issues.push('箱号 ' + box.no + '：同箱出现不同箱规（' + box.dimValues.join(' / ') + '），体积标为待核对。');
        box.dimPending = true;
      } else {
        const parsed = TD.parseDimensions(box.dimValues[0]);
        if (parsed.valid) { box.cbm = parsed.cbm; box.dimensions = box.dimValues[0]; }
        else { box.dimPending = true; issues.push('箱号 ' + box.no + '：箱规无法解析，体积标为待核对。'); }
      }
      if (box.gross !== null && box.net > box.gross + 0.01) {
        issues.push('箱号 ' + box.no + '：箱内净重合计大于整箱毛重，请核对。');
      }
      delete box.grossValues;
      delete box.dimValues;
    }

    const totals = boxes.reduce((sum, box) => ({
      boxes: sum.boxes + 1,
      qty: sum.qty + box.qty,
      gross: sum.gross + (box.gross === null ? 0 : box.gross),
      net: sum.net + box.net,
      cbm: sum.cbm + (box.cbm === null ? 0 : box.cbm),
      pendingGross: sum.pendingGross + (box.grossPending ? 1 : 0),
      pendingCbm: sum.pendingCbm + (box.dimPending ? 1 : 0),
    }), { boxes: 0, qty: 0, gross: 0, net: 0, cbm: 0, pendingGross: 0, pendingCbm: 0 });

    // ------- per-model quantity reconciliation -------
    // Tooling is a charge, not a physical item: never count it in the
    // ordered-vs-packed reconciliation on a packing list.
    const goodsLines = (lines || []).filter((l) =>
      String(l.priceSource || '') !== 'tooling' &&
      !/^mould\s*\/\s*tooling cost$/i.test(String(l.name || '').trim()));
    const modelMap = new Map();
    for (const line of goodsLines) {
      const key = String(line.model || '').trim() || String(line.name || '').trim() || '未分类';
      const entry = modelMap.get(key) || { key, name: line.name || '', model: line.model || '', ordered: 0, packed: 0 };
      entry.ordered += TD.num(line.qty);
      modelMap.set(key, entry);
    }
    for (const box of boxes) {
      for (const item of box.items) {
        const entry = modelMap.get(item.key) || { key: item.key, name: item.description, model: item.key, ordered: 0, packed: 0, unmatched: !item.matched };
        entry.packed += item.qty;
        if (!item.matched) entry.unmatched = true;
        modelMap.set(item.key, entry);
      }
    }
    const perModel = [...modelMap.values()].map((entry) => Object.assign(entry, {
      diff: Math.round((entry.packed - entry.ordered) * 1000) / 1000,
    }));

    return { boxes, totals, issues: [...new Set(issues)], perModel,
             orderQty: perModel.reduce((s, r) => s + r.ordered, 0),
             packedQty: perModel.reduce((s, r) => s + r.packed, 0) };
  };

  /** Human-readable packing report for PL and the packing workspace. */
  TD.packingReport = function (order) {
    const parsed = TD.parseCartons(order && order.cartons, order && order.lines);
    const errors = [], warnings = [];
    if (!parsed.boxes.length) warnings.push('装箱明细为空，PL 将只有订单产品行，没有实装数据。');
    for (const issue of parsed.issues) warnings.push(issue);
    for (const row of parsed.perModel) {
      if (row.unmatched) warnings.push('型号「' + row.key + '」的装箱行未匹配到订单产品行，请核对箱号内的产品描述/型号。');
      if (row.diff !== 0) {
        warnings.push('型号 ' + row.key + '：订单 ' + row.ordered + ' / 装箱 ' + row.packed + '，差异 ' + (row.diff > 0 ? '+' : '') + row.diff + '。');
      }
    }
    if (!order || !order.packingConfirmed) {
      warnings.push('装箱数据尚未确认。自动装箱只是理论草案，不得当作实际发货事实；请在订单中核对实装箱数、毛净重与箱规后勾选「已核对」。');
    }
    if (parsed.totals.pendingGross || parsed.totals.pendingCbm) {
      warnings.push('共 ' + parsed.totals.pendingGross + ' 箱毛重、' + parsed.totals.pendingCbm + ' 箱体积待核对；合计只累计已确认的箱，不含待核对值。');
    }
    return { parsed, errors, warnings };
  };
})();
