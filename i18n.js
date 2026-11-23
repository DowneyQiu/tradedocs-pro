/* Output languages, colour themes and document options.
   Pure data + helpers. No DOM, no network, no business data. */
(function () {
  'use strict';
  const TD = window.TD;

  // ------------------------------------------------------------ languages
  TD.LANGUAGES = [
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'zh', label: '简体中文', dir: 'ltr' },
    { code: 'es', label: 'Español 西班牙语', dir: 'ltr' },
    { code: 'fr', label: 'Français 法语', dir: 'ltr' },
    { code: 'de', label: 'Deutsch 德语', dir: 'ltr' },
    { code: 'th', label: 'ไทย 泰语', dir: 'ltr' },
    { code: 'vi', label: 'Tiếng Việt 越南语', dir: 'ltr' },
    { code: 'ar', label: 'العربية 阿拉伯语', dir: 'rtl' },
    { code: 'pt', label: 'Português 葡萄牙语', dir: 'ltr' },
    { code: 'ru', label: 'Русский 俄语', dir: 'ltr' },
    { code: 'ja', label: '日本語 日语', dir: 'ltr' },
  ];

  const EN = {
    Quotation: 'QUOTATION', 'Proforma Invoice': 'PROFORMA INVOICE',
    'Sales Contract': 'SALES CONTRACT', 'Commercial Invoice': 'COMMERCIAL INVOICE',
    'Packing List': 'PACKING LIST', 'Shipping Mark': 'SHIPPING MARK',
    no: 'Document No.', date: 'Date', validUntil: 'Valid Until', po: 'P.O. No.',
    quotationNo: 'Quotation No.', contractNo: 'Contract No.', invoiceNo: 'Invoice No.',
    lcNo: 'L/C No.', blNo: 'B/L No.', containerNo: 'Container No.', sealNo: 'Seal No.',
    incoterm: 'Trade Terms', currency: 'Currency', shipVia: 'Mode of Transport',
    portLoad: 'Port of Loading', portDest: 'Port of Discharge', etd: 'ETD', vessel: 'Vessel / Voyage',
    lead: 'Lead Time', validity: 'Validity', payment: 'Payment Terms',
    seller: 'SELLER', buyer: 'BUYER', shipper: 'SHIPPER / EXPORTER', consignee: 'CONSIGNEE',
    description: 'DESCRIPTION OF GOODS', model: 'SPEC / MODEL', qty: 'QTY', unit: 'UNIT',
    unitPrice: 'UNIT PRICE', amount: 'AMOUNT', moq: 'MOQ', hsCode: 'HS CODE', origin: 'ORIGIN',
    totalGW: 'TOTAL GW', totalNW: 'TOTAL NW', totalVOL: 'TOTAL VOL', photo: 'PHOTO',
    package: 'Package', pkgMark: 'PKG MARK', shippingMark: 'SHIPPING MARK',
    gross: 'G.W. (KG)', net: 'N.W. (KG)', dimensions: 'L×W×H (CM)', cbm: 'VOL (M³)',
    total: 'TOTAL', amountInWords: 'Amount in Words', notes: 'NOTES', terms: 'TERMS & CONDITIONS',
    bank: 'BENEFICIARY BANK DETAILS', signature: 'Authorized Signature',
    buyerConfirm: 'Buyer Confirmation', seal: 'Company Seal', pkgs: 'PKGS',
    reference: 'Reference', subtotal: 'Package subtotal', remarks: 'Remarks',
    mode: 'Packing Mode', page: 'Page', draft: 'DRAFT', refTotal: 'TOTAL (Reference)',
    mainMark: 'MAIN MARK', sideMark: 'SIDE MARK', nm: 'N/M (NO MARKS)',
    printedFrom: 'Generated from one order snapshot',
  };

  // Only the strings that appear on customer-facing documents are translated.
  // Business content (product names, addresses, notes) is never machine-translated.
  const DICT = {
    zh: {
      Quotation: '报价单', 'Proforma Invoice': '形式发票', 'Sales Contract': '销售合同',
      'Commercial Invoice': '商业发票', 'Packing List': '装箱单', 'Shipping Mark': '箱唛 / 唛头',
      no: '单证编号', date: '日期', validUntil: '有效期至', po: '客户采购单号',
      quotationNo: '报价单号', contractNo: '合同编号', invoiceNo: '发票编号',
      lcNo: '信用证号', blNo: '提单号', containerNo: '集装箱号', sealNo: '封条号',
      incoterm: '贸易术语', currency: '结算货币', shipVia: '运输方式',
      portLoad: '装运港', portDest: '目的港', etd: '预计开船日', vessel: '船名/航次',
      lead: '交货期', validity: '报价有效期', payment: '付款方式',
      seller: '卖方', buyer: '买方', shipper: '发货人 / 出口商', consignee: '收货人',
      description: '货物描述', model: '规格 / 型号', qty: '数量', unit: '单位',
      unitPrice: '单价', amount: '金额', moq: '最小起订量', hsCode: 'HS 编码', origin: '原产国',
      totalGW: '总毛重', totalNW: '总净重', totalVOL: '总体积', photo: '图片',
      package: '包装件', pkgMark: '件号', shippingMark: '唛头',
      gross: '毛重(kg)', net: '净重(kg)', dimensions: '长×宽×高(cm)', cbm: '体积(m³)',
      total: '合计', amountInWords: '金额大写', notes: '备注', terms: '条款与条件',
      bank: '收款账户资料', signature: '授权签字', buyerConfirm: '买方确认', seal: '公司盖章',
      pkgs: '件数', reference: '参考', subtotal: '本箱小计', remarks: '备注',
      draft: '草案', refTotal: '参考币种合计', mainMark: '主唛', sideMark: '侧唛',
      nm: 'N/M（无唛头）', printedFrom: '由同一订单快照生成',
    },
    es: {
      Quotation: 'COTIZACIÓN', 'Proforma Invoice': 'FACTURA PROFORMA',
      'Sales Contract': 'CONTRATO DE VENTA', 'Commercial Invoice': 'FACTURA COMERCIAL',
      'Packing List': 'LISTA DE EMBALAJE', 'Shipping Mark': 'MARCAS DE ENVÍO',
      no: 'N.º de documento', date: 'Fecha', validUntil: 'Válido hasta', po: 'N.º de pedido',
      quotationNo: 'N.º de cotización', contractNo: 'N.º de contrato', invoiceNo: 'N.º de factura',
      lcNo: 'N.º de crédito documentario', blNo: 'N.º de conocimiento', containerNo: 'N.º de contenedor',
      incoterm: 'Incoterm', currency: 'Moneda', shipVia: 'Transporte',
      description: 'DESCRIPCIÓN', model: 'MODELO', qty: 'CANT.', unit: 'UNIDAD',
      unitPrice: 'PRECIO UNIT.', amount: 'IMPORTE', moq: 'PEDIDO MÍN.', hsCode: 'CÓDIGO HS',
      gross: 'PESO BRUTO', net: 'PESO NETO', dimensions: 'L×A×A (CM)', cbm: 'VOL (M³)',
      total: 'TOTAL', notes: 'NOTAS', terms: 'CONDICIONES', seller: 'VENDEDOR', buyer: 'COMPRADOR',
      shipper: 'EXPEDIDOR', consignee: 'DESTINATARIO', shippingMark: 'MARCA', signature: 'Firma autorizada',
    },
    fr: {
      Quotation: 'DEVIS', 'Proforma Invoice': 'FACTURE PROFORMA',
      'Sales Contract': 'CONTRAT DE VENTE', 'Commercial Invoice': 'FACTURE COMMERCIALE',
      'Packing List': 'LISTE DE COLISAGE', 'Shipping Mark': 'MARQUES D’EXPÉDITION',
      no: 'N° document', date: 'Date', validUntil: 'Valable jusqu’au', po: 'N° commande',
      quotationNo: 'N° devis', contractNo: 'N° contrat', invoiceNo: 'N° facture',
      lcNo: 'N° crédit documentaire', blNo: 'N° connaissement', containerNo: 'N° conteneur',
      incoterm: 'Incoterm', currency: 'Devise', shipVia: 'Transport',
      description: 'DÉSIGNATION', model: 'MODÈLE', qty: 'QTÉ', unit: 'UNITÉ',
      unitPrice: 'PRIX UNIT.', amount: 'MONTANT', moq: 'MIN. COMMANDE', hsCode: 'CODE SH',
      gross: 'POIDS BRUT', net: 'POIDS NET', dimensions: 'L×l×H (CM)', cbm: 'VOL (M³)',
      total: 'TOTAL', notes: 'NOTES', terms: 'CONDITIONS', seller: 'VENDEUR', buyer: 'ACHETEUR',
      shipper: 'EXPÉDITEUR', consignee: 'DESTINATAIRE', shippingMark: 'MARQUE', signature: 'Signature autorisée',
    },
    de: {
      Quotation: 'ANGEBOT', 'Proforma Invoice': 'PROFORMA-RECHNUNG',
      'Sales Contract': 'KAUFVERTRAG', 'Commercial Invoice': 'HANDELSRECHNUNG',
      'Packing List': 'PACKLISTE', 'Shipping Mark': 'VERSANDMARKIERUNG',
      no: 'Dokument-Nr.', date: 'Datum', validUntil: 'Gültig bis', po: 'Bestell-Nr.',
      quotationNo: 'Angebots-Nr.', contractNo: 'Vertrag-Nr.', invoiceNo: 'Rechnungs-Nr.',
      lcNo: 'Akkreditiv-Nr.', blNo: 'Konnossement-Nr.', containerNo: 'Container-Nr.',
      incoterm: 'Lieferbedingung', currency: 'Währung', shipVia: 'Transportart',
      description: 'WARENBEZEICHNUNG', model: 'MODELL', qty: 'MENGE', unit: 'EINHEIT',
      unitPrice: 'EINZELPREIS', amount: 'BETRAG', moq: 'MINDESTBESTELLMENGE', hsCode: 'HS-CODE',
      gross: 'BRUTTO', net: 'NETTO', dimensions: 'L×B×H (CM)', cbm: 'VOLUMEN (M³)',
      total: 'GESAMT', notes: 'HINWEISE', terms: 'BEDINGUNGEN', seller: 'VERKÄUFER', buyer: 'KÄUFER',
      shipper: 'VERSENDER', consignee: 'EMPFÄNGER', shippingMark: 'MARKIERUNG', signature: 'Unterschrift',
    },
    th: {
      Quotation: 'ใบเสนอราคา', 'Proforma Invoice': 'ใบแจ้งหนี้ชั่วคราว',
      'Sales Contract': 'สัญญาขาย', 'Commercial Invoice': 'ใบกำกับภาษี',
      'Packing List': 'รายการบรรจุ', 'Shipping Mark': 'เครื่องหมายจัดส่ง',
      no: 'เลขที่เอกสาร', date: 'วันที่', po: 'เลขที่ใบสั่งซื้อ', quotationNo: 'เลขที่ใบเสนอราคา',
      contractNo: 'เลขที่สัญญา', invoiceNo: 'เลขที่ใบกำกับภาษี', lcNo: 'เลขที่ L/C', blNo: 'เลขที่ B/L',
      description: 'รายการสินค้า', model: 'รุ่น / สเปค', qty: 'จำนวน', unit: 'หน่วย',
      unitPrice: 'ราคาต่อหน่วย', amount: 'จำนวนเงิน', moq: 'สั่งซื้อขั้นต่ำ',
      gross: 'น้ำหนักรวม', net: 'น้ำหนักสุทธิ', cbm: 'ปริมาตร (ม³)', total: 'รวมทั้งสิ้น',
      seller: 'ผู้ขาย', buyer: 'ผู้ซื้อ', shipper: 'ผู้ส่งออก', consignee: 'ผู้รับสินค้า',
      shippingMark: 'เครื่องหมาย', notes: 'หมายเหตุ', terms: 'เงื่อนไข', signature: 'ลายเซ็น',
    },
    vi: {
      Quotation: 'BÁO GIÁ', 'Proforma Invoice': 'HÓA ĐƠN CHIẾU LỆ',
      'Sales Contract': 'HỢP ĐỒNG MUA BÁN', 'Commercial Invoice': 'HÓA ĐƠN THƯƠNG MẠI',
      'Packing List': 'PHIẾU ĐÓNG GÓI', 'Shipping Mark': 'KÝ HIỆU GỬI HÀNG',
      no: 'Số chứng từ', date: 'Ngày', po: 'Số đơn đặt hàng', quotationNo: 'Số báo giá',
      contractNo: 'Số hợp đồng', invoiceNo: 'Số hóa đơn', lcNo: 'Số L/C', blNo: 'Số vận đơn',
      description: 'MÔ TẢ HÀNG', model: 'QUY CÁCH / MÃ', qty: 'SỐ LƯỢNG', unit: 'ĐVT',
      unitPrice: 'ĐƠN GIÁ', amount: 'THÀNH TIỀN', moq: 'SL TỐI THIỂU',
      gross: 'TỔNG TRỌNG LƯỢNG', net: 'TRỌNG LƯỢNG TĨNH', cbm: 'THỂ TÍCH (M³)',
      total: 'TỔNG CỘNG', seller: 'BÊN BÁN', buyer: 'BÊN MUA', shipper: 'BÊN GỬI',
      consignee: 'BÊN NHẬN', shippingMark: 'KÝ HIỆU', notes: 'GHI CHÚ', terms: 'ĐIỀU KHOẢN',
    },
    ar: {
      Quotation: 'عرض سعر', 'Proforma Invoice': 'فاتورة مبدئية',
      'Sales Contract': 'عقد بيع', 'Commercial Invoice': 'فاتورة تجارية',
      'Packing List': 'قائمة التعبئة', 'Shipping Mark': 'علامات الشحن',
      no: 'رقم المستند', date: 'التاريخ', po: 'رقم أمر الشراء', quotationNo: 'رقم عرض السعر',
      contractNo: 'رقم العقد', invoiceNo: 'رقم الفاتورة', lcNo: 'رقم الاعتماد', blNo: 'رقم بوليصة الشحن',
      description: 'وصف البضاعة', model: 'الموديل', qty: 'الكمية', unit: 'الوحدة',
      unitPrice: 'سعر الوحدة', amount: 'المبلغ', moq: 'الحد الأدنى',
      gross: 'الوزن الإجمالي', net: 'الوزن الصافي', cbm: 'الحجم (م³)', total: 'الإجمالي',
      seller: 'البائع', buyer: 'المشتري', shipper: 'المُصَدِّر', consignee: 'المُرسَل إليه',
      shippingMark: 'العلامة', notes: 'ملاحظات', terms: 'الشروط', signature: 'التوقيع',
    },
    pt: {
      Quotation: 'COTAÇÃO', 'Proforma Invoice': 'FATURA PROFORMA',
      'Sales Contract': 'CONTRATO DE VENDA', 'Commercial Invoice': 'FATURA COMERCIAL',
      'Packing List': 'LISTA DE EMBALAGEM', 'Shipping Mark': 'MARCAS DE ENVIO',
      no: 'N.º do documento', date: 'Data', po: 'N.º do pedido', quotationNo: 'N.º da cotação',
      contractNo: 'N.º do contrato', invoiceNo: 'N.º da fatura', lcNo: 'N.º da carta de crédito',
      blNo: 'N.º do conhecimento', description: 'DESCRIÇÃO', model: 'MODELO', qty: 'QTD',
      unit: 'UNIDADE', unitPrice: 'PREÇO UNIT.', amount: 'VALOR', moq: 'PEDIDO MÍN.',
      gross: 'PESO BRUTO', net: 'PESO LÍQUIDO', cbm: 'VOLUME (M³)', total: 'TOTAL',
      seller: 'VENDEDOR', buyer: 'COMPRADOR', shipper: 'EXPORTADOR', consignee: 'DESTINATÁRIO',
      shippingMark: 'MARCA', notes: 'NOTAS', terms: 'CONDIÇÕES', signature: 'Assinatura',
    },
    ru: {
      Quotation: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', 'Proforma Invoice': 'ПРОФОРМА-ИНВОЙС',
      'Sales Contract': 'ДОГОВОР КУПЛИ-ПРОДАЖИ', 'Commercial Invoice': 'КОММЕРЧЕСКИЙ ИНВОЙС',
      'Packing List': 'УПАКОВОЧНЫЙ ЛИСТ', 'Shipping Mark': 'МАРКИРОВКА',
      no: 'Номер документа', date: 'Дата', po: 'Номер заказа', quotationNo: 'Номер КП',
      contractNo: 'Номер договора', invoiceNo: 'Номер счёта', lcNo: 'Номер аккредитива',
      blNo: 'Номер коносамента', description: 'НАИМЕНОВАНИЕ', model: 'МОДЕЛЬ', qty: 'КОЛ-ВО',
      unit: 'ЕД.', unitPrice: 'ЦЕНА ЗА ЕД.', amount: 'СУММА', moq: 'МИН. ЗАКАЗ',
      gross: 'ВЕС БРУТТО', net: 'ВЕС НЕТТО', cbm: 'ОБЪЁМ (М³)', total: 'ИТОГО',
      seller: 'ПРОДАВЕЦ', buyer: 'ПОКУПАТЕЛЬ', shipper: 'ГРУЗООТПРАВИТЕЛЬ',
      consignee: 'ГРУЗОПОЛУЧАТЕЛЬ', shippingMark: 'МАРКА', notes: 'ПРИМЕЧАНИЯ',
      terms: 'УСЛОВИЯ', signature: 'Подпись',
    },
    ja: {
      Quotation: '見積書', 'Proforma Invoice': 'プロフォーマインボイス',
      'Sales Contract': '売買契約書', 'Commercial Invoice': '商業送り状',
      'Packing List': 'パッキングリスト', 'Shipping Mark': '荷印',
      no: '書類番号', date: '日付', po: '注文番号', quotationNo: '見積番号',
      contractNo: '契約番号', invoiceNo: '送り状番号', lcNo: '信用状番号', blNo: '船荷証券番号',
      description: '品名', model: '型番・仕様', qty: '数量', unit: '単位',
      unitPrice: '単価', amount: '金額', moq: '最小ロット',
      gross: '総重量', net: '正味重量', cbm: '容積 (m³)', total: '合計',
      seller: '売主', buyer: '買主', shipper: '荷送人', consignee: '荷受人',
      shippingMark: '荷印', notes: '備考', terms: '条件', signature: '署名',
    },
  };

  TD.docTitle = function (kind, lang) {
    const dict = DICT[lang] || {};
    return dict[kind] || EN[kind] || String(kind || '').toUpperCase();
  };
  TD.t = function (key, lang) {
    const dict = DICT[lang] || {};
    return dict[key] || EN[key] || key;
  };
  TD.languageInfo = function (code) {
    return TD.LANGUAGES.find((l) => l.code === code) || TD.LANGUAGES[0];
  };

  // ------------------------------------------------------------ themes
  TD.THEMES = [
    { id: 'classicBlue', name: '经典蓝', accent: '#173e67', headerBg: '#173e67', headerFg: '#ffffff', soft: '#eaf1f7', line: '#173e67' },
    { id: 'slate', name: '石板灰', accent: '#48566b', headerBg: '#48566b', headerFg: '#ffffff', soft: '#eef1f5', line: '#48566b' },
    { id: 'minimal', name: '简约灰', accent: '#5c6672', headerBg: '#f2f4f7', headerFg: '#25313f', soft: '#f7f9fb', line: '#8a94a0' },
    { id: 'teal', name: '青绿', accent: '#0f766e', headerBg: '#0f766e', headerFg: '#ffffff', soft: '#e7f5f3', line: '#0f766e' },
    { id: 'coral', name: '珊瑚红', accent: '#b23a2e', headerBg: '#b23a2e', headerFg: '#ffffff', soft: '#fbecea', line: '#b23a2e' },
    { id: 'forest', name: '森林绿', accent: '#2f6b3a', headerBg: '#2f6b3a', headerFg: '#ffffff', soft: '#eaf4ec', line: '#2f6b3a' },
    { id: 'violet', name: '紫罗兰', accent: '#4b3f9e', headerBg: '#4b3f9e', headerFg: '#ffffff', soft: '#eeecfa', line: '#4b3f9e' },
    { id: 'ink', name: '深邃黑', accent: '#1f2937', headerBg: '#1f2937', headerFg: '#ffffff', soft: '#f0f2f4', line: '#1f2937' },
    { id: 'gold', name: '金棕', accent: '#8a5a1d', headerBg: '#8a5a1d', headerFg: '#ffffff', soft: '#f7f1e7', line: '#8a5a1d' },
  ];
  TD.theme = function (order) {
    const id = (order && (order.theme || order.colorTheme)) || 'classicBlue';
    return TD.THEMES.find((t) => t.id === id) || TD.THEMES[0];
  };

  // ------------------------------------------------------------ options
  TD.PACKAGING_TYPES = ['Carton 纸箱', 'Wooden Case 木箱', 'Pallet 托盘', 'Roll/Coil 卷/轴',
    'Bundle/Bale 包/捆', 'Drum/Barrel 桶', 'Bag/Sack 袋', 'Custom 自定义'];
  TD.DEFAULT_TERMS = [
    'All prices are subject to change without prior notice.',
    'Goods remain the property of the seller until full payment is received.',
    'Claims must be raised within 7 days of receipt of goods.',
    'Force majeure events excuse any delay in performance.',
  ];
  TD.DEFAULT_PACKING_NOTE = 'All goods are new and in good condition. Packed in export standard cartons.';

  /** Normalised per-order rendering options. Missing fields fall back to safe defaults. */
  TD.docOptions = function (order) {
    const o = order || {};
    const bool = (key, fallback) => o[key] == null ? fallback : !!o[key];
    return {
      language: o.language || 'en',
      theme: TD.theme(o),
      showImages: bool('showProductImages', false),
      showMOQ: bool('showMOQ', false),
      showGW: bool('showGW', false),
      showNW: bool('showNW', false),
      showVOL: bool('showVOL', false),
      showHS: bool('showHS', true),
      showSignature: bool('showSignature', true),
      // Compact output matches the user's real filed documents: a 2-page
      // English invoice, a 6-column packing list and a 3-line carton mark.
      // Absent on legacy orders => full output, so saved orders never change.
      compact: bool('compact', false),
      packingMode: o.packingMode === 'byPiece' ? 'byPiece' : 'byCarton',
      printRefs: Object.assign({
        invoiceNo: true, contractNo: true, po: true, piNo: true,
        quotationNo: true, lcNo: true, blNo: true, containerNo: true,
      }, o.printRefs || {}),
    };
  };

  TD.termList = function (order) {
    if (!order) return TD.DEFAULT_TERMS.slice();
    if (Array.isArray(order.terms)) return order.terms.filter((x) => String(x || '').trim());
    if (typeof order.terms === 'string' && order.terms.trim()) return order.terms.split('\n').filter((x) => x.trim());
    return TD.DEFAULT_TERMS.slice();
  };

  /** Reference numbers shown on each document type — each number stays in its own business slot. */
  TD.referenceRows = function (order, kind) {
    const o = order || {}, opt = TD.docOptions(o), p = opt.printRefs, t = (k) => TD.t(k, opt.language);
    const out = [
      [t('no'), TD.documentNumber(o, kind)],
      [t('date'), TD.docDate(o, kind)],
    ];
    if (kind === 'Quotation') {
      if (o.valid) out.push([t('validUntil'), o.valid]);
    } else if (kind === 'Proforma Invoice') {
      if (p.po && o.po) out.push([t('po'), o.po]);
      if (p.quotationNo) out.push([t('quotationNo'), TD.documentNumber(o, 'Quotation')]);
    } else if (kind === 'Sales Contract') {
      if (p.po && o.po) out.push([t('po'), o.po]);
      if (p.piNo) out.push(['PI No.', TD.documentNumber(o, 'Proforma Invoice')]);
    } else if (kind === 'Commercial Invoice') {
      if (p.po && o.po) out.push([t('po'), o.po]);
      if (p.contractNo) out.push([t('contractNo'), TD.documentNumber(o, 'Sales Contract')]);
      if (p.lcNo && o.lcNo) out.push([t('lcNo'), o.lcNo]);
      if (p.blNo && o.blNo) out.push([t('blNo'), o.blNo]);
    } else if (kind === 'Packing List') {
      if (p.invoiceNo) out.push([t('invoiceNo'), TD.documentNumber(o, 'Commercial Invoice')]);
      if (p.contractNo) out.push([t('contractNo'), TD.documentNumber(o, 'Sales Contract')]);
      if (p.po && o.po) out.push([t('po'), o.po]);
      if (p.lcNo && o.lcNo) out.push([t('lcNo'), o.lcNo]);
      if (p.piNo && o.piNo) out.push(['PI No.', o.piNo]);
    }
    const extras = [
      [t('incoterm'), [o.incoterm, o.incotermPlace].filter(Boolean).join(' ')],
      [t('currency'), o.currency],
      [t('shipVia'), o.shipVia],
      [t('portLoad'), o.portLoad],
      [t('portDest'), o.portDest],
      [t('lead'), o.lead],
      [t('validity'), o.valid],
      [t('payment'), o.payment],
    ];
    for (const [label, value] of extras) if (value) out.push([label, value]);
    // de-duplicate by label
    const seen = new Set();
    return out.filter(([label]) => { if (seen.has(label)) return false; seen.add(label); return true; });
  };

  /** Shipping mark data: main / side marks, N/M handling, per-carton marks. */
  TD.shippingMark = function (order) {
    const o = order || {};
    const raw = String(o.shippingMark || '').trim();
    const lines = raw.split('\n').map((x) => x.trim()).filter(Boolean);
    const isNM = !!o.markNone || /^n\/?m$/i.test(raw) || !lines.length;
    return {
      isNM,
      main: isNM ? '' : lines,
      side: String(o.sideMark || '').trim(),
      note: String(o.markNote || '').trim(),
      display: isNM ? 'N/M' : lines,
    };
  };

  /** Complete Incoterm phrase. The named place is user-supplied ONLY: the
   *  system never invents "Shanghai Port" or any other port. An empty place
   *  simply prints the term; pre-flight checks warn the operator to fill it. */
  TD.termsPhrase = function (order) {
    const o = order || {};
    const term = String(o.incoterm || '').trim();
    if (!term) return '';
    return [term, String(o.incotermPlace || '').trim()].filter(Boolean).join(' ') +
      ' (INCOTERMS 2020)';
  };

  TD.shippingInfoLine = function (order) {
    const o = order || {}, t = (k) => TD.t(k, TD.docOptions(o).language);
    const bits = [
      o.shipVia && t('shipVia') + ': ' + o.shipVia,
      o.portLoad && t('portLoad') + ': ' + o.portLoad,
      o.portDest && t('portDest') + ': ' + o.portDest,
      o.etd && t('etd') + ': ' + o.etd,
      o.vessel && t('vessel') + ': ' + o.vessel,
      TD.termsPhrase(o),
    ].filter(Boolean);
    return bits.join('　|　');
  };

  TD.signatureConfig = function (order) {
    const o = order || {};
    return {
      seller: String(o.sellerSignature || 'Sales Manager, Authorized Signature').trim(),
      buyer: String(o.buyerSignature || 'Accepted By, Authorized Representative').trim(),
      // Real filed invoices carry a signature only, never a COMPANY SEAL
      // placeholder circle. Opt-in, not on by default.
      showStamp: o.showStamp === true,
    };
  };
})();
