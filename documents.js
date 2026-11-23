/* Unified A4 document engine (v3).
   One order snapshot -> Quotation / PI / Sales Contract / CI / PL / Shipping Mark.
   Language, colour theme, display columns, reference-number slots, terms,
   signatures and shipping marks are all resolved from that one snapshot. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  TD.assetUrl = function (file) {
    if (!file) return '';
    if (/^https?:/i.test(file)) return file;
    const base = TD.isLocalServer() ? location.origin + '/' : '';
    return base + String(file).replace(/^\/+/, '');
  };

  // ------------------------------------------------------------ per-document date / remark
  /** Each document may carry its own issue date and a short remark. Leaving a
   *  field empty means "use the quotation date" / "print no remark at all" —
   *  the system never invents a date or an empty placeholder. */
  TD.docMetaFor = function (order, kind) {
    const all = (order && order.docMeta) || {};
    return all[kind] || {};
  };
  TD.docDate = function (order, kind) {
    return String(TD.docMetaFor(order, kind).date || '').trim() ||
      String((order && order.date) || '').trim();
  };
  TD.docRemark = function (order, kind) {
    return String(TD.docMetaFor(order, kind).remark || '').trim();
  };

  // ------------------------------------------------------------ numbering
  TD.documentNumber = function (order, kind) {
    const code = TD.DOC_CODES[kind] || (kind === 'Shipping Mark' ? 'MARK' : 'DOC');
    const override = String(order.docNoOverride || '').trim();
    if (override) return kind === 'Quotation' ? override : override + '-' + code;
    const template = String(TD.appSettings().docNumberTemplate || 'TPNM-{kind}-{order}');
    const base = String(order.no || '').replace(/^TPQ[-_]?/i, '');
    const tokens = {
      '{kind}': code, '{KIND}': code.toUpperCase(),
      '{order}': base, '{no}': String(order.no || ''),
      '{po}': String(order.po || ''),
      '{date}': TD.docDate(order, kind).replace(/-/g, ''),
      '{year}': TD.docDate(order, kind).slice(0, 4),
      '{entity}': (TD.entityFor(order) || {}).code || '',
    };
    let out = template;
    for (const [key, value] of Object.entries(tokens)) out = out.split(key).join(value);
    return kind === 'Quotation' ? (String(order.no || '') || out) : out;
  };

  // ------------------------------------------------------------ amount in words
  const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const CUR_NAMES = { USD: 'US Dollars', EUR: 'Euros', CNY: 'Chinese Yuan', AED: 'UAE Dirhams',
    GBP: 'British Pounds', CAD: 'Canadian Dollars', AUD: 'Australian Dollars',
    CHF: 'Swiss Francs', RUB: 'Russian Rubles', SAR: 'Saudi Riyals', JPY: 'Japanese Yen',
    INR: 'Indian Rupees', THB: 'Thai Baht' };
  const CUR_MINOR = { USD: 'CENTS', EUR: 'CENTS', CNY: 'FEN', AED: 'FILS', GBP: 'PENCE',
    CAD: 'CENTS', AUD: 'CENTS', CHF: 'CENTIMES', RUB: 'KOPEKS', SAR: 'HALALAS',
    JPY: 'SEN', INR: 'PAISE', THB: 'SATANG' };
  const CUR_CN = { USD: '美元', EUR: '欧元', CNY: '人民币', GBP: '英镑', AED: '迪拉姆',
    JPY: '日元', CAD: '加元', AUD: '澳元', CHF: '瑞士法郎', RUB: '卢布', SAR: '里亚尔',
    INR: '卢比', THB: '泰铢' };
  function under1000(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + under1000(n % 100) : '');
  }
  function enInteger(n) {
    if (n < 1000) return under1000(n);
    const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
    const parts = [];
    let i = 0;
    while (n > 0 && i < scales.length) {
      const g = n % 1000;
      if (g) parts.unshift(under1000(g) + (scales[i] ? ' ' + scales[i] : ''));
      n = Math.floor(n / 1000); i++;
    }
    return parts.join(' ');
  }
  const CN_DIGITS = '零壹贰叁肆伍陆柒捌玖';
  function cnGroup(g) {
    const units = ['', '拾', '佰', '仟'];
    let s = '', zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(g / Math.pow(10, i)) % 10;
      if (d === 0) { if (s) zero = true; }
      else { if (zero) { s += '零'; zero = false; } s += CN_DIGITS[d] + units[i]; }
    }
    return s;
  }
  function cnInteger(n) {
    if (n === 0) return '零';
    const big = ['', '万', '亿', '兆'];
    const groups = [];
    let x = n;
    while (x > 0) { groups.push(x % 10000); x = Math.floor(x / 10000); }
    let out = '';
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i] === 0) { if (out && !out.endsWith('零')) out += '零'; continue; }
      out += cnGroup(groups[i]) + (big[i] || '');
    }
    return out.replace(/零+/g, '零').replace(/零$/, '');
  }
  TD.amountInWordsEN = function (amount, currency) {
    const value = Math.max(0, TD.num(amount));
    const cents = Math.round(value * 100);
    const whole = Math.floor(cents / 100);
    const fraction = cents % 100;
    const name = CUR_NAMES[currency] || currency;
    const minor = CUR_MINOR[currency] || 'CENTS';
    return 'SAY ' + name.toUpperCase() + ' ' + enInteger(whole).toUpperCase() +
      (fraction ? ' AND ' + enInteger(fraction).toUpperCase() + ' ' + minor : ' ONLY') +
      ' (' + currency + ' ' + value.toFixed(2) + ')';
  };
  TD.amountInWordsCN = function (amount, currency) {
    const value = Math.max(0, TD.num(amount));
    const cents = Math.round(value * 100);
    const whole = Math.floor(cents / 100);
    const jiao = Math.floor((cents % 100) / 10);
    const fen = cents % 10;
    const prefix = CUR_CN[currency] || String(currency || '');
    let out = prefix + cnInteger(whole) + '元';
    if (!jiao && !fen) out += '整';
    else {
      if (jiao) out += CN_DIGITS[jiao] + '角';
      else if (fen) out += '零';
      if (fen) out += CN_DIGITS[fen] + '分';
      else out += '整';
    }
    return out;
  };
  TD.amountInWords = TD.amountInWordsEN;

  // ------------------------------------------------------------ print CSS
  TD.PRINT_CSS = [
    // Chrome draws its "Headers and footers" INSIDE the @page margin. With a
    // zero margin there is no room for them, so the URL / date / page number
    // (the "about:blank 1/1" the user kept seeing) cannot be printed at all -
    // no browser setting to remember. The printable padding lives on every
    // .docpage instead, and box-decoration-break repeats it on continuation
    // pages when a single document runs longer than one A4 sheet.
    '@page{size:A4;margin:0}',
    '*{box-sizing:border-box}',
    'body{font:10px/1.5 Arial,"Microsoft YaHei",sans-serif;color:#172638;margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    ':root{--accent:#173e67;--header-bg:#173e67;--header-fg:#fff;--soft:#eaf1f7;--line:#173e67}',
    '.toolbar{position:sticky;top:0;background:#f2f6fa;border:1px solid #c9d9e8;padding:8px 10px;margin:0 0 12px;font-size:12px;z-index:5;display:flex;gap:9px;align-items:center;flex-wrap:wrap}',
    '.toolbar button{padding:6px 12px;font-size:12px;cursor:pointer}',
    '.toolbar .hint{font-size:11px;color:#42566c}',
    '.docpage{padding:11mm 11mm;background:#fff;box-decoration-break:clone;-webkit-box-decoration-break:clone}',
    '.docpage+.docpage{break-before:page;page-break-before:always}',
    '.doc-head{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid var(--accent);padding-bottom:7px;break-inside:avoid}',
    '.logobox{width:176px;height:62px;flex:none;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.logobox.empty{border:1px dashed #b8c6d4}',
    '.logobox img{width:100%;height:100%;object-fit:contain;display:block}',
    '.logobox .ph{font-size:9px;letter-spacing:2px;color:#9aa9b8}',
    '.doc-head .htext{flex:1;min-width:0;padding-top:2px}',
    '.brand{font-size:18px;font-weight:700;letter-spacing:.4px;line-height:1.2;color:var(--accent)}',
    '.legal{font-size:10.5px;font-weight:600;margin-top:3px}',
    '.addr,.contact{font-size:8.4px;color:#42566c;line-height:1.45;overflow-wrap:anywhere}',
    '.titlebar{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:9px 0 6px;break-inside:avoid}',
    'h1.doc-title{font-size:19px;letter-spacing:2.2px;margin:0;color:var(--accent);font-weight:700}',
    '.docno{font-size:9px;line-height:1.65;text-align:right;white-space:nowrap;overflow-wrap:anywhere}',
    '.docno b{color:var(--accent)}',
    '.termsline{font-size:8.6px;color:#33475c;border-top:1px solid #dce5ed;border-bottom:1px solid #dce5ed;padding:3px 2px;margin-bottom:6px;overflow-wrap:anywhere}',
    '.parties{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:5px}',
    '.party{border:1px solid #cfd9e3;padding:5px 7px;font-size:8.8px;line-height:1.45;overflow-wrap:anywhere;break-inside:avoid;background:#fbfdff}',
    '.party h3{margin:0 0 4px;font-size:9px;color:var(--accent);border-bottom:1px solid #e2eaf2;padding-bottom:3px;letter-spacing:.6px}',
    'table.items{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed}',
    'table.items th,table.items td{border:1px solid #b9c5d1;padding:2.5px 3px;font-size:8.1px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}',
    'table.items th{background:var(--header-bg);color:var(--header-fg);font-size:7.6px;font-weight:600;letter-spacing:.2px}',
    'table.items td.num{text-align:right;white-space:nowrap}',
    'table.items tr.group th{background:var(--soft);color:var(--accent);text-align:left;font-size:8.2px}',
    'table.items tr.subtotal td{background:var(--soft);font-weight:600}',
    'table.items tr.grand td{background:var(--soft);font-weight:700;border-top:2px solid var(--accent)}',
    'thead{display:table-header-group}',
    'tr{break-inside:avoid;page-break-inside:avoid}',
    '.pdetails{font-size:7.6px;color:#526273;margin-top:2px;line-height:1.4;overflow-wrap:anywhere}',
    '.hsline{font-size:7.6px;color:#526273;margin-top:2px;line-height:1.4}',
    '.marksline{font-size:8.2px;color:#33475c;margin-top:5px;padding:3px 5px;border:1px solid #dce5ed;background:#fbfdff;overflow-wrap:anywhere;break-inside:avoid}',
    '.plsum{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:7px 0 5px;break-inside:avoid}',
    '.plsum>div{border:1px solid var(--line);background:var(--soft);padding:5px 7px;display:flex;flex-direction:column;gap:2px}',
    '.plsum span{font-size:7.3px;color:#526273}',
    '.plsum b{font-size:11px;color:var(--accent);white-space:nowrap}',
    '.pimg{width:40px;height:40px;object-fit:cover;border:1px solid #ccd6e0;margin:2px 5px 2px 0;float:left}',
    '.totals{margin-top:6px;text-align:right;font-size:11px;font-weight:700;break-inside:avoid;color:var(--accent)}',
    '.reftotal{font-size:9.4px;font-weight:600;color:#33475c;margin-top:2px}',
    '.words{margin-top:3px;font-size:8.6px;line-height:1.45;break-inside:avoid;overflow-wrap:anywhere}',
    '.block{border:1px solid #cfd9e3;padding:5px 7px;margin-top:6px;font-size:8.5px;line-height:1.5;break-inside:avoid;overflow-wrap:anywhere}',
    '.compact-page .block{border:0;padding:2px 0;background:none}',
    '.remark{margin-top:6px;font-size:8.6px;color:#33475c;break-inside:avoid;overflow-wrap:anywhere}',
    '.docremark{font-size:8.6px;color:#33475c;border-left:2px solid var(--accent);background:var(--soft);padding:4px 7px;margin:0 0 6px;break-inside:avoid;overflow-wrap:anywhere}',
    '.markhead{font-size:10px;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:4px;margin-bottom:10px}',
    '.block h3{margin:0 0 4px;font-size:9.4px;color:var(--accent);border-bottom:1px solid #e2eaf2;padding-bottom:3px;letter-spacing:.5px}',
    '.block ul,.block ol{margin:2px 0 0;padding-left:14px;line-height:1.4}',
    'table.items.qoptions{margin-top:4px}',
    'table.items.qoptions th,table.items.qoptions td{font-size:8px}',
    'table.items.qmatrix th,table.items.qmatrix td{font-size:8px;padding:2.5px 4px}',
    'table.items.qmatrix td.muted{color:#526273;font-size:7.6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}',
    'table.items.qmatrix tr.totalrow td{background:var(--soft);font-weight:700;border-top:2px solid var(--accent)}',
    '.priceoptions .posub{font-size:8px;color:#526273;line-height:1.4;margin-bottom:4px}',
    '.priceoptions .tooling{margin-top:5px;font-size:8.4px;line-height:1.45}',
    '.priceoptions small{font-size:7.4px;color:#526273;font-weight:400}',
    '.saleterms{display:grid;grid-template-columns:1fr 1fr;gap:1px 12px;font-size:8.1px;line-height:1.4}',
    '.bankrows{display:grid;grid-template-columns:1fr 1fr;gap:1px 10px;font-size:8.2px;line-height:1.45}',
    '.signature{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:8.2px;line-height:1.55;break-inside:avoid}',
    '.signature.compact{display:block;max-width:56%}',
    '.stamp{width:52px;height:52px;border:1.5px dashed #c3a9a9;border-radius:50%;color:#b9a0a0;font-size:7.5px;display:flex;align-items:center;justify-content:center;text-align:center;margin-bottom:3px}',
    '.draft{border:1px solid #9fb3c8;background:#f4f8fc;color:#173e67;padding:6px 9px;font-size:8.8px;margin-top:8px;break-inside:avoid}',
    '.warn{color:#a12622}',
    '.pending{color:#a12622;font-weight:600}',
    '.markfull{font-size:11px;font-weight:600;line-height:1.85;letter-spacing:.5px;margin-bottom:4px}',
    '.markbox{border:2px solid var(--accent);padding:22px 18px;margin-top:14px;min-height:230px;break-inside:avoid;text-align:center}',
    '.markbox.compact{min-height:0;padding:16px}',
    '.markbox .main{font-size:26px;font-weight:700;letter-spacing:3px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.markbox .side{font-size:13px;letter-spacing:1px;margin-top:18px;white-space:pre-wrap}',
    '.markbox .nm{font-size:34px;font-weight:700;letter-spacing:6px}',
    '.markmeta{margin-top:14px;font-size:9px;line-height:1.8;text-align:left}',
    '@media print{.toolbar{display:none}body{margin:0}}',
  ].join('\n');

  /** Theme-aware print CSS. The base A4 rules stay in TD.PRINT_CSS.
   *  The theme variables MUST come last: TD.PRINT_CSS also defines a default
   *  :root block, and with equal specificity the later rule wins. Putting the
   *  theme first silently made every palette fall back to classic blue. */
  TD.printCss = function (order) {
    const th = TD.theme(order);
    return TD.PRINT_CSS + '\n:root{--accent:' + th.accent + ';--header-bg:' + th.headerBg +
      ';--header-fg:' + th.headerFg + ';--soft:' + th.soft + ';--line:' + th.line + '}';
  };

  // ------------------------------------------------------------ model
  TD.documentModel = function (order, kind) {
    const seller = TD.sellerData(order);
    const account = TD.accountFor(order);
    const lines = Array.isArray(order.lines) ? order.lines : [];
    const packing = TD.parseCartons(order.cartons, lines);
    return {
      kind,
      docNo: TD.documentNumber(order, kind),
      date: TD.docDate(order, kind),
      language: TD.docOptions(order).language,
      theme: TD.docOptions(order).theme.id,
      brand: seller ? seller.brand : '',
      sellerLegal: seller ? seller.legalEn : '',
      sellerAddress: seller ? seller.addressEn : '',
      sellerEmail: seller ? seller.email : '',
      sellerPhone: seller ? seller.phone : '',
      sellerLogo: seller ? seller.logo : '',
      entityId: seller ? seller.id : '',
      currency: order.currency || '',
      total: TD.num(order.total),
      lineCount: lines.length,
      accountId: account ? account.id : '',
      accountCurrency: account ? account.currency : '',
      showBank: TD.bankDisclosure(order, kind),
      showImages: !!order.showProductImages,
      refCurrency: order.refCurrency || '',
      fxRate: TD.num(order.fxRate),
      hsColumns: kind === 'Commercial Invoice',
      packingBoxes: packing.totals.boxes,
      packingQty: packing.totals.qty,
      perModelDiff: packing.perModel.filter((r) => r.diff !== 0).length,
      packingConfirmed: !!order.packingConfirmed,
      shippingMark: TD.shippingMark(order).isNM ? 'N/M' : TD.shippingMark(order).main.join(' / '),
      packingMode: TD.docOptions(order).packingMode,
    };
  };

  // ------------------------------------------------------------ shared blocks
  function T(order, key) { return TD.t(key, TD.docOptions(order).language); }

  const termsPhrase = TD.termsPhrase;

  function headerHtml(order) {
    const s = TD.sellerData(order);
    if (!s) return '<div class="doc-head"><div class="htext"><div class="legal warn">出单主体资料缺失，请检查本机主体档案后再生成单证。</div></div></div>';
    // Prefer the trimmed wide logo so the mark actually fills its frame.
    let logoFile = s.logo || (TD.brandLogo && TD.brandLogo()) || '';
    if (/app-logo\.png$/i.test(logoFile)) logoFile = 'app-logo-wide.png';
    // A real logo prints without a frame; the dashed box only marks a missing logo.
    const logo = logoFile
      ? '<div class="logobox"><img src="' + E(TD.assetUrl(logoFile)) + '" alt=""></div>'
      : '<div class="logobox empty"><span class="ph">YOUR LOGO</span></div>';
    const contact = [s.phone && 'Tel: ' + s.phone, s.whatsapp && 'WhatsApp: ' + s.whatsapp,
      s.email && 'Email: ' + s.email, s.website && 'Web: ' + s.website].filter(Boolean).join(' · ');
    const compact = TD.docOptions(order).compact;
    return '<div class="doc-head">' + logo +
      '<div class="htext"><div class="brand">' + E(s.brand) + (!compact && s.brandCn ? ' / ' + E(s.brandCn) : '') + '</div>' +
      '<div class="legal">' + E(s.legalEn) + (!compact && s.legalCn ? '　' + E(s.legalCn) : '') + '</div>' +
      '<div class="addr">Address: ' + E(s.addressEn) + '</div>' +
      (contact ? '<div class="contact">' + E(contact) + '</div>' : '') +
      '</div></div>';
  }

  function titleBarHtml(order, kind) {
    const lang = TD.docOptions(order).language;
    // Filed documents carry only Invoice No. / Date / PO No. in the header.
    // Everything else (contract no, quotation no, L/C, B/L...) belongs in the
    // full layout, not on a two-page customer-facing invoice.
    if (TD.docOptions(order).compact) {
      const noLabel = {
        'Quotation': 'Quotation No.', 'Proforma Invoice': 'Proforma Invoice No.',
        'Sales Contract': 'Contract No.', 'Commercial Invoice': 'Invoice No.',
        'Packing List': 'Invoice No.', 'Shipping Mark': 'Invoice No.',
      }[kind] || 'Document No.';
      // Unfilled fields are omitted, never printed as a dash. A customer
      // document must not carry empty slots the buyer has to ask about.
      const short = [[noLabel, TD.documentNumber(order, kind)], ['Date', TD.docDate(order, kind)]];
      if (order.po) short.push(['PO No.', order.po]);
      const shortHtml = short.filter(([, value]) => value)
        .map(([label, value]) => '<div><b>' + E(label) + ':</b> ' + E(value) + '</div>').join('');
      return '<div class="titlebar"><h1 class="doc-title">' + E(TD.docTitle(kind, lang)) + '</h1>' +
        '<div class="docno">' + shortHtml + '</div></div>';
    }
    const rows = TD.referenceRows(order, kind).slice(0, 6).filter(([, value]) => value);
    const docno = rows.map(([label, value]) => '<div><b>' + E(label) + ':</b> ' + E(value) + '</div>').join('');
    return '<div class="titlebar"><h1 class="doc-title">' + E(TD.docTitle(kind, lang)) + '</h1>' +
      '<div class="docno">' + docno + '</div></div>';
  }

  /** Per-document remark, only printed when the operator actually wrote one. */
  function docRemarkHtml(order, kind) {
    const remark = TD.docRemark(order, kind);
    if (!remark) return '';
    return '<div class="docremark"><b>Remarks / 备注：</b> ' +
      E(remark).replace(/\n/g, '<br>') + '</div>';
  }

  function termsLineHtml(order, kind) {
    if (kind === 'Packing List' || kind === 'Shipping Mark') return TD.shippingInfoLine(order)
      ? '<div class="termsline">' + E(TD.shippingInfoLine(order)) + '</div>' : '';
    if (TD.docOptions(order).compact) {
      const origin = order.origin || ((order.lines || []).find((l) => l.origin) || {}).origin || '';
      // When a quotation lists several trade terms, a single global
      // "FedEx Freight Collect" would contradict DAP / DDP (seller pays
      // freight). Freight responsibility is stated per scheme in Price
      // Options, so omit the global line instead of printing an internal
      // cross-reference ("See Price Options below") on a customer document.
      const multi = kind === 'Quotation' && TD.priceOptions(order).length > 1;
      const filed = [
        [T(order, 'incoterm'), termsPhrase(order)],
        ['Country of Origin', origin],
        multi ? null : ['Shipping Terms', order.shipVia || ''],
        ['Payment Terms', order.payment || ''],
      ].filter((entry) => entry && entry[1]);
      return filed.length
        ? '<div class="termsline">' + filed.map(([k, v]) => '<b>' + E(k) + ':</b> ' + E(v)).join('　|　') + '</div>'
        : '';
    }
    const bits = [
      order.incoterm && T(order, 'incoterm') + ': ' + [order.incoterm, order.incotermPlace].filter(Boolean).join(' '),
      order.lead && T(order, 'lead') + ': ' + order.lead,
      order.payment && T(order, 'payment') + ': ' + order.payment,
      order.currency && T(order, 'currency') + ': ' + order.currency,
      order.refCurrency && TD.num(order.fxRate) > 0 && T(order, 'reference') + ': 1 ' + order.currency + ' = ' + TD.num(order.fxRate) + ' ' + order.refCurrency,
    ].filter(Boolean);
    return bits.length ? '<div class="termsline">' + E(bits.join('　|　')) + '</div>' : '';
  }

  function partiesHtml(order, kind) {
    const s = TD.sellerData(order) || {};
    const isPL = kind === 'Packing List' || kind === 'Shipping Mark';
    const sellerTitle = isPL ? T(order, 'shipper') : T(order, 'seller');
    const buyerTitle = isPL ? T(order, 'consignee') : T(order, 'buyer');
    const compact = TD.docOptions(order).compact;
    // Filed documents are English-only: no Chinese legal name, no credit code,
    // no WhatsApp line. Those belong in the full internal layout.
    const sellerLines = [
      '<b>' + E(s.legalEn || '') + '</b>',
      !compact && s.legalCn ? E(s.legalCn) : '',
      !compact && s.creditCode ? 'Credit Code: ' + E(s.creditCode) : '',
      'Address: ' + E(s.addressEn || ''),
      [s.contact && 'Contact: ' + E(s.contact), !compact && s.contactTitle && '(' + E(s.contactTitle) + ')'].filter(Boolean).join(' '),
      [s.phone && 'Tel: ' + E(s.phone), !compact && s.whatsapp && 'WhatsApp: ' + E(s.whatsapp)].filter(Boolean).join(' · '),
      s.email ? 'Email: ' + E(s.email) : '',
    ].filter(Boolean);
    const buyerLines = [
      '<b>' + E(order.buyer || '') + '</b>',
      order.shipTo || order.buyerAddress ? 'Address: ' + E(order.shipTo || order.buyerAddress || '') : '',
      isPL && !compact && order.buyerAddress && order.shipTo && order.shipTo !== order.buyerAddress
        ? 'Bill To: ' + E(order.buyerAddress) : '',
      [order.city, order.country].filter(Boolean).join(', '),
      [order.contact && 'Contact: ' + E(order.contact), order.buyerPhone && 'Tel: ' + E(order.buyerPhone)].filter(Boolean).join(' · '),
      order.email ? 'Email: ' + E(order.email) : '',
      order.buyerTaxId ? 'Tax / VAT / EORI: ' + E(order.buyerTaxId) : '',
      // Optional buyer-side logistics contacts. Left blank on most orders;
      // printed only when the operator actually entered them.
      order.consignee && order.consignee !== order.buyer ? 'Consignee: ' + E(order.consignee) : '',
      !isPL && order.notifyParty ? 'Notify Party: ' + E(order.notifyParty) : '',
    ].filter(Boolean);
    return '<div class="parties"><div class="party"><h3>' + E(sellerTitle) + '</h3>' + sellerLines.join('<br>') + '</div>' +
      '<div class="party"><h3>' + E(buyerTitle) + '</h3>' + buyerLines.join('<br>') + '</div></div>';
  }

  function productDetailsHtml(line) {
    const details = [
      line.material && 'Material: ' + line.material,
      line.specification && 'Spec: ' + line.specification,
      line.hardness && 'Hardness: ' + line.hardness + ' Shore A',
      line.color && 'Color: ' + line.color,
      line.dimensions && 'Size: ' + line.dimensions,
    ].filter(Boolean);
    const extra = String(line.docDescription || '').trim();
    return (details.length || extra)
      ? '<div class="pdetails">' + E(details.join(' · ')) + (extra ? '<br>' + E(extra).replace(/\n/g, '<br>') : '') + '</div>'
      : '';
  }

  function colsHtml(cols) {
    const total = cols.reduce((sum, col) => sum + (col.w || 10), 0) || 1;
    return '<colgroup>' + cols.map((col) => '<col style="width:' + (col.w / total * 100).toFixed(2) + '%">').join('') + '</colgroup>' +
      '<thead><tr>' + cols.map((col) => '<th' + (col.num ? ' class="num"' : '') + '>' + col.label + '</th>').join('') + '</tr></thead>';
  }

  function imageHtml(line, show) {
    if (!show || !line.image) return '';
    return '<img class="pimg" src="' + E(TD.assetUrl(line.image)) + '" alt="">';
  }

  function itemTableHtml(order, kind) {
    const lines = order.lines || [];
    const cur = order.currency || '';
    const opt = TD.docOptions(order);
    const hasRef = !!(order.refCurrency && TD.num(order.fxRate) > 0);
    const isPI = kind === 'Proforma Invoice';
    const isCI = kind === 'Commercial Invoice';
    const showImages = opt.showImages;
    // Filed invoice: five columns (Item / Description / Qty / Unit Price /
    // Amount). HS code and part numbers live INSIDE the description, exactly
    // as on the user's real documents. PI keeps its two advance-payment cols.
    if (opt.compact) {
      const dep = TD.num(order.depositPct);
      const cc = [
        { label: 'Item No.', w: 6 }, { label: T(order, 'description'), w: 50 },
        { label: T(order, 'qty'), w: 10, num: true },
        { label: 'Unit Price (' + E(cur) + ')', w: 14, num: true },
        { label: 'Amount (' + E(cur) + ')', w: 16, num: true },
      ];
      if (isPI) cc.push({ label: 'Ratio', w: 7, num: true }, { label: 'Advance (' + E(cur) + ')', w: 11, num: true });
      const cbody = lines.map((line, i) => {
        const amount = TD.num(line.qty) * TD.num(line.price);
        // Product name first, then the buyer's part number, then the free-text
        // description. The HS code used to be prefixed to the description and
        // made the first line read like a customs string; it now sits on its
        // own small line for the buyer while staying on the invoice for CI.
        const desc = [
          E(line.name || ''),
          line.model ? '(Vend P/N: ' + E(line.model) + ')' : '',
        ].filter(Boolean).join(' ') +
          (line.docDescription ? '<br>' + E(line.docDescription).replace(/\n/g, '<br>') : '') +
          (line.hsCode ? '<div class="hsline">HS Code: ' + E(line.hsCode) + '</div>' : '');
        const cells = [String(i + 1), desc, String(TD.num(line.qty)),
          TD.formatUnitPrice(line.price), TD.money(amount)];
        if (isPI) cells.push(dep + '%', TD.money(amount * dep / 100));
        return '<tr>' + cells.map((c, j) =>
          '<td' + (cc[j] && cc[j].num ? ' class="num"' : '') + '>' + c + '</td>').join('') + '</tr>';
      }).join('');
      return '<table class="items">' + colsHtml(cc) + '<tbody>' + cbody + '</tbody></table>';
    }
    const cols = [{ label: '#', w: 3.5 }];
    if (showImages) cols.push({ label: T(order, 'photo'), w: 8 });
    cols.push({ label: T(order, 'description'), w: 25 },
      { label: T(order, 'model'), w: 11 });
    if (opt.showMOQ) cols.push({ label: T(order, 'moq'), w: 6, num: true });
    cols.push({ label: T(order, 'qty'), w: 6.5, num: true },
      { label: T(order, 'unit'), w: 5 });
    if (isCI && opt.showHS) cols.push({ label: T(order, 'hsCode'), w: 8 }, { label: T(order, 'origin'), w: 6 });
    if (opt.showGW) cols.push({ label: T(order, 'totalGW'), w: 7, num: true });
    if (opt.showNW) cols.push({ label: T(order, 'totalNW'), w: 7, num: true });
    if (opt.showVOL) cols.push({ label: T(order, 'totalVOL'), w: 7, num: true });
    cols.push({ label: T(order, 'unitPrice') + '<br>(' + E(cur) + ')', w: 10, num: true },
      { label: T(order, 'amount') + '<br>(' + E(cur) + ')', w: 11, num: true });
    if (hasRef) cols.push({ label: T(order, 'reference') + '<br>(' + E(order.refCurrency) + ')', w: 9, num: true });
    if (isPI) cols.push({ label: 'DEPOSIT %', w: 6, num: true }, { label: 'DEPOSIT', w: 9, num: true });
    const deposit = TD.num(order.depositPct);
    const numOrDash = (v, digits) => TD.num(v) ? TD.money(v, digits == null ? 2 : digits) : '';
    const body = lines.map((line, index) => {
      const amount = TD.num(line.qty) * TD.num(line.price);
      const cells = [String(index + 1)];
      if (showImages) cells.push(imageHtml(line, true));
      cells.push(E(line.name || '') + productDetailsHtml(line), E(line.model || ''));
      if (opt.showMOQ) cells.push(numOrDash(line.moq, 0));
      cells.push(String(TD.num(line.qty)), E(line.unit || ''));
      if (isCI && opt.showHS) cells.push(E(line.hsCode || ''), E(line.origin || ''));
      if (opt.showGW) cells.push(numOrDash(line.totalGW));
      if (opt.showNW) cells.push(numOrDash(line.totalNW));
      if (opt.showVOL) cells.push(numOrDash(line.totalVOL, 3));
      cells.push(TD.formatUnitPrice(line.price), TD.money(amount));
      if (hasRef) cells.push(TD.money(amount * TD.num(order.fxRate)));
      if (isPI) cells.push(deposit + '%', TD.money(amount * deposit / 100));
      return '<tr>' + cells.map((cell, i) => '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + cell + '</td>').join('') + '</tr>';
    }).join('');
    return '<table class="items">' + colsHtml(cols) + '<tbody>' + body + '</tbody></table>';
  }

  function totalsHtml(order, kind) {
    if (kind === 'Packing List' || kind === 'Shipping Mark') return '';
    const total = TD.num(order.total);
    const hasRef = !!(order.refCurrency && TD.num(order.fxRate) > 0);
    const discount = TD.num(order.discountPct), vat = TD.num(order.vatPct);
    const discounted = total * (1 - discount / 100);
    const grand = discounted * (1 + vat / 100);
    let adjustments = '';
    if (discount || vat) {
      adjustments = '<div class="words" style="color:#33475c">' +
        (discount ? 'Discount / 折扣: ' + discount + '%　' : '') +
        (vat ? 'VAT / 税率: ' + vat + '%　' : '') +
        'Payable / 应付: ' + E(order.currency) + ' ' + TD.money(grand) + '</div>';
    }
    // Filed invoices carry one English "SAY ... ONLY" line, not a bilingual
    // two-line block. Compact mode drops the Chinese duplicate.
    const compact = TD.docOptions(order).compact;
    const words = compact
      ? '<div class="words">' + E(TD.amountInWordsEN(grand, order.currency)) + '</div>'
      : '<div class="words"><b>' + T(order, 'amountInWords') + ':</b><br>' +
        E(TD.amountInWordsCN(grand, order.currency)) + '<br>' +
        E(TD.amountInWordsEN(grand, order.currency)) + '</div>';
    const refTotal = hasRef
      ? '<div class="reftotal">' + T(order, 'refTotal') + ' (' + E(order.refCurrency) + ' Reference): ' +
        E(order.refCurrency) + ' ' + TD.money(grand * TD.num(order.fxRate)) + '</div>'
      : '';
    const fxNote = hasRef
      ? '<div class="words" style="color:#526273">Note: The ' + E(order.refCurrency) +
        ' amount is for buyer\'s reference only, calculated at 1 ' + E(order.currency) + ' = ' +
        TD.num(order.fxRate) + ' ' + E(order.refCurrency) + ' · Rate date: ' + E(order.fxDate || 'Not recorded') +
        '. This does not change the payable amount. 参考币种仅用于展示，不改变应付金额。</div>'
      : '';
    if (compact) {
      return '<div class="totals">Total Amount: ' + E(order.currency) + ' ' + TD.money(grand) + '</div>' +
        words + adjustments;
    }
    return '<div class="totals">' + T(order, 'total') + ': ' + E(order.currency) + ' ' + TD.money(grand) + '</div>' +
      refTotal + words + adjustments + fxNote;
  }

  function bankBlockHtml(order, kind) {
    if (!TD.bankDisclosure(order, kind)) return '';
    const account = TD.accountFor(order);
    if (!account) return '<div class="block"><h3>' + T(order, 'bank') + '</h3><p class="warn">未选择有效收款账户，本单证不包含银行资料。</p></div>';
    const rows = [
      ['账户名称 / Account Name', account.beneficiary],
      ['账号 / Account No.', account.account_no],
      ['开户银行 / Bank Name', account.bank_cn && account.bank_cn !== account.bank ? account.bank + ' / ' + account.bank_cn : account.bank],
      ['银行地址 / Bank Address', account.bank_address],
      ['SWIFT / BIC', account.swift],
      ['收款人地址 / Beneficiary Address', account.beneficiary_address],
      ['账户币种 / Currency', account.currency],
    ];
    // Internal verification notes stay in the pre-flight report; they are
    // never printed on a customer-facing document.
    return '<div class="block"><h3>' + T(order, 'bank') + '</h3>' +
      '<div class="bankrows">' + rows.filter(([, value]) => value)
        .map(([label, value]) => '<div><b>' + E(label) + ':</b> ' + E(value) + '</div>').join('') + '</div>' +
      '<h3 style="margin-top:7px">汇款须知 / Remittance Notes</h3><ul>' +
      TD.remittanceNotes(order, kind).map((note) => '<li>' + E(note) + '</li>').join('') + '</ul>' +
      '<p style="margin:5px 0 0;font-size:8.4px;color:#526273">本账户资料仅用于本订单结算。账户变更以加盖公章的书面通知并经电话核实后生效。</p>' +
      '</div>';
  }

  function termsBlockHtml(order) {
    const custom = order && order.terms
      ? (Array.isArray(order.terms) ? order.terms.join('\n') : String(order.terms))
      : '';
    // The four built-in TERMS & CONDITIONS are not part of the user's real
    // filed invoices. In compact mode print terms only when explicitly typed.
    if (TD.docOptions(order).compact && !custom.trim()) return '';
    const terms = TD.termList(order);
    if (!terms.length) return '';
    return '<div class="block"><h3>' + T(order, 'terms') + '</h3><ol>' +
      terms.map((term) => '<li>' + E(term) + '</li>').join('') + '</ol></div>';
  }

  /** Explicit answer to "Any mould or tooling cost, if applicable?".
   *  Silence is not an answer on a formal quotation. */
  function toolingHtml(order, force) {
    const cost = TD.num(order && order.toolingCost);
    const note = String((order && order.toolingNote) || '').trim();
    if (!force && !(cost > 0) && !note) return '';
    return '<div class="tooling"><b>Mould / Tooling Cost:</b> ' +
      (cost > 0 ? E((order && order.currency) || '') + ' ' + E(TD.money(cost))
        : 'No mould / tooling cost (not applicable / 不适用)') +
      (note ? ' — ' + E(note) : '') + '</div>';
  }

  /** One quotation, several trade terms. The item table above keeps the
   *  primary Incoterm's unit prices; this table prices the SAME product lines
   *  under every other term the buyer asked for, plus each term's all-in total.
   *  There is deliberately NO "average unit price": dividing one order total
   *  by a free-text "quantity tier" produced nonsense (EUR 880 / 2,500 =
   *  0.352 for parts that actually cost 0.034 and 0.053) and mixed different
   *  products into one number. Quantities come from the product lines only.
   *  Only Quotation prints it - an invoice must never carry two incoterms. */
  function priceOptionsHtml(order) {
    const opts = TD.priceOptions(order);
    if (opts.length < 2) return '';
    const cur = order.currency || '';
    const lines = order.lines || [];
    const baseIdx = TD.termOptionBaseIndex(order);
    const baseTerm = [order.incoterm, order.incotermPlace].filter(Boolean).join(' ') || 'the primary trade terms';
    const computed = opts.map(function (o) { return TD.termOptionTotal(lines, o); });
    const totals = opts.map(function (o, j) {
      return computed[j] != null ? Math.round(computed[j] * 100) / 100 : TD.num(o.total);
    });
    const labels = opts.map(function (o, j) {
      return [o.incoterm, o.place].filter(Boolean).join(' ') || ('Option ' + (j + 1));
    });
    const body = lines.map(function (l, i) {
      const name = String(l.name || ('Item ' + (i + 1))).trim();
      const model = l.model ? ' <small>' + E(l.model) + '</small>' : '';
      const cells = opts.map(function (o, j) {
        let text;
        if (j === baseIdx) text = TD.formatUnitPrice(TD.num(l.price));
        else if (TD.termOptionHasUnitPrices(o)) {
          const v = o.unitPrices[i];
          const price = (v === '' || v == null || !isFinite(Number(v))) ? TD.num(l.price) : Number(v);
          text = TD.formatUnitPrice(price);
        } else text = '—';
        return '<td class="num">' + E(text) + '</td>';
      }).join('');
      return '<tr><td>' + E(name) + model + '</td>' +
        '<td class="num">' + E(TD.money(TD.num(l.qty), 0)) + '</td>' + cells + '</tr>';
    }).join('');
    const totalRow = '<tr class="totalrow"><td colspan="2">Total (' + E(cur) + ')</td>' +
      opts.map(function (o, j) { return '<td class="num">' + E(TD.money(totals[j])) + '</td>'; }).join('') + '</tr>';
    // "BASE" is internal bookkeeping and must never reach the buyer.
    const metaRow = '<tr><td colspan="2" class="muted">Freight / Remarks</td>' +
      opts.map(function (o) {
        const bits = [o.freight, o.note].filter(function (x) { return x && !/^base$/i.test(x); });
        return '<td class="muted">' + E(bits.join(' · ')) + '</td>';
      }).join('') + '</tr>';
    const unknown = opts.some(function (o, j) { return j !== baseIdx && computed[j] == null; });
    const colgroup = '<colgroup><col style="width:30%"><col style="width:8%">' +
      opts.map(function () { return '<col style="width:' + (62 / opts.length).toFixed(2) + '%">'; }).join('') +
      '</colgroup>';
    return '<div class="block priceoptions"><h3>报价方案 / Price Options (INCOTERMS 2020)</h3>' +
      '<div class="posub">Unit prices in the item table above apply to ' + E(baseTerm) +
      '. The table below gives each item\'s unit price under the other trade terms requested, ' +
      'and each term\'s all-in total for the quantities shown. ' +
      'DAP / DDP include freight to the named place; FOB / EXW do not.' +
      (unknown ? ' A dash means no per-item price was quoted for that term; only its all-in total is confirmed.' : '') +
      '</div>' +
      '<table class="items qmatrix">' + colgroup +
      '<thead><tr><th>Item / 型号</th><th>Qty</th>' +
      labels.map(function (t) {
        return '<th class="num">' + E(t) + '<small>Unit price (' + E(cur) + ')</small></th>';
      }).join('') + '</tr></thead><tbody>' + body + totalRow + metaRow + '</tbody></table>' +
      toolingHtml(order, true) + '</div>';
  }

  function extraBlocksHtml(order, kind) {
    if (kind === 'Packing List' || kind === 'Shipping Mark') return '';
    if (kind === 'Quotation') {
      // Every line is conditional: an unfilled field is omitted entirely.
      // A customer-facing quotation must never show "Validity: —".
      const noteLines = [
        order.valid ? T(order, 'validity') + ': ' + E(order.valid) : '',
        order.lead ? T(order, 'lead') + ': ' + E(order.lead) : '',
        order.incoterm ? T(order, 'incoterm') + ': ' + E(termsPhrase(order)) : '',
        order.payment ? T(order, 'payment') + ': ' + E(order.payment) : '',
        // Optional, fully user-supplied. The system never invents REACH / RoHS
        // or any other certificate; leave blank when not applicable.
        String(order.complianceNote || '').trim()
          ? '合规 / 认证 Compliance &amp; Certificates: ' +
            E(String(order.complianceNote).trim()).replace(/\n/g, '<br>') : '',
        String(order.termQuoteNote || '').trim()
          ? T(order, 'remarks') + ': ' + E(String(order.termQuoteNote).trim()) : '',
      ].filter(Boolean);
      return '<div class="block"><h3>报价说明 / Quotation Notes</h3>' +
        noteLines.map((line) => '<div>' + line + '</div>').join('') +
        '</div>' +
        priceOptionsHtml(order) +
        (TD.priceOptions(order).length > 1 ? '' : toolingHtml(order, false)) +
        termsBlockHtml(order);
    }
    if (kind === 'Proforma Invoice') {
      const total = TD.num(order.total), pct = TD.num(order.depositPct);
      const deposit = total * pct / 100;
      return '<div class="block"><h3>预付款明细 / Advance Payment Details</h3>' +
        '<div>订单总额 / Order Total: ' + E(order.currency) + ' ' + TD.money(total) + '</div>' +
        '<div>预付款比例 / Advance Ratio: ' + pct + '%　预付款金额 / Advance Amount: ' + E(order.currency) + ' ' + TD.money(deposit) + '</div>' +
        '<div>发货前付清 / Balance before shipment: ' + E(order.currency) + ' ' + TD.money(total - deposit) + '</div>' +
        (order.payment ? '<div>' + T(order, 'payment') + ': ' + E(order.payment) + '</div>' : '') + '</div>' +
        (String(order.docNote || '').trim() ? '<div class="block"><h3>' + T(order, 'remarks') + '</h3>' + E(order.docNote).replace(/\n/g, '<br>') + '</div>' : '') +
        termsBlockHtml(order) + bankBlockHtml(order, kind);
    }
    if (kind === 'Sales Contract') {
      // Two compact columns instead of eight stacked <li> rows: the contract
      // is the longest document and its signature used to spill onto a blank
      // page (page 4 of the user's 9-page export).
      // Only filled rows appear. Empty shipment / PO slots used to print as
      // "—" on the customer's contract (a real defect in the Italian bundle).
      const rows = [
        ['Seller / 卖方', (TD.sellerData(order) || {}).legalEn || ''],
        ['Buyer / 买方', order.buyer || ''],
        ['Contract Value / 合同金额', order.currency + ' ' + TD.money(order.total)],
        ['Trade Terms / 贸易术语', termsPhrase(order)],
        ['Payment / 付款', order.payment || ''],
        ['Delivery / 交期', order.lead || ''],
        ['Shipment / 装运', [order.shipVia, order.portLoad, order.portDest].filter(Boolean).join(' → ')],
        ['Buyer P.O. No. / 采购单号', order.po || ''],
      ].filter(([, v]) => v);
      return '<div class="block"><h3>合同条款 / Sales Terms</h3><div class="saleterms">' +
        rows.map(([k, v]) => '<span><b>' + E(k) + ':</b> ' + E(v) + '</span>').join('') +
        '</div></div>' + termsBlockHtml(order) + bankBlockHtml(order, kind);
    }
    if (kind === 'Commercial Invoice') {
      // The user's filed customs invoice has no shipment-details block: the
      // header already carries Trade Terms / Shipping Terms / Origin / Payment.
      // Compact mode keeps it to the header, table, total and signature.
      if (TD.docOptions(order).compact) return bankBlockHtml(order, kind);
      return '<div class="block"><h3>装运信息 / Shipment Details</h3>' +
        [
          [order.shipVia ? 'Ship Via / 运输方式: ' + E(order.shipVia) : '', order.po ? 'P.O. No. / 采购单号: ' + E(order.po) : ''].filter(Boolean).join('　'),
          [order.portLoad ? 'Port of Loading / 装运港: ' + E(order.portLoad) : '', order.portDest ? 'Port of Destination / 目的港: ' + E(order.portDest) : ''].filter(Boolean).join('　'),
          termsPhrase(order) ? 'Trade Terms / 贸易术语: ' + E(termsPhrase(order)) : '',
          order.lcNo ? 'L/C No. / 信用证号: ' + E(order.lcNo) : '',
          order.blNo ? 'B/L No. / 提单号: ' + E(order.blNo) : '',
          order.containerNo ? 'Container No. / 集装箱号: ' + E(order.containerNo) + (order.sealNo ? '　Seal No.: ' + E(order.sealNo) : '') : '',
        ].filter(Boolean).map((line) => '<div>' + line + '</div>').join('') +
        '<div style="font-size:8.4px;color:#526273">HS Code 与原产国仅在上方产品明细表中列示一次。</div></div>' +
        termsBlockHtml(order) + bankBlockHtml(order, kind);
    }
    return '';
  }

  // ------------------------------------------------------------ packing list
  /** Prominent four-figure packing summary (packages / gross / net / volume).
   *  Only rendered when real carton rows exist; no zeros for missing data.
   *  A figure whose cartons are still pending is OMITTED entirely: a partial
   *  sum presented as "TOTAL G.W." would be a false fact on a buyer-facing
   *  document. The operator fills the missing values at order step 4. */
  function packingSummaryHtml(order, parsed) {
    if (!parsed.boxes.length) return '';
    const t = parsed.totals;
    const items = [['TOTAL PACKAGES / 总箱数', String(t.boxes)]];
    if (!t.pendingGross) items.push(['TOTAL G.W. / 总毛重', TD.money(t.gross) + ' kg']);
    items.push(['TOTAL N.W. / 总净重', TD.money(t.net) + ' kg']);
    if (!t.pendingCbm) items.push(['TOTAL VOL. / 总体积', t.cbm.toFixed(3) + ' CBM']);
    return '<div class="plsum">' + items.map(([label, value]) =>
      '<div><span>' + E(label) + '</span><b>' + E(value) + '</b></div>').join('') + '</div>';
  }

  /** Shipping marks / notify party line on CI and PL. Filled values only.
   *  Only the FIRST main-mark line goes here: the full multi-line mark has its
   *  own block on the PL, and repeating all lines above the table looked
   *  cluttered (the user's filed PL is a clean six-column table). */
  function docMarksHtml(order, kind) {
    if (kind !== 'Commercial Invoice' && kind !== 'Packing List') return '';
    const mark = TD.shippingMark(order);
    const bits = [];
    bits.push('Shipping Marks: ' + (mark.isNM ? 'N/M' : E(mark.main[0] || 'N/M')));
    if (String(order.notifyParty || '').trim()) {
      bits.push('Notify Party: ' + E(String(order.notifyParty).trim()));
    }
    return '<div class="marksline">' + bits.join('　|　') + '</div>';
  }

  function packingTableHtml(order) {
    const report = TD.packingReport(order);
    const parsed = report.parsed;
    const opt = TD.docOptions(order);
    const mark = TD.shippingMark(order);
    // The SHIPPING MARK column is narrow. Keep only the first main-mark line in
    // the table; the full multi-line mark is printed in its own block below.
    // Do not pre-escape here: cells escape their own values exactly once.
    const markText = mark.isNM ? 'N/M' : (mark.main[0] || 'N/M');
    // N/M means NO marks. Per-carton marks typed earlier must not contradict
    // the MAIN MARK block (a defect found in the user's exported PL).
    const rowMark = (box) => mark.isNM ? 'N/M' : (box.mark || markText);
    const cols = [
      { label: 'NO.', w: 4 }, { label: T(order, 'pkgMark'), w: 6.5 },
      { label: T(order, 'shippingMark'), w: 12 },
      { label: T(order, 'description'), w: 22 }, { label: T(order, 'model'), w: 10 },
      { label: T(order, 'qty'), w: 6, num: true }, { label: T(order, 'unit'), w: 5 },
      { label: T(order, 'net'), w: 7, num: true }, { label: T(order, 'gross'), w: 7, num: true },
      { label: T(order, 'dimensions'), w: 11 }, { label: T(order, 'cbm'), w: 7, num: true },
    ];
    const span = cols.length;
    const cell = (v, num) => '<td' + (num ? ' class="num"' : '') + '>' + v + '</td>';
    // A missing weight / dimension is printed as an empty cell, never as
    // "0.00" (a false fact) or an internal "待核对" stamp. Pre-flight checks
    // list what is missing; the buyer-facing table just omits it.
    const t = parsed.totals;
    const hasBoxes = parsed.boxes.length > 0;
    const gross = (box) => box.grossPending ? '' : TD.money(box.gross);
    const cbm = (box) => box.dimPending ? '' : box.cbm.toFixed(3);
    const dims = (box) => box.dimPending ? '' : E(box.dimensions || '');
    // Same rule for the grand total: if any carton still lacks a weight or
    // volume, leave that total empty instead of printing a partial sum that
    // looks like a confirmed figure.
    const grandGross = () => t.pendingGross ? '' : TD.money(t.gross);
    const grandCbm = () => t.pendingCbm ? '' : t.cbm.toFixed(3);
    let body = '';
    if (!parsed.boxes.length) {
      // No packing data: never print a row of zeros or an internal warning on
      // a customer document. Pre-flight checks block this document instead.
      body = '';
    } else if (opt.packingMode === 'byPiece') {
      let n = 0;
      for (const box of parsed.boxes) {
        for (const item of box.items) {
          n++;
          body += '<tr>' + cell(String(n)) + cell(E(box.no)) +
            cell(E(rowMark(box))) + cell(E(item.description || item.model || '')) +
            cell(E(item.model || '')) + cell(String(item.qty), true) + cell(E(item.unit || '')) +
            cell(TD.money(box.net / Math.max(box.items.length, 1))) +
            cell(box.grossPending ? '' : TD.money(box.gross / Math.max(box.items.length, 1)), true) +
            cell(dims(box)) + cell(box.dimPending ? '' : (box.cbm / Math.max(box.items.length, 1)).toFixed(3), true) + '</tr>';
        }
      }
    } else {
      parsed.boxes.forEach((box, i) => {
        const packName = box.packType || 'Carton';
        body += '<tr class="group"><th colspan="' + span + '">' + E(T(order, 'package')) + ' ' + (i + 1) + ': ' +
          E(packName) + '　No. ' + E(box.no) + '　' + T(order, 'shippingMark') + ': ' + E(rowMark(box)) + '</th></tr>';
        for (const item of box.items) {
          body += '<tr>' + cell('') + cell(E(box.no)) + cell(E(rowMark(box))) +
            cell(E(item.description || item.model || '')) + cell(E(item.model || '')) +
            cell(String(item.qty), true) + cell(E(item.unit || '')) +
            cell(TD.money(TD.num(item.net))) + cell('', true) + cell('') + cell('', true) + '</tr>';
        }
        body += '<tr class="subtotal"><td colspan="7">' + E(T(order, 'subtotal')) + ' — ' + E(box.no) + '</td>' +
          cell(TD.money(box.net), true) + cell(gross(box), true) + cell(dims(box)) + cell(cbm(box), true) + '</tr>';
      });
    }
    if (hasBoxes) {
      body += '<tr class="grand"><td colspan="5"><b>' + E(T(order, 'total')) + '</b>　' + T(order, 'pkgs') + ': ' + t.boxes + '</td>' +
        cell('<b>' + t.qty + '</b>', true) + cell('') + cell('<b>' + TD.money(t.net) + '</b>', true) +
        cell('<b>' + grandGross() + '</b>', true) + cell('') + cell('<b>' + grandCbm() + '</b>', true) + '</tr>';
    }
    const table = '<table class="items">' + colsHtml(cols) + '<tbody>' + body + '</tbody></table>';
    const summary = packingSummaryHtml(order, parsed);

    const reconCols = [{ label: T(order, 'model'), w: 34 }, { label: 'ORDERED', w: 20, num: true },
      { label: 'PACKED', w: 20, num: true }, { label: 'DIFF.', w: 26, num: true }];
    const recon = '<table class="items">' + colsHtml(reconCols) + '<tbody>' +
      (parsed.perModel.map((r) => '<tr><td>' + E(r.key) + (r.unmatched ? ' <span class="warn">(未匹配)</span>' : '') + '</td>' +
        '<td class="num">' + r.ordered + '</td><td class="num">' + r.packed + '</td>' +
        '<td class="num' + (r.diff ? ' warn' : '') + '">' + (r.diff > 0 ? '+' : '') + r.diff + '</td></tr>').join('') ||
        '<tr><td colspan="4">无产品行。</td></tr>') + '</tbody></table>';

    const note = String(order.packingNote || TD.DEFAULT_PACKING_NOTE).trim();
    const markBlock = '<div class="block"><h3>' + T(order, 'mainMark') + ' / ' + T(order, 'shippingMark') + '</h3>' +
      (mark.isNM ? 'N/M — No Marks / 无唛头'
        : '<div class="markfull">' + E(mark.main.join('\n')).replace(/\n/g, '<br>') + '</div>' +
          (mark.side ? '<div>' + T(order, 'sideMark') + ': ' + E(mark.side) + '</div>' : '') +
          (mark.note ? '<div>' + E(mark.note) + '</div>' : '')) + '</div>';
    const noteBlock = '<div class="block"><h3>' + T(order, 'notes') + ' / ' + T(order, 'remarks') + '</h3>' +
      E(note).replace(/\n/g, '<br>') + '</div>';
    // Internal checks (empty packing data, unconfirmed draft, quantity
    // mismatch, N/M conflict) belong in the pre-flight check report INSIDE
    // the app. They must never be typeset onto a document sent to a buyer,
    // forwarder or customs broker. Export is blocked there instead.
    // Compact packing list = the six-column table actually filed with the
    // forwarder / customs broker. No shipping-mark column, no package
    // grouping, no reconciliation table, no notes, no draft banner.
    if (opt.compact) {
      const simpleCols = [
        { label: 'Carton No.', w: 10 }, { label: T(order, 'description'), w: 44 },
        { label: T(order, 'qty'), w: 11, num: true }, { label: 'G.W. (KG)', w: 11, num: true },
        { label: 'N.W. (KG)', w: 11, num: true }, { label: 'Measurement (CBM)', w: 13, num: true },
      ];
      let simpleBody = '';
      if (hasBoxes) {
        parsed.boxes.forEach((box, i) => {
          const desc = box.items.map((it) => {
            const base = it.description || it.model || '';
            return (it.model && it.model !== base) ? base + ' (' + it.model + ')' : base;
          }).filter(Boolean).join(' / ');
          const qty = box.items.reduce((sum, it) => sum + TD.num(it.qty), 0);
          simpleBody += '<tr>' + cell(String(box.no || i + 1)) + cell(E(desc)) +
            cell(String(qty), true) + cell(gross(box), true) +
            cell(TD.money(box.net), true) + cell(cbm(box), true) + '</tr>';
        });
        simpleBody += '<tr class="grand"><td colspan="2"><b>' + E(T(order, 'total')) + '</b>　' +
          T(order, 'pkgs') + ': ' + t.boxes + '</td>' +
          cell('<b>' + t.qty + '</b>', true) + cell('<b>' + grandGross() + '</b>', true) +
          cell('<b>' + TD.money(t.net) + '</b>', true) + cell('<b>' + grandCbm() + '</b>', true) + '</tr>';
      }
      const simpleTable = '<table class="items">' + colsHtml(simpleCols) + '<tbody>' + simpleBody + '</tbody></table>';
      return summary + simpleTable;
    }
    return summary + table + markBlock + '<div class="block"><h3>逐型号数量核对 / Quantity Reconciliation</h3>' + recon + '</div>' +
      noteBlock;
  }

  // ------------------------------------------------------------ shipping mark page
  function shippingMarkHtml(order) {
    const mark = TD.shippingMark(order);
    const parsed = TD.parseCartons(order.cartons, order.lines);
    const t = parsed.totals;
    const boxNos = parsed.boxes.map((b) => b.no).filter(Boolean);
    const content = mark.isNM
      ? '<div class="nm">N/M</div><div class="side">NO MARKS / 无唛头</div>'
      : '<div class="main">' + E(mark.main.join('\n')) + '</div>' +
        (mark.side ? '<div class="side">' + E(mark.side).replace(/\n/g, '<br>') + '</div>' : '');
    // A carton label is three lines. The system already knows the carton count,
    // so print it instead of leaving a blank to fill in by hand.
    if (TD.docOptions(order).compact) {
      return '<div class="markbox compact">' + content +
        (t.boxes ? '<div class="side">Carton ____ of ' + t.boxes + '</div>' : '') + '</div>' +
        '<div class="words" style="text-align:center;color:#526273">Repeat this block on every outer carton.</div>';
    }
    const metaRows = [
      [T(order, 'no'), TD.documentNumber(order, 'Packing List')],
      [T(order, 'po'), order.po || ''],
      [T(order, 'consignee'), order.buyer || ''],
      [T(order, 'portDest'), order.portDest || ''],
      [T(order, 'pkgs'), String(t.boxes)],
      ['Carton No.', boxNos.length ? boxNos[0] + ' – ' + boxNos[boxNos.length - 1] : ''],
      // Weights/volume are facts: omit them entirely when no carton was
      // recorded (never "0.00 kg"), and omit a partial sum when any carton
      // still lacks that value. Pre-flight checks tell the operator what to fill.
      [T(order, 'gross'), t.boxes && !t.pendingGross ? TD.money(t.gross) + ' kg' : ''],
      [T(order, 'net'), t.boxes ? TD.money(t.net) + ' kg' : ''],
      [T(order, 'cbm'), t.boxes && !t.pendingCbm ? t.cbm.toFixed(3) : ''],
      [T(order, 'containerNo'), order.containerNo || ''],
      [T(order, 'sealNo'), order.sealNo || ''],
    ].filter(([, v]) => v).map(([k, v]) => '<div>' + E(k) + ': ' + E(v) + '</div>').join('');
    return '<div class="markbox">' + content + '</div>' +
      (metaRows ? '<div class="block markmeta"><h3>' + T(order, 'remarks') + ' / Carton Information</h3>' +
        metaRows + '</div>' : '');
  }

  // ------------------------------------------------------------ signature
  function signatureHtml(order, kind) {
    // A carton label is stuck on the box: no buyer/seller signature belongs on it.
    // The user's filed packing list is also a pure 6-column data table with
    // no signature block at all.
    if (kind === 'Shipping Mark' || (TD.docOptions(order).compact && kind === 'Packing List')) return '';
    const opt = TD.docOptions(order);
    if (!opt.showSignature) return '';
    const s = TD.sellerData(order) || {};
    const cfg = TD.signatureConfig(order);
    // Filed invoices are signed by the seller only. No buyer confirmation
    // column and no COMPANY SEAL placeholder circle on the default output.
    if (opt.compact) {
      return '<div class="signature compact">' +
        '<div><b>For and on behalf of</b><br>' + E(s.legalEn || '') + '<br><br>' +
        T(order, 'signature') + ': ______________________<br>' +
        (s.contact ? 'Name: ' + E(s.contact) + '<br>' : '') +
        'Title: ' + E(cfg.seller) + '</div></div>';
    }
    return '<div class="signature">' +
      '<div>' + (cfg.showStamp ? '<div class="stamp">COMPANY<br>SEAL</div>' : '') +
      '<b>For and on behalf of</b><br>' + E(s.legalEn || '') + '<br><br>' +
      T(order, 'signature') + ': ______________________<br>' +
      (s.contact ? 'Name: ' + E(s.contact) + '<br>' : '') +
      'Date: ______________________<br><span class="pdetails">' + E(cfg.seller) + '</span></div>' +
      '<div><b>' + T(order, 'buyerConfirm') + '</b><br>' + E(order.buyer || '') + '<br><br>' +
      T(order, 'seal') + ': ______________________<br>' +
      T(order, 'signature') + ': ______________________<br>' +
      'Date: ______________________<br><span class="pdetails">' + E(cfg.buyer) + '</span></div></div>';
  }

  /** One printable A4 section. Pure function: no DOM access. */
  TD.renderPage = function (order, kind) {
    const isMark = kind === 'Shipping Mark';
    const lang = TD.docOptions(order).language;
    const info = TD.languageInfo(lang);
    const notes = String(order.notes || '').trim();
    const compact = TD.docOptions(order).compact;
    // A carton label is just the mark. The user's filed Shipping Marks file
    // has three lines and no seller/buyer header, invoice number or parties.
    if (compact && isMark) {
      return '<section class="docpage compact-page" data-kind="Shipping Mark" data-lang="' + E(lang) + '"' +
        (info.dir === 'rtl' ? ' dir="rtl"' : '') + '>' +
        '<div class="markhead"><b>' + E(TD.docTitle('Shipping Mark', lang)) + '</b>' +
        (order.po ? '　P/O No.: ' + E(order.po) : '') + '</div>' +
        shippingMarkHtml(order) + '</section>';
    }
    return '<section class="docpage' + (compact ? ' compact-page' : '') + '" data-kind="' + E(kind) + '" data-lang="' + E(lang) + '"' +
      (info.dir === 'rtl' ? ' dir="rtl"' : '') + '>' +
      headerHtml(order) +
      titleBarHtml(order, kind) +
      docRemarkHtml(order, kind) +
      termsLineHtml(order, kind) +
      partiesHtml(order, kind) +
      docMarksHtml(order, kind) +
      (isMark ? shippingMarkHtml(order)
        : kind === 'Packing List' ? packingTableHtml(order)
          : itemTableHtml(order, kind) + totalsHtml(order, kind) + extraBlocksHtml(order, kind)) +
      (!isMark && notes && (!compact || kind !== 'Packing List')
        ? (compact ? '<div class="remark">Remark: ' + E(notes).replace(/\n/g, '<br>') + '</div>'
          : '<div class="block"><h3>' + T(order, 'notes') + '</h3>' + E(notes).replace(/\n/g, '<br>') + '</div>')
        : '') +
      signatureHtml(order, kind) +
      '</section>';
  };

  /** Full standalone HTML for single or merged output. */
  TD.buildDocumentHtml = function (order, kinds) {
    const list = (kinds && kinds.length) ? kinds : ['Quotation'];
    const pages = list.map((kind) => TD.renderPage(order, kind)).join('\n');
    // Chrome pre-fills "Save as PDF" with document.title. Give every single
    // document its own filename so one card click = one correctly named file.
    const safeNo = String(order.no || 'TradeDocs').replace(/[\\/:*?"<>|]/g, '-');
    const title = list.length === 1
      ? safeNo + ' ' + TD.docTitle(list[0], 'zh') + ' ' + list[0]
      : 'TradeDocs Pro bundle ' + (order.no || '');
    const lang = TD.docOptions(order).language;
    const info = TD.languageInfo(lang);
    const html = '<!doctype html><html lang="' + E(lang) + '"' + (info.dir === 'rtl' ? ' dir="rtl"' : '') +
      '><head><meta charset="utf-8"><title>' + E(title) + '</title><style>' +
      TD.printCss(order) + '</style></head><body>' +
      '<div class="toolbar"><button onclick="print()">打印 / 另存为 PDF</button> ' +
      '<button onclick="window.close()">关闭</button>' +
      '<span class="hint">请核对金额、收款账户与装箱数据后再对外发送；打印时须勾选「背景图形 / Background graphics」，否则表头配色不会输出；' +
      '<b>页眉和页脚已由系统自动抑制（A4 零页边距），无需再手动关闭</b>，不会再出现空白页脚、打印日期与页码。' +
      (list.length > 1
        ? '本窗口按单证分页，每份单证另起一页；这是【一个多页 PDF】，对外请用单证中心的单张卡片分别导出。'
        : '本窗口只有这一份单证，另存为 PDF 就是一个独立文件。') + '</span></div>' +
      pages + '</body></html>';
    return { html, title, banned: TD.brandCheck(html), kinds: list };
  };

  /** Several independent Quotation pages, each with ONE Incoterm and its own
   *  unit prices / total. Used when a buyer asks for a separate FOB quote and
   *  a separate DDP quote. One print window = one PDF; page ranges let the
   *  user save them as individual files without opening N pop-ups. */
  TD.buildTermQuotationHtml = function (orders) {
    const list = (orders || []).filter(Boolean);
    const first = list[0] || {};
    const pages = list.map(function (o) { return TD.renderPage(o, 'Quotation'); }).join('\n');
    const lang = TD.docOptions(first).language;
    const info = TD.languageInfo(lang);
    const labels = list.map(function (o) {
      return [o.incoterm, o.incotermPlace].filter(Boolean).join(' ');
    }).join(' / ');
    const title = list.length === 1
      ? 'Quotation ' + TD.documentNumber(first, 'Quotation')
      : 'TradeDocs Pro term quotations - ' + (first.no || '');
    const hint = list.length > 1
      ? '本窗口共 ' + list.length + ' 页，每页是一份独立报价单（' + E(labels) +
        '），各自只有一种贸易术语。要拆成多个 PDF，请在打印对话框里分别选页码 1、2…各存一次；' +
        '也可回到上方选「仅导出某个术语」单独导出。' : '';
    const html = '<!doctype html><html lang="' + E(lang) + '"' +
      (info.dir === 'rtl' ? ' dir="rtl"' : '') + '><head><meta charset="utf-8"><title>' +
      E(title) + '</title><style>' + TD.printCss(first) + '</style></head><body>' +
      '<div class="toolbar"><button onclick="print()">打印 / 另存为 PDF</button> ' +
      '<button onclick="window.close()">关闭</button>' +
      '<span class="hint">请核对金额、收款账户与装箱数据后再对外发送；打印时须勾选「背景图形 / Background graphics」，' +
      '<b>页眉和页脚已由系统自动抑制（A4 零页边距）</b>，不会再出现空白页脚、打印日期与页码。' +
      hint + '</span></div>' + pages + '</body></html>';
    return { html: html, title: title, banned: TD.brandCheck(html), kinds: ['Quotation'] };
  };

  // ------------------------------------------------------------ preview entry points
  TD.openPrintWindow = function (built, autoPrint) {
    if (built.banned && built.banned.length) {
      TD.alert('已阻止生成单证：检测到对外禁用词（共 ' + built.banned.length +
        ' 处）。\n\n客户可见文件只使用核定的对外品牌名。请修改产品名称、备注或档案后重试。');
      return null;
    }
    const w = window.open('', '_blank');
    if (!w) { TD.alert('请允许弹出窗口后再预览单证。'); return null; }
    w.document.open();
    w.document.write(built.html);
    w.document.close();
    // Second guard: about:blank was the URL Chrome printed in the page footer.
    // @page{margin:0} already removes the footer entirely; giving the print
    // window a real same-origin URL also removes the literal string if some
    // other browser still draws headers/footers. A hash keeps the document
    // base path unchanged for any relative assets.
    try {
      const base = location.protocol === 'http:' || location.protocol === 'https:'
        ? location.origin + location.pathname : location.href.split('#')[0];
      w.history.replaceState(null, '', base + '#document-' +
        encodeURIComponent(String(built.title || '')));
    } catch (e) { /* not all browsers allow rewriting about:blank; CSS handles it */ }
    if (autoPrint) {
      const trigger = () => { try { w.focus(); w.print(); } catch (e) { /* user can print manually */ } };
      if (w.document.readyState === 'complete') setTimeout(trigger, 350);
      else w.addEventListener('load', () => setTimeout(trigger, 350));
    }
    return w;
  };

  TD.preview = function (id, kind) {
    const order = TD.get('orders').find((item) => item.id === id);
    if (!order) return;
    if (TD.guardDocuments && !TD.guardDocuments(order, [kind || 'Quotation'])) return;
    TD.openPrintWindow(TD.buildDocumentHtml(order, [kind || 'Quotation']));
  };

  TD.previewBundle = function (id, kinds) {
    const order = TD.get('orders').find((item) => item.id === id);
    if (!order) return;
    const list = kinds && kinds.length ? kinds : ['Quotation'];
    if (TD.guardDocuments && !TD.guardDocuments(order, list)) return;
    TD.openPrintWindow(TD.buildDocumentHtml(order, list));
  };
})();
