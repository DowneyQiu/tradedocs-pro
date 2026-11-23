/* Contracting entity + bank account resolution. Single source of truth for all documents.
   Business rule: there is ONE contracting / document entity, configured by the
   licensee in [出单主体]. Every quotation, PI, contract, commercial invoice,
   packing list and shipping mark is issued and signed by that entity.
   Bank accounts are independent of the contracting entity: a payee name that
   differs from the issuer is a normal collection arrangement and never blocks
   output. Data comes only from the local SQLite `entities` / `accounts`
   collections; no account number, bank name, SWIFT or beneficiary name is
   ever rewritten.
   Copyright (c) 2026 拓珀新材料（成都）有限公司.
   Licensed under the TradeDocs Pro Source-Available / Non-Commercial Distribution License 1.0; see LICENSE. */
(function () {
  'use strict';
  const TD = window.TD;

  TD.entities = () => TD.get('entities');
  TD.accounts = () => TD.get('accounts');

  /** Entities allowed to ISSUE documents. Payment-only entities are excluded
      even when an older local database has no `role` field yet. */
  TD.contractEntities = function () {
    const list = TD.entities();
    if (!list.length) return [];
    const byRole = list.filter((e) => e.role === 'contract');
    if (byRole.length) return byRole;
    // Compatibility with databases seeded before the `role` field existed.
    const byCode = list.filter((e) => e.code === 'CN' || e.id === 'cn');
    if (byCode.length) return byCode;
    const active = list.filter((e) => e.status !== 'payment_only' && e.status !== 'legacy_only');
    return active.length ? active : [list[0]];
  };

  /** The single entity that signs contracts and appears on every document. */
  TD.contractEntity = function () { return TD.contractEntities()[0] || null; };

  /** All documents resolve through this. Order-level entity ids are ignored:
      a saved order may never switch the document issuer. */
  TD.entityFor = function () { return TD.contractEntity(); };

  TD.accountFor = function (order) {
    const id = order && order.account;
    return TD.accounts().find((item) => item.id === id) || null;
  };

  /** Normalized, entity-only seller block. Missing fields stay empty - never borrowed from another entity. */
  TD.sellerData = function (order) {
    const e = TD.entityFor(order);
    if (!e) return null;
    return {
      id: e.id,
      brand: e.brandDisplay || '', brandCn: e.brandDisplayCn || '',
      legalEn: e.legalNameEn || '', legalCn: e.legalNameCn || '',
      addressEn: e.addressEn || '', addressCn: e.addressCn || '',
      contact: e.contact || '', contactTitle: e.contactTitle || '',
      email: e.email || '', phone: e.phone || '', whatsapp: e.whatsapp || '',
      website: e.website || '', logo: e.logo || '', creditCode: e.creditCode || '',
      verified: e.verified !== false, status: e.status || 'active',
      notes: Array.isArray(e.notes) ? e.notes : [],
      logoNote: e.logoNote || '', creditCodeNote: e.creditCodeNote || '',
    };
  };

  /** Warnings tied to the chosen entity (shown in the order form and in checks). */
  TD.entityWarnings = function (order) {
    const out = [];
    const e = TD.entityFor(order);
    if (!e) {
      out.push('未找到出单主体资料。请通过启动器打开本地版，或在【出单主体】中检查资料是否完整。');
      return out;
    }
    if (!e.verified) {
      out.push('【' + (e.legalNameEn || e.id) + '】主体资料尚未全部核定，单证使用前必须人工核对。');
    }
    for (const note of (e.notes || [])) out.push(note);
    if (!e.email || !e.phone) {
      out.push('该主体未登记电话/邮箱，单证上将留空，不会套用另一主体的联系方式。');
    }
    if (!e.logo && !(TD.brandLogo && TD.brandLogo()))
      out.push(e.logoNote || '尚未配置 Logo：可在【公司与系统设置】上传，单证页眉会显示 YOUR LOGO 占位框。');
    return out;
  };

  /** Warnings tied to the chosen bank account. */
  TD.accountWarnings = function (order) {
    const out = [];
    const account = TD.accountFor(order);
    if (!account) {
      out.push('未选择收款账户；PI / 预付款发票 / 合同 将不显示银行资料。清关用商业发票默认不含账户。');
      return out;
    }
    // A collection account's payee name may legitimately differ from the
    // contracting entity. This is a payment arrangement, NOT a data error,
    // and must never block document generation.
    if (account.currency !== 'CONTRACT CURRENCY' && account.currency !== order.currency) {
      out.push('收款账户币种（' + account.currency + '）与订单结算币种（' + order.currency + '）不一致。');
    }
    if (account.currency === 'CONTRACT CURRENCY' && order.currency !== 'USD' && order.currency !== 'EUR') {
      out.push('订单币种为 ' + order.currency + '，对外账户页只提供 USD / EUR / 境内 CNY 账户；其他币种需联系我方另取对应账户信息，不得套用现有账户。');
    }
    if (['legacy_only', 'payment_only', 'unverified'].includes(account.status) || account.verified === false) {
      out.push('该收款账户的资料待人工核对：' + (account.note || '使用前须人工确认') +
        '（系统保留用户录入的原值，未自动改写任何账号或银行名称）');
    }
    if (account.note && account.status === 'active') out.push(account.note);
    if (account.swift_note) out.push('SWIFT 说明：' + account.swift_note);
    return out;
  };

  /** Account disclosure policy from the operating manual 5.3. */
  TD.bankDisclosure = function (order, kind) {
    if (kind === 'Quotation' || kind === 'Packing List' || kind === 'Shipping Mark') return false;
    if (!order || !order.showBank) return false;
    const account = TD.accountFor(order);
    if (!account) return false;
    // The user's filed Commercial Invoice is a customs-clearance document
    // ("Remark: For customs clearance purpose only.") and carries NO bank
    // details. Bank information belongs on the payment documents (PI / advance
    // payment invoice / contract). Only an explicit override puts it on a CI.
    if (kind === 'Commercial Invoice') return order.ciForPayment === true;
    return ['Proforma Invoice', 'Sales Contract'].includes(kind);
  };

  /** Brand compliance gate. Returns the banned words actually present. */
  TD.brandCheck = function (html) {
    if (!TD.appSettings().brandCheckEnabled) return [];
    const text = String(html || '');
    const found = [];
    for (const word of TD.BANNED_WORDS) {
      const pattern = /[a-z]/i.test(word)
        ? new RegExp('(^|[^A-Za-z])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^A-Za-z])', 'i')
        : new RegExp(word, 'i');
      if (pattern.test(text)) found.push(word);
    }
    return found;
  };

  /** Compliance / remittance notes shown on payment documents. */
  TD.remittanceNotes = function (order, kind) {
    const account = TD.accountFor(order);
    const notes = [
      'Please quote the invoice / contract number in the remittance information.',
      '请按账户资料逐字填写收款人名称、账号与 SWIFT 代码；名称中的括号、“Co.,Ltd”及空格请勿省略或改写。',
      '账户如有变更，以加盖公章的书面通知并经电话核实后生效；请警惕冒充我方名义发送的账户变更邮件。',
      '汇款后请将银行水单发送至 ' + ((TD.sellerData(order) || {}).email || '业务邮箱') + '。',
    ];
    if (account && account.applicable) notes.unshift(account.applicable);
    if (account && account.swift_note) notes.push(account.swift_note);
    if (order && order.currency && !['USD', 'EUR', 'CNY'].includes(order.currency)) {
      notes.push('本单结算币种为 ' + order.currency + '，对外账户页未提供对应账户；请联系我方另取对应账户信息，不要套用现有账户。');
    }
    return notes;
  };
})();
