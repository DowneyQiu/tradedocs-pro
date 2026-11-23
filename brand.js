/* TradeDocs Pro - brand logo, first-run guidance and demo data.
   Open-share edition add-on. Optional, self-contained, no effect on documents
   unless a logo is uploaded. Copyright (c) 2026 拓珀新材料（成都）有限公司.
   Licensed under the TradeDocs Pro Source-Available / Non-Commercial Distribution License 1.0; see LICENSE. */
(function () {
  'use strict';
  const TD = window.TD;
  const E = TD.esc;
  const LOGO_ID = 'brand-logo';
  const DEFAULT_LOGO = 'app-logo-wide.png';

  function settings() { return TD.get('settings') || []; }
  function logoRecord() { return settings().find(function (r) { return r && (r.id === LOGO_ID || r.kind === LOGO_ID); }); }

  /** URL of the licensee's own logo, or '' when the neutral default is used. */
  TD.brandLogo = function () {
    const r = logoRecord();
    return r && r.url ? String(r.url) : '';
  };

  function putRecord(url) {
    const rest = settings().filter(function (r) { return !(r && (r.id === LOGO_ID || r.kind === LOGO_ID)); });
    if (url) rest.push({ id: LOGO_ID, kind: LOGO_ID, url: url, updatedAt: new Date().toISOString() });
    TD.set('settings', rest);
  }

  /** Replace the sidebar logo. Document headers read TD.brandLogo() directly. */
  TD.applyBrandLogo = function () {
    const img = document.getElementById('brandLogoImg');
    if (img) img.src = TD.brandLogo() || DEFAULT_LOGO;
  };

  function toDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.readAsDataURL(file);
    });
  }

  /** Render the "Brand logo" card inside the settings page. */
  TD.setupBrandLogo = function (host) {
    if (!host) return;
    const url = TD.brandLogo();
    host.innerHTML =
      '<h3 class="section-title">品牌 Logo</h3>' +
      '<div class="brandkit">' +
      '<div class="brandkit-preview"><img id="brandKitPreview" src="' + E(url || DEFAULT_LOGO) + '" alt="当前 Logo"></div>' +
      '<div class="brandkit-body">' +
      '<p class="sub">上传贵公司 Logo 后，软件侧栏与全部客户单证页眉会同步显示。图片保存在本文件夹 <code>product-images/</code> 内，随文件夹一起复制；不会上传网络。</p>' +
      '<div class="actions" style="flex-wrap:wrap;gap:8px;margin:10px 0">' +
      '<label class="btn" style="cursor:pointer">选择图片<input id="brandKitFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>' +
      '<button class="btn" id="brandKitReset" type="button">恢复默认 Logo</button></div>' +
      '<p class="sub">建议透明底 PNG，横版比例，单边不低于 300 px；文件不超过 5 MB。</p>' +
      '</div></div>';

    const input = document.getElementById('brandKitFile');
    const preview = document.getElementById('brandKitPreview');
    input.addEventListener('change', async function () {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { TD.alert('图片超过 5 MB，请换一张。'); input.value = ''; return; }
      if (!TD.isLocalServer()) { TD.alert('Logo 上传需要本机服务，请通过启动器打开。'); input.value = ''; return; }
      try {
        const data = await toDataUrl(file);
        const res = await fetch('/api/upload-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data: data }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '上传失败');
        putRecord(result.url);
        TD.applyBrandLogo();
        if (preview) preview.src = result.url;
        TD.alert('Logo 已更新。侧栏与之后生成的全部单证页眉都会使用新 Logo。');
      } catch (err) {
        TD.alert('Logo 上传失败：' + err.message);
      } finally { input.value = ''; }
    });

    document.getElementById('brandKitReset').addEventListener('click', function () {
      if (!TD.brandLogo()) { TD.alert('当前已是默认 Logo。'); return; }
      if (!TD.confirm('恢复为出厂的中性 Logo？自定义图片文件仍保留在 product-images 中，不会被删除。')) return;
      putRecord('');
      TD.applyBrandLogo();
      if (preview) preview.src = DEFAULT_LOGO;
      TD.alert('已恢复默认 Logo。');
    });
  };

  // ------------------------------------------------------------- demo data
  const DEMO_CUSTOMER = {
    id: 'demo-customer-0001', demo: true, name: 'Example Trading GmbH', country: 'Germany',
    city: 'Hamburg', address: 'Musterstrasse 1, 20095 Hamburg, Germany',
    shippingAddress: 'Musterstrasse 1, 20095 Hamburg, Germany',
    contact: 'Max Mustermann', email: 'demo@example.com', phone: '+49 40 123456',
    fax: '', taxId: '', defaultCurrency: 'USD', incoterm: 'FOB', payment: 'T/T',
    docNote: '', packingNotes: '',
  };
  const DEMO_PRODUCT = {
    id: 'demo-product-0001', demo: true, name: 'O-Ring', model: 'DEMO-NBR-70-10x2',
    material: 'NBR', specification: 'NBR 70 Shore A O-Ring (demo item)',
    color: 'Black', hardness: '70', unit: 'PCS', price: 0.12,
    hsCode: '4016931000', origin: 'China', moq: '1000',
    category: '', unitOptions: 'pcs,kg,box', status: 'active', verified: true,
    image: '', detailImage: '', docDescription: '', dimensions: '', packageMethod: '',
    qtyPerCarton: '', grossWeight: '', netWeight: '', cartonDimensions: '',
    unitGrossWeight: '', unitNetWeight: '', unitCbm: '', leadTime: '',
  };

  function demoOrder() {
    const now = new Date().toISOString();
    const line = {
      name: 'O-Ring', model: 'DEMO-NBR-70-10x2', qty: 1000, unit: 'PCS', price: 0.12,
      hsCode: '4016931000', origin: 'China', material: 'NBR',
      specification: 'NBR 70 Shore A O-Ring, ID 10mm x C/S 2mm (demo item)',
      hardness: '70', color: 'Black', dimensions: '', packageMethod: '', qtyPerCarton: '',
      grossWeight: '', netWeight: '', cartonDimensions: '', docDescription: '',
      image: '', detailImage: '', priceSource: 'manual', moq: '1000',
      totalGW: '0', totalNW: '0', totalVOL: '0', unitGrossWeight: '',
      unitNetWeight: '', unitCbm: '', total: 120,
    };
    return {
      id: 'demo-order-0001', demo: true, no: 'DEMO-2026-001', date: '2026-11-22',
      buyer: 'Example Trading GmbH', customerId: 'demo-customer-0001',
      country: 'Germany', city: 'Hamburg',
      buyerAddress: 'Musterstrasse 1, 20095 Hamburg, Germany',
      shipTo: 'Musterstrasse 1, 20095 Hamburg, Germany',
      contact: 'Max Mustermann', email: 'demo@example.com', buyerPhone: '+49 40 123456',
      buyerTaxId: '', currency: 'USD', incoterm: 'FOB', incotermPlace: 'Shanghai Port, China',
      payment: '30% T/T deposit, 70% before shipment', depositPct: 30,
      lead: '30 days', valid: '30 days', state: '报价中', language: 'en',
      showBank: false, showHS: true, showGW: false, showNW: false, showVOL: false,
      showMOQ: false, showProductImages: false, showSignature: true, showStamp: false,
      ciForPayment: false, sellerSignature: 'Authorized Signature', buyerSignature: 'Accepted By',
      packingMode: 'byCarton', packingConfirmed: false, cartons: '', priceOptions: [],
      shippingMark: 'N/M', sideMark: '', markNote: '', notes: '', terms: '', docBody: '',
      complianceNote: '', lines: [line], total: 120, createdAt: now, updatedAt: now,
    };
  }

  TD.hasDemoData = function () {
    return ['orders', 'customers', 'products'].some(function (k) {
      return (TD.get(k) || []).some(function (r) { return r && r.demo === true; });
    });
  };

  TD.loadDemoData = function () {
    if (TD.hasDemoData()) { TD.alert('演示数据已经载入。可在下方点击「清除演示数据」。'); return; }
    const real = ['orders', 'customers', 'products'].some(function (k) {
      return (TD.get(k) || []).some(function (r) { return r && r.demo !== true; });
    });
    if (real && !TD.confirm('本机已有您自己录入的业务数据。演示数据会追加显示，但不会改动或删除现有记录。继续吗？')) return;
    TD.set('customers', (TD.get('customers') || []).concat([DEMO_CUSTOMER]));
    TD.set('products', (TD.get('products') || []).concat([DEMO_PRODUCT]));
    TD.set('orders', (TD.get('orders') || []).concat([demoOrder()]));
    TD.refresh(); TD.renderActiveView(); TD.updateFirstRunGuide();
    TD.alert('已载入 1 笔虚构演示订单（编号 DEMO-2026-001，全部字段标注 DEMO）。可到单证中心预览五类单证；用完请点「清除演示数据」。');
  };

  TD.clearDemoData = function () {
    if (!TD.hasDemoData()) { TD.alert('当前没有演示数据。'); return; }
    if (!TD.confirm('只清除 DEMO 演示记录，您自己录入的客户、产品、订单与全部账户/主体资料都会保留。继续吗？')) return;
    ['orders', 'customers', 'products'].forEach(function (k) {
      TD.set(k, (TD.get(k) || []).filter(function (r) { return !(r && r.demo === true); }));
    });
    TD.refresh(); TD.renderActiveView(); TD.updateFirstRunGuide();
    TD.alert('演示数据已清除。');
  };

  // ------------------------------------------------------- first-run guide
  TD.updateFirstRunGuide = function () {
    const el = document.getElementById('firstRunGuide');
    if (!el) return;
    const empty = ['orders', 'customers', 'products'].every(function (k) {
      return (TD.get(k) || []).length === 0;
    });
    el.hidden = !empty;
  };

  // Keep the guide in sync after every refresh without touching core.js.
  const originalRefresh = TD.refresh;
  TD.refresh = function () {
    const result = originalRefresh.apply(this, arguments);
    try { TD.updateFirstRunGuide(); } catch (e) { /* never break the app */ }
    return result;
  };
  TD.applyBrandLogo();
}());
