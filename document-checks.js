/* Pre-flight checks before any customer-facing document is produced. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  const INTERNAL_MARKERS = ['内部成本', '产品采购成本', '成本合计', '毛利', '毛利率', '加价率',
    'productCost', 'inlandFreight', 'internationalFreight', '内部利润', '出厂成本',
    // Internal packing-check language must stay in the pre-flight report,
    // never on a PDF that goes to a customer / forwarder / customs broker.
    '不得对外发送', '尚未录入装箱明细', '未确认实际发货数据', '装箱核对提示',
    '本装箱单不得'];

  TD.scanRendered = function (html) {
    const banned = TD.brandCheck(html);
    const internal = INTERNAL_MARKERS.filter((word) => String(html).includes(word));
    return { banned, internal };
  };

  TD.checkOrder = function (order, kinds) {
    const errors = [], warnings = [];
    const list = kinds && kinds.length ? kinds : ['Quotation'];
    const entity = TD.entityFor(order);
    const account = TD.accountFor(order);
    const seller = TD.sellerData(order);
    const lines = Array.isArray(order.lines) ? order.lines : [];

    // ---- seller / bank ----
    if (!entity || !seller) errors.push('缺少出单主体资料，请通过启动器打开本地版并检查【出单主体】。');
    else {
      if (!seller.legalEn || !seller.addressEn) errors.push('出单主体缺少英文法定名称或英文地址。');
      for (const note of TD.entityWarnings(order)) warnings.push(note);
    }
    // Only a currency mismatch is a hard error; account verification notes
    // must stay warnings. Matching on the loose word "不一致" used to promote
    // a harmless "tail number differs from a historical sample" note into a
    // blocking error, which made the collection account unusable.
    for (const note of TD.accountWarnings(order)) {
      if (note.includes('币种') && note.includes('不一致')) errors.push(note);
      else warnings.push(note);
    }
    // A payee name different from the contracting entity is a normal
    // collection arrangement, not an error. Only currency is checked below.
    if (list.includes('Proforma Invoice') && order.showBank && !account) {
      errors.push('PI 已勾选显示收款账户，但未选择有效账户。');
    }
    if (order.showBank && account && account.currency !== 'CONTRACT CURRENCY' && account.currency !== order.currency) {
      errors.push('收款账户币种与订单结算币种不匹配。');
    }

    // ---- buyer / order basics ----
    if (!order.buyer) errors.push('缺少买方公司名称。');
    if (!order.currency) errors.push('缺少结算币种。');
    if (!lines.length) errors.push('订单没有产品明细。');
    if (lines.some((line) => !line.name || !(TD.num(line.qty) > 0) || !(TD.num(line.price) >= 0))) {
      errors.push('存在产品行缺少名称、数量无效或单价为负。');
    }
    if (!order.country) warnings.push('未填写买方国家/地区。');
    if (!order.buyerAddress) warnings.push('未填写买方账单地址。');
    if (!order.email) warnings.push('未填写客户邮箱。');
    if (order.refCurrency && order.refCurrency === order.currency) errors.push('参考币种不能与结算币种相同。');
    if (order.refCurrency && !(TD.num(order.fxRate) > 0)) errors.push('已选参考币种，但参考汇率无效。');
    if (!['USD', 'EUR', 'CNY'].includes(order.currency)) {
      warnings.push('结算币种为 ' + order.currency + '；对外账户页只提供 USD / EUR / 境内 CNY 账户，需另取对应账户信息。');
    }
    if (TD.num(order.depositPct) === 0 && list.some((k) => ['Proforma Invoice', 'Sales Contract'].includes(k))) {
      warnings.push('预付款比例为 0；手册 5.2 规定不做无预付款的新客户订单，FFKM 等高价值产品须 100% 或至少 50% 预付。');
    }
    // Also guard orders saved BEFORE the linked preset existed: the user's
    // exported PI had a 100% deposit table but a "50% deposit" terms line.
    // Save-time validation alone cannot stop an old order being exported from
    // the document studio, so check again right before any document is built.
    if (String(order.payment || '').trim() !== TD.paymentText(order.depositPct)) {
      const inText = TD.paymentPercentInText(order.payment);
      if (inText != null && inText !== Math.round(TD.num(order.depositPct))) {
        errors.push('付款方式文字（' + inText + '%）与预付款比例（' + order.depositPct +
          '%）不一致，单证会自相矛盾。请回到订单第 3 步重新选择付款预设后再导出。');
      }
    }

    // ---- brand compliance on order free text ----
    const freeText = [order.buyer, order.buyerAddress, order.shipTo, order.contact, order.email,
      order.notes, order.payment, order.po, order.incotermPlace, order.shipVia,
      order.shippingMark, order.sideMark, order.markNote, order.packingNote,
      order.terms, order.docBody, order.lcNo, order.blNo, order.containerNo,
      order.sellerSignature, order.buyerSignature, order.toolingNote, order.complianceNote,
      order.consignee, order.notifyParty]
      .concat(lines.flatMap((line) => [line.name, line.model, line.material, line.specification,
        line.color, line.hardness, line.dimensions, line.docDescription]))
      .concat(Object.values(order.docMeta || {}).flatMap((m) => [m.date, m.remark]))
      .join(' ');
    const bannedFields = TD.brandCheck(freeText);
    if (bannedFields.length) errors.push('订单内容含对外禁用词（' + bannedFields.length + ' 处）。请替换为【公司与系统设置】中核定的对外品牌名后再生成单证。');
    const internalFields = INTERNAL_MARKERS.filter((word) => freeText.includes(word));
    if (internalFields.length) errors.push('订单内容含内部成本/利润字样：' + internalFields.join('、') + '，不得出现在客户单证。');

    // ---- multi-term quotation (Quotation only) ----
    if (list.includes('Quotation')) {
      const opts = TD.priceOptions(order);
      if (opts.length > 1) {
        if (!opts.some((o) => o.incoterm === order.incoterm)) {
          warnings.push('报价方案中没有与主贸易术语（' + (order.incoterm || '未填') +
            '）一致的方案；请在第 ② 步「按贸易术语逐项报价」保留一列与主术语相同，作为产品明细表的基准价。');
        }
        const sellerPays = ['DAP', 'DDP', 'DPU', 'CIF', 'CFR', 'CPT', 'CIP'];
        const hasSellerPaid = opts.some((o) => sellerPays.includes(o.incoterm));
        if (hasSellerPaid && /freight\s*collect|运费到付|到付/i.test(String(order.shipVia || ''))) {
          warnings.push('装运方式写着「Freight Collect / 运费到付」，但报价方案含 DAP / DDP / CIF 等由卖方承担运费的术语；请逐方案核对运费责任，避免自相矛盾。');
        }
        if (!(TD.num(order.toolingCost) > 0) && !String(order.toolingNote || '').trim()) {
          warnings.push('客户若询问模具 / 工装费（mould / tooling cost）或 REACH / RoHS 等认证，请在订单第 ③ 步「报价方案核对 · 模具费 · 合规说明」里填写；报价单会明确答复「无模具费」或列出金额，认证只打印你填写的原文。');
        }
        const optText = opts.map((o) => [o.place, o.freight, o.note].join(' ')).join(' ') +
          ' ' + String(order.toolingNote || '');
        const optBanned = TD.brandCheck(optText);
        if (optBanned.length) errors.push('报价方案含对外禁用词（' + optBanned.length + ' 处），请改为核定的对外品牌名。');
        const optInternal = INTERNAL_MARKERS.filter((word) => optText.includes(word));
        if (optInternal.length) errors.push('报价方案含内部成本/利润字样：' + optInternal.join('、') + '，不得出现在客户单证。');
      }
    }

    // ---- trade terms / HS code: advise, never invent data ----
    if (order.incoterm && !String(order.incotermPlace || '').trim()) {
      warnings.push('贸易术语「' + order.incoterm + '」未填写地点；标准写法如 ' +
        order.incoterm + ' Shanghai Port, China (INCOTERMS 2020)。请到订单第 ③ 步「术语地点 / 装运港」填写，系统不会替你编造港口。');
    }
    const shortHs = lines.filter((line) => {
      const code = String(line.hsCode || '').trim();
      return /^\d+$/.test(code) && code.length > 0 && code.length < 10;
    });
    if (shortHs.length) {
      warnings.push('有 ' + shortHs.length + ' 行 HS 编码不足 10 位（例：' +
        E(String(shortHs[0].hsCode).trim()) +
        '）。中国出口报关通常用 10 位商品编号，请在产品库核对后补两位；系统不会自动补 0，避免错误归类导致退单。');
    }
    // ---- CI specific ----
    if (list.includes('Commercial Invoice')) {
      if (lines.some((line) => !line.hsCode)) warnings.push('部分产品行缺少 HS Code，CI 中该列会留空。');
      if (lines.some((line) => !line.origin)) warnings.push('部分产品行缺少原产国，CI 中该列会留空。');
    }
    // ---- PL specific: a blank or contradictory packing list must never be
    // printed as a customer file. Block it and explain what to fill instead.
    let packing = null;
    if (list.includes('Packing List')) {
      const report = TD.packingReport(order);
      packing = report.parsed;
      if (!packing.boxes.length) {
        errors.push('本订单还没有装箱明细，无法生成装箱单。\n' +
          '请到订单第 ④ 步「装箱与唛头」录入每个箱号的箱数、毛重、净重与箱规（长x宽x高 cm），' +
          '或点「按产品包装参数生成装箱草案」后核对；填好并勾选「已核对」再来导出 PL。' +
          '报价 / 谈单阶段通常不需要 PL，只导出 Quotation 即可。');
      }
      const diff = packing.perModel.filter((row) => row.diff !== 0);
      if (diff.length) {
        errors.push('装箱数量与订单不一致（' + diff.length + ' 个型号），本装箱单不得对外发送。\n' +
          '请回到订单第 ④ 步修正装箱明细，确认实际发货数量后重新导出；' +
          '出单前检查报告里有逐型号差异表。');
      }
      if (packing.boxes.length && !order.packingConfirmed) {
        warnings.push('装箱数据尚未勾选「已核对」。自动装箱只是理论草案，不得当作实际发货事实；请在订单第 ④ 步核对实装箱数、毛净重与箱规后勾选。');
      }
      if (packing.totals.pendingGross || packing.totals.pendingCbm) {
        warnings.push('共 ' + packing.totals.pendingGross + ' 箱毛重、' + packing.totals.pendingCbm +
          ' 箱体积未填或同一箱出现不同值；这些格在 PL 上会留空，合计只累计已确认的箱。请补齐后再外发。');
      }
      warnings.push(...report.warnings.filter((w) => !/装箱明细为空/.test(w)));
    }
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], packing };
  };

  TD.guardDocuments = function (order, kinds) {
    const built = TD.buildDocumentHtml(order, kinds);
    const scan = TD.scanRendered(built.html);
    const result = TD.checkOrder(order, built.kinds);
    if (scan.banned.length) result.errors.push('渲染结果含对外禁用词（共 ' + scan.banned.length + ' 处），已阻止生成。');
    for (const word of scan.internal) result.errors.push('渲染结果含内部数据字样：' + word);
    result.errors = [...new Set(result.errors)];
    if (result.errors.length) {
      TD.alert('暂不能生成单证，请先修正以下问题：\n\n' + result.errors.map((x, i) => (i + 1) + '. ' + x).join('\n'));
      TD.showCheckReport(order, built.kinds, result);
      return false;
    }
    if (result.warnings.length && !TD.confirm(
      '单证检查发现以下待核对项目：\n\n' + result.warnings.map((x, i) => (i + 1) + '. ' + x).join('\n') +
      '\n\n仍要生成单证吗？')) return false;
    return true;
  };

  TD.showCheckReport = function (order, kinds, result) {
    const check = result || TD.checkOrder(order, kinds);
    const built = TD.buildDocumentHtml(order, kinds);
    const scan = TD.scanRendered(built.html);
    const host = document.getElementById('modalHost');
    if (!host) return;
    const perModel = check.packing ? check.packing.perModel : [];
    host.innerHTML = '<div class="overlay" id="checkReport" style="display:flex;z-index:60">' +
      '<div class="modal"><div class="panelhead"><h2>单证生成前检查报告</h2><button class="btn" data-close>关闭</button></div>' +
      (check.errors.length ? '<div class="notice error"><b>必须修正（' + check.errors.length + '）</b><ul>' +
        check.errors.map((x) => '<li>' + E(x) + '</li>').join('') + '</ul></div>' : '<div class="notice info">没有阻断性错误。</div>') +
      (check.warnings.length ? '<div class="notice"><b>待人工核对（' + check.warnings.length + '）</b><ul>' +
        check.warnings.map((x) => '<li>' + E(x) + '</li>').join('') + '</ul></div>' : '') +
      (scan.banned.length || scan.internal.length
        ? '<div class="notice error">品牌 / 内部数据扫描：禁用词命中 ' + scan.banned.length + ' 处' +
          '；内部字样 ' + E(scan.internal.join('、') || '无') + '</div>' : '') +
      (perModel.length ? '<h3>逐型号数量核对</h3><div class="tablewrap"><table class="table"><thead><tr><th>型号</th><th>订单</th><th>装箱</th><th>差异</th></tr></thead><tbody>' +
        perModel.map((r) => '<tr><td>' + E(r.key) + '</td><td>' + r.ordered + '</td><td>' + r.packed + '</td><td>' + (r.diff ? '<span class="badge bad">' + r.diff + '</span>' : '0') + '</td></tr>').join('') +
        '</tbody></table></div>' : '') +
      '<div class="modalfoot"><button class="btn" data-close>关闭</button>' +
      (order.id ? '<button class="btn primary" id="backToOrder">返回订单修正</button>' : '') + '</div></div></div>';
    const overlay = document.getElementById('checkReport');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) overlay.remove();
      if (event.target.id === 'backToOrder') { overlay.remove(); TD.edit(order.id); }
    });
  };
})();
