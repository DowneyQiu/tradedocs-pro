/* Master-data editors: customers, products (images + customer prices), entities, accounts. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;

  const CUSTOMER_FIELDS = [
    ['name', '客户公司名称 *', 'text'], ['country', '国家 / 地区', 'text'],
    ['city', '城市', 'text'], ['contact', '联系人', 'text'],
    ['email', '联系邮箱', 'email'], ['phone', '联系电话', 'text'],
    ['whatsapp', 'WhatsApp（客户号码，含国际区号；仅存本机档案，不打印到单证）', 'text'],
    ['fax', '传真', 'text'], ['taxId', 'VAT / 税号 / EORI', 'text'],
    ['payment', '常用付款方式', 'text'], ['incoterm', '常用贸易术语', 'text'],
    ['defaultCurrency', '常用报价币种', 'text'],
    ['address', '账单地址 Bill To', 'textarea'],
    ['shippingAddress', '默认收货地址 Ship To', 'textarea'],
    ['packingNotes', '客户装箱要求（如每箱毛重上限）', 'textarea'],
    ['docNote', '客户单证特殊要求（内部备注）', 'textarea'],
  ];
  const PRODUCT_FIELDS = [
    ['name', '产品名称 *', 'text'], ['model', '产品型号 *', 'text'],
    ['material', '材料（FKM / FFKM / EPDM / HNBR…）', 'text'],
    ['specification', '产品规格', 'text'], ['color', '颜色', 'text'],
    ['hardness', '硬度（Shore A）', 'text'], ['dimensions', '产品尺寸', 'text'],
    ['unit', '主计量单位', 'text'], ['unitOptions', '可选单位（逗号分隔）', 'text'],
    ['price', '默认单价', 'number'], ['hsCode', 'HS Code', 'text'],
    ['origin', '原产国', 'text'], ['packageMethod', '包装方式', 'text'],
    ['qtyPerCarton', '每箱数量', 'number'], ['grossWeight', '每箱毛重 kg', 'number'],
    ['netWeight', '每箱净重 kg', 'number'], ['cartonDimensions', '外箱尺寸 cm（长x宽x高）', 'text'],
    ['moq', '最小起订量 MOQ', 'number'], ['leadTime', '交期', 'text'],
    ['unitGrossWeight', '单件毛重 kg（用于报价单总毛重列）', 'number'],
    ['unitNetWeight', '单件净重 kg（用于报价单总净重列）', 'number'],
    ['unitCbm', '单件体积 m³（用于报价单总体积列）', 'number'],
    ['category', '产品分类', 'text'],
    ['docDescription', '单证用产品详述（可多行，中英文）', 'textarea'],
  ];

  function fieldHtml([key, label, type], value) {
    const v = E(value == null ? '' : value);
    return '<label>' + E(label) +
      (type === 'textarea'
        ? '<textarea name="' + key + '" rows="2">' + v + '</textarea>'
        : '<input name="' + key + '" type="' + type + '"' + (type === 'number' ? ' min="0" step="any"' : '') + ' value="' + v + '">') +
      '</label>';
  }

  function modal(title, body, width) {
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="editorOverlay" style="display:flex;z-index:45"><div class="modal record-editor" style="' +
      (width ? 'width:' + width + ';' : '') + '"><div class="panelhead"><h2>' + E(title) + '</h2>' +
      '<button class="btn" data-close>关闭</button></div>' + body +
      '<div class="modalfoot"><button class="btn" data-close>取消</button><button class="btn primary" id="editorSave">保存</button></div></div></div>';
    const overlay = document.getElementById('editorOverlay');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) host.innerHTML = '';
    });
    return overlay;
  }

  async function uploadImage(file, hiddenInput, preview) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { TD.alert('图片超过 5 MB。'); return; }
    if (!TD.isLocalServer()) { TD.alert('图片需要本机服务才能保存，请通过启动器打开。'); return; }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, data: dataUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '上传失败');
      hiddenInput.value = result.url;
      if (preview) preview.innerHTML = '<img class="thumb" src="' + E(result.url) + '" alt="">';
      TD.alert('图片已保存到本机 product-images 目录。');
    } catch (error) { TD.alert('图片保存失败：' + error.message); }
  }

  function imageField(key, label, value) {
    return '<label>' + E(label) + '<div style="display:flex;gap:8px;align-items:center;margin-top:5px">' +
      '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-image-input="' + key + '" style="padding:6px">' +
      '<span data-image-preview="' + key + '">' + (value ? '<img class="thumb" src="' + E(value) + '" alt="">' : '') + '</span>' +
      '</div><input type="hidden" name="' + key + '" value="' + E(value || '') + '"></label>';
  }

  function priceRowsHtml(prices) {
    const products = TD.get('products');
    return (prices || []).map((row) => priceRowHtml(row, products)).join('');
  }
  function priceRowHtml(row, products) {
    row = row || {};
    return '<div class="price-row" data-price-row>' +
      '<select name="priceProduct">' + '<option value="">选择产品</option>' +
      products.map((p) => '<option value="' + E(p.id) + '"' + (row.productId === p.id ? ' selected' : '') + '>' +
        E(p.name + (p.model ? ' · ' + p.model : '')) + '</option>').join('') + '</select>' +
      '<input name="priceCurrency" placeholder="币种" value="' + E(row.currency || '') + '">' +
      '<input name="priceValue" type="number" min="0" step="any" placeholder="单价" value="' + E(row.price ?? '') + '">' +
      '<input name="priceFrom" type="date" value="' + E(row.validFrom || '') + '">' +
      '<input name="priceUntil" type="date" value="' + E(row.validUntil || '') + '">' +
      '<button type="button" class="btn danger" data-remove-price>×</button></div>';
  }

  TD.manage = function (kind, id) {
    const rows = TD.get(kind);
    const current = id ? rows.find((r) => r.id === id) : {};
    if (id && !current) return;
    const isCustomer = kind === 'customers';
    const fields = isCustomer ? CUSTOMER_FIELDS : PRODUCT_FIELDS;
    const defaults = isCustomer ? {} : { unit: 'PCS', origin: 'China' };
    let body = '<p class="sub">资料只保存在本机。带 * 为必填；客户专属价仅影响本单取价，不修改产品主档。</p>' +
      '<form id="editorForm" class="form">' + fields.map(([key, label, type]) =>
        fieldHtml([key, label, type], current[key] != null ? current[key] : (defaults[key] || ''))).join('');
    if (!isCustomer) {
      body += imageField('image', '产品主图（本机存储）', current.image) +
        imageField('detailImage', '细节图（本机存储）', current.detailImage);
    } else {
      body += '<div class="full"><h3 class="section-title" style="margin-top:8px">客户专属报价 / Customer Prices</h3>' +
        '<p class="sub">选择客户后开单会自动取有效期内的专属价；本单手动改价不会写回这里。</p>' +
        '<div id="priceRows">' + priceRowsHtml(current.prices) + '</div>' +
        '<button type="button" class="btn" id="addPriceRow">＋ 添加专属价</button></div>';
    }
    body += '</form>';
    const overlay = modal((id ? '编辑' : '新增') + (isCustomer ? '客户档案' : '产品档案'), body, 'min(920px,96vw)');
    const form = document.getElementById('editorForm');
    overlay.querySelectorAll('[data-image-input]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.imageInput;
        uploadImage(input.files[0], form.elements[key], overlay.querySelector('[data-image-preview="' + key + '"]'));
      });
    });
    if (isCustomer) {
      document.getElementById('addPriceRow').onclick = () => {
        document.getElementById('priceRows').insertAdjacentHTML('beforeend', priceRowHtml({}, TD.get('products')));
      };
      document.getElementById('priceRows').addEventListener('click', (event) => {
        if (event.target.closest('[data-remove-price]')) event.target.closest('[data-price-row]').remove();
      });
    }
    document.getElementById('editorSave').onclick = () => {
      const data = new FormData(form);
      const record = Object.fromEntries(fields.map(([key, , type]) => {
        const value = String(data.get(key) || '').trim();
        return [key, type === 'number' ? (value === '' ? '' : Number(value)) : value];
      }));
      if (!isCustomer) {
        record.image = String(data.get('image') || '').trim();
        record.detailImage = String(data.get('detailImage') || '').trim();
      } else {
        record.prices = [...form.querySelectorAll('[data-price-row]')].map((row) => ({
          productId: row.querySelector('[name="priceProduct"]').value,
          currency: row.querySelector('[name="priceCurrency"]').value.trim(),
          price: Number(row.querySelector('[name="priceValue"]').value),
          validFrom: row.querySelector('[name="priceFrom"]').value,
          validUntil: row.querySelector('[name="priceUntil"]').value,
        })).filter((row) => row.productId && Number.isFinite(row.price));
      }
      const errors = [];
      if (!record.name) errors.push('名称不能为空。');
      if (!isCustomer && !record.model) errors.push('产品型号不能为空。');
      if (isCustomer && record.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) errors.push('邮箱格式无效。');
      if (!isCustomer) {
        for (const key of ['price', 'qtyPerCarton', 'grossWeight', 'netWeight', 'moq',
          'unitGrossWeight', 'unitNetWeight', 'unitCbm']) {
          if (record[key] !== '' && !Number.isFinite(record[key])) errors.push(key + ' 不是有效数字。');
          if (record[key] !== '' && record[key] < 0) errors.push(key + ' 不能为负数。');
        }
        if (record.qtyPerCarton !== '' && record.qtyPerCarton > 0 && !Number.isInteger(record.qtyPerCarton)) errors.push('每箱数量须为正整数。');
        if (record.cartonDimensions && !TD.parseDimensions(record.cartonDimensions).valid) errors.push('箱规格式无效，应形如 40x30x25。');
        if (Number(record.netWeight) > Number(record.grossWeight) + 0.01 && Number(record.grossWeight) > 0) errors.push('单箱净重大于毛重。');
      }
      if (errors.length) { TD.alert('请修正：\n' + errors.join('\n')); return; }
      const duplicate = rows.find((r) => r.id !== id && (isCustomer
        ? r.name.trim().toLowerCase() === record.name.toLowerCase()
        : r.name.trim().toLowerCase() === record.name.toLowerCase() &&
          String(r.model || '').trim().toLowerCase() === record.model.toLowerCase()));
      if (duplicate) { TD.alert(isCustomer ? '客户名称已存在，请编辑已有档案。' : '相同产品名称和型号已存在，请编辑已有档案。'); return; }
      const saved = Object.assign({}, current, record, { id: current.id || TD.uid() });
      TD.set(kind, id ? rows.map((r) => r.id === id ? saved : r) : [...rows, saved]);
      document.getElementById('modalHost').innerHTML = '';
      TD.refreshProductDatalist();
      TD.refresh(); TD.renderActiveView();
    };
  };

  TD.renderRecords = function (kind) {
    const isCustomer = kind === 'customers';
    return TD.get(kind).map((row) => {
      const summary = isCustomer
        ? [row.country, row.city, row.contact, row.email,
           row.whatsapp && 'WhatsApp ' + row.whatsapp, row.defaultCurrency].filter(Boolean).join(' · ')
        : [row.model, row.material, row.specification, row.color, row.hardness, row.unit,
           row.qtyPerCarton ? '每箱 ' + row.qtyPerCarton : ''].filter(Boolean).join(' · ');
      return '<article class="record">' +
        (row.image ? '<img class="thumb" src="' + E(row.image) + '" alt="">' : '<span></span>') +
        '<div><b>' + E(row.name) + '</b><br><span class="tagline">' + E(summary) + '</span>' +
        (!isCustomer && row.docDescription ? '<br><span class="tagline">单证详述已填写</span>' : '') +
        (isCustomer && (row.prices || []).length ? '<br><span class="badge ok">专属价 ' + row.prices.length + ' 条</span>' : '') +
        '</div>' +
        '<button class="btn" onclick="TD.manage(\'' + kind + '\',\'' + E(row.id) + '\')">编辑</button>' +
        '<button class="btn" onclick="TD.previewMaster(\'' + kind + '\',\'' + E(row.id) + '\')">查看</button>' +
        '<button class="btn danger" onclick="TD.deleteRecord(\'' + kind + '\',\'' + E(row.id) + '\')">删除</button></article>';
    }).join('') || '<p class="sub">暂无档案，点击「＋ 新增」添加。</p>';
  };

  TD.previewMaster = function (kind, id) {
    const row = TD.get(kind).find((r) => r.id === id);
    if (!row) return;
    const isCustomer = kind === 'customers';
    const fields = isCustomer ? CUSTOMER_FIELDS : PRODUCT_FIELDS;
    const body = '<div class="form">' + fields.map(([key, label]) =>
      '<label>' + E(label) + '<div style="padding:7px 0;color:#172638">' + E(row[key] || '—') + '</div></label>').join('') +
      (!isCustomer && row.image ? '<label class="full">产品主图<img src="' + E(row.image) + '" style="max-width:260px;margin-top:6px"></label>' : '') +
      (isCustomer && (row.prices || []).length ? '<div class="full"><b>客户专属报价</b><div class="tablewrap"><table class="table"><thead><tr><th>产品</th><th>币种</th><th>单价</th><th>有效期</th></tr></thead><tbody>' +
        row.prices.map((p) => '<tr><td>' + E((TD.get('products').find((x) => x.id === p.productId) || {}).name || p.productId) + '</td><td>' + E(p.currency || '—') + '</td><td>' + E(p.price) + '</td><td>' + E((p.validFrom || '—') + ' ~ ' + (p.validUntil || '—')) + '</td></tr>').join('') + '</tbody></table></div></div>' : '') +
      '</div>';
    const overlay = modal('查看' + (isCustomer ? '客户' : '产品') + '档案', body, 'min(860px,96vw)');
    overlay.querySelector('.modalfoot').innerHTML = '<button class="btn" data-close>关闭</button>';
  };

  TD.deleteRecord = function (kind, id) {
    const rows = TD.get(kind);
    const record = rows.find((r) => r.id === id);
    if (!record) return;
    if (!TD.confirm('将「' + record.name + (record.model ? ' / ' + record.model : '') + '」移入回收站？历史订单中的快照不会改变。')) return;
    const settings = TD.get('settings');
    settings.push({ id: TD.uid(), kind: kind === 'customers' ? 'deleted-customer' : 'deleted-product',
      deletedAt: new Date().toISOString(), record });
    TD.set('settings', settings);
    TD.set(kind, rows.filter((r) => r.id !== id));
    TD.refresh(); TD.renderActiveView();
  };

  TD.showMasterTrash = function (kind) {
    const deletedKind = kind === 'customers' ? 'deleted-customer' : 'deleted-product';
    const items = TD.get('settings').filter((s) => s.kind === deletedKind)
      .sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
    const host = document.getElementById('modalHost');
    host.innerHTML = '<div class="overlay" id="masterTrash" style="display:flex;z-index:45"><div class="modal">' +
      '<div class="panelhead"><h2>' + (kind === 'customers' ? '客户' : '产品') + '回收站</h2><button class="btn" data-close>关闭</button></div>' +
      (items.map((s) => '<article class="record"><b>' + E(s.record?.name || '') + '</b><span>' +
        E([s.record?.model, s.record?.material].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="tagline">' + E(String(s.deletedAt || '').slice(0, 10)) + '</span>' +
        '<button class="btn" data-restore="' + E(s.id) + '">恢复</button></article>').join('') || '<p class="sub">回收站为空。</p>') +
      '</div></div>';
    const overlay = document.getElementById('masterTrash');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) { host.innerHTML = ''; return; }
      const button = event.target.closest('[data-restore]');
      if (!button) return;
      const settings = TD.get('settings');
      const item = settings.find((s) => s.id === button.dataset.restore);
      if (!item || !item.record) return;
      const rows = TD.get(kind);
      const duplicate = rows.some((r) => kind === 'customers'
        ? r.name.toLowerCase() === String(item.record.name || '').toLowerCase()
        : r.name.toLowerCase() === String(item.record.name || '').toLowerCase() &&
          String(r.model || '').toLowerCase() === String(item.record.model || '').toLowerCase());
      if (duplicate) { TD.alert('已有同名档案，请先处理重名。'); return; }
      TD.set(kind, [...rows, item.record]);
      TD.set('settings', settings.filter((s) => s.id !== item.id));
      host.innerHTML = ''; TD.refresh(); TD.renderActiveView();
    });
  };

  // ------------------------------------------------------------- entity / account editors
  TD.manageEntity = function (id) {
    const rows = TD.entities();
    const current = rows.find((r) => r.id === id) || {};
    const contractId = (TD.contractEntity() || {}).id;
    // A payment-only entity is a company archive for a collection account,
    // never a document issuer. Editing it must not change the contracting entity.
    const isPayee = current.role === 'payment_only' || (!!id && id !== contractId);
    const fields = [
      ['legalNameEn', '英文法定名称（须与银行账户收款人一致）'], ['legalNameCn', '中文名称'],
      ['brandDisplay', '对外品牌名'], ['brandDisplayCn', '对外品牌中文名'],
      ['addressEn', '英文地址'], ['addressCn', '中文地址'],
      ['taxNo', '税号 / Tax No.（仅存本机档案，不打印到单证）'],
      ['contact', '联系人'], ['contactTitle', '职位'], ['email', '邮箱'],
      ['phone', '电话'], ['whatsapp', 'WhatsApp'], ['website', '官网'],
      ['logo', 'Logo 文件名（留空则不显示）'], ['creditCode', '统一社会信用代码（核对后填写）'],
    ];
    const intro = isPayee
      ? '<div class="notice">本页是<b>收款主体档案</b>，只记录收款账户户名、税号与地址；<b>不作为出单 / 签约 / 通关主体</b>，不出现在任何单证的抬头、卖方栏或签字处。银行账号请在【收款账户】中维护。</div>'
      : '<div class="notice">本页是唯一出单主体，决定所有单证的抬头、地址、联系方式与签字方。请勿在此处填写或改动银行账号；收款账户在【收款账户】中单独维护，其户名不作为出单主体。</div>';
    const body = intro +
      '<form id="editorForm" class="form">' + fields.map(([k, label]) => fieldHtml([k, label, 'text'], current[k])).join('') +
      '<label>状态<select name="status"><option value="active"' + (current.status === 'active' ? ' selected' : '') + '>可用</option>' +
      '<option value="unverified"' + (current.status === 'unverified' ? ' selected' : '') + '>待核对</option></select></label>' +
      '<label>核定状态<select name="verified"><option value="true"' + (current.verified !== false ? ' selected' : '') + '>已核定</option>' +
      '<option value="false"' + (current.verified === false ? ' selected' : '') + '>待核对（单证会提示）</option></select></label>' +
      '<label class="full">备注（每行一条，会显示在单证检查中）<textarea name="notes" rows="4">' + E((current.notes || []).join('\n')) + '</textarea></label></form>';
    const overlay = modal(isPayee ? '编辑收款主体档案' : '编辑出单主体', body, 'min(900px,96vw)');
    document.getElementById('editorSave').onclick = () => {
      const data = new FormData(document.getElementById('editorForm'));
      const record = Object.assign({}, current);
      for (const [k] of fields) record[k] = String(data.get(k) || '').trim();
      record.status = data.get('status');
      record.verified = data.get('verified') === 'true';
      record.notes = String(data.get('notes') || '').split('\n').map((x) => x.trim()).filter(Boolean);
      if (!record.legalNameEn || !record.addressEn) { TD.alert('英文法定名称和英文地址不能为空。'); return; }
      if (!TD.confirm(isPayee
        ? '确认保存收款主体档案？此资料仅用于收款账户备案，不会改变任何单证的抬头或签字方。'
        : '确认保存主体资料？这会立即影响之后生成的所有单证。')) return;
      const list = TD.entities();
      const index = list.findIndex((e) => e.id === record.id);
      if (index >= 0) list[index] = record; else list.push(record);
      TD.set('entities', list);
      document.getElementById('modalHost').innerHTML = '';
      TD.refresh(); TD.renderActiveView();
    };
  };

  TD.manageAccount = function (id) {
    const rows = TD.accounts();
    const current = rows.find((r) => r.id === id) || {};
    const fields = [
      ['beneficiary', '收款人名称 Beneficiary'], ['account_no', '账号 Account No.'],
      ['bank', '开户银行（英文）'], ['bank_cn', '开户银行（中文）'],
      ['bank_address', '银行地址'], ['swift', 'SWIFT / BIC'],
      ['beneficiary_address', '收款人地址'], ['currency', '币种'],
      ['applicable', '适用范围'], ['note', '备注（选填）'], ['version', '资料版本'],
      ['swift_note', 'SWIFT 说明'], ['source', '资料来源'],
    ];
    const body = '<div class="notice error"><b>敏感资料</b>：账号与银行信息只保存在本机，不会联网、不会上传。系统不会自动改写任何账号或银行名称；只有你在此处明确修改并二次确认后才会变更。修改前请与加盖公章的官方账户通知核对。</div>' +
      '<form id="editorForm" class="form">' + fields.map(([k, label]) => fieldHtml([k, label, 'text'], current[k])).join('') +
      '<label>状态<select name="status"><option value="active"' + (current.status === 'active' ? ' selected' : '') + '>可用</option>' +
      '<option value="unverified"' + (current.status === 'unverified' ? ' selected' : '') + '>待核对</option>' +
      '<option value="legacy_only"' + (current.status === 'legacy_only' ? ' selected' : '') + '>收款专用</option></select></label>' +
      '<label>核定状态<select name="verified"><option value="true"' + (current.verified !== false ? ' selected' : '') + '>已核定</option>' +
      '<option value="false"' + (current.verified === false ? ' selected' : '') + '>待核对</option></select></label>' +
      '<label class="full check"><input type="checkbox" id="accountConfirm"> 我已与官方账户文件逐字核对，确认本次修改</label></form>';
    const overlay = modal('编辑收款账户', body, 'min(900px,96vw)');
    document.getElementById('editorSave').onclick = () => {
      if (!TD.checked('accountConfirm')) { TD.alert('请先勾选逐字核对方可保存账户资料。'); return; }
      const data = new FormData(document.getElementById('editorForm'));
      const record = Object.assign({}, current);
      for (const [k] of fields) record[k] = String(data.get(k) || '').trim();
      record.status = data.get('status');
      record.verified = data.get('verified') === 'true';
      if (!record.beneficiary || !record.account_no) { TD.alert('收款人名称和账号不能为空。'); return; }
      if (!TD.confirm('再次确认：将把账户 ' + record.id + ' 的资料写入本机数据库。继续吗？')) return;
      const settings = TD.get('settings');
      settings.push({ id: TD.uid(), kind: 'account-edit', at: new Date().toISOString(),
        accountId: record.id, accountNoBefore: current.account_no, accountNoAfter: record.account_no });
      TD.set('settings', settings);
      const list = TD.accounts();
      const index = list.findIndex((a) => a.id === record.id);
      if (index >= 0) list[index] = record; else list.push(record);
      TD.set('accounts', list);
      document.getElementById('modalHost').innerHTML = '';
      TD.refresh(); TD.renderActiveView();
    };
  };
})();
