/* One fixed contracting entity + currency-matched collection accounts.
   Accounts are NOT filtered by owning entity: the payee on a remittance may
   differ from the company that signs the contract. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  function formOrder() {
    return {
      entity: TD.val('entity'), account: TD.val('account'), currency: TD.val('currency'),
      showBank: TD.checked('showBank'), notes: TD.val('notes'), buyer: TD.val('buyer'),
      po: TD.val('po'), no: TD.val('no'), date: TD.val('date'),
    };
  }

  TD.refreshAccountOptions = function (preferredAccountId, preferredEntityId) {
    const entityEl = document.getElementById('entity');
    const accountEl = document.getElementById('account');
    const currencyEl = document.getElementById('currency');
    if (!entityEl || !accountEl || !currencyEl) return;
    const contract = TD.contractEntity();
    // The entity selector is a hidden field now (fixed issuer). Accept both
    // markup shapes so a saved / older page still resolves correctly.
    if (entityEl.tagName === 'SELECT') {
      entityEl.innerHTML = contract
        ? '<option value="' + E(contract.id) + '">' + E(contract.legalNameEn || contract.id) + '</option>'
        : '<option value="">未读取到出单主体资料（请通过启动器打开本地版）</option>';
    }
    entityEl.value = contract ? contract.id : '';
    const label = document.getElementById('contractEntityLabel');
    if (label) label.textContent = contract
      ? (contract.legalNameCn || contract.legalNameEn || '') +
        (contract.legalNameEn && contract.legalNameCn ? ' / ' + contract.legalNameEn : '')
      : '主体资料缺失，请通过启动器打开本地版';
    // Historical orders may carry a payment-only entity id; ignore it.
    void preferredEntityId;

    const prevAccount = preferredAccountId || accountEl.value;
    const currency = currencyEl.value;
    const matching = TD.accounts().filter((a) =>
      a.currency === currency || a.currency === 'CONTRACT CURRENCY');
    accountEl.innerHTML = matching.length
      ? matching.map((a) => '<option value="' + E(a.id) + '">' + E(a.currency) + ' · ' +
          E(a.bank || a.bank_cn || '') + ' · ' +
          (['legacy_only', 'payment_only'].includes(a.status) ? '收款专用'
            : a.status === 'unverified' ? '待核对' : '可用') + '</option>').join('')
      : '<option value="">暂无匹配币种账户（需另取账户资料）</option>';
    if (matching.some((a) => a.id === prevAccount)) accountEl.value = prevAccount;
    const selected = matching.find((a) => a.id === accountEl.value);
    accountEl.title = selected ? (selected.note || '') : '';
    TD.updateSellerWarnings();
  };

  TD.updateSellerWarnings = function () {
    const target = document.getElementById('sellerWarnings');
    if (!target) return;
    const order = formOrder();
    const warnings = [...TD.entityWarnings(order), ...TD.accountWarnings(order)];
    const compliance = document.getElementById('orderCompliance');
    const banned = TD.brandCheck([order.buyer, order.notes, order.po, TD.val('items')].join(' '));
    if (compliance) {
      TD.notice(compliance, banned.length
        ? '<b>品牌合规阻断：</b>订单内容含对外禁用词（' + banned.length + ' 处）' +
          '。客户可见文件只使用核定的对外品牌名，请替换后再生成单证。'
        : '', 'error');
    }
    if (!warnings.length) { TD.notice(target, '', 'info'); return; }
    TD.notice(target, '<b>资料与合规提示</b><ul>' + warnings.map((w) => '<li>' + E(w) + '</li>').join('') + '</ul>',
      warnings.some((w) => (w.includes('币种') && w.includes('不一致')) || w.includes('未找到')) ? 'error' : '');
  };

  TD.bindAccountSelectors = function () {
    for (const id of ['entity', 'currency', 'account', 'showBank', 'buyer', 'notes', 'po']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('change', () => {
        if (id === 'entity' || id === 'currency') TD.refreshAccountOptions();
        else TD.updateSellerWarnings();
      });
      if (id === 'buyer' || id === 'notes' || id === 'po') el.addEventListener('input', TD.updateSellerWarnings);
    }
    const items = document.getElementById('items');
    if (items) items.addEventListener('input', TD.updateSellerWarnings);
  };
})();
