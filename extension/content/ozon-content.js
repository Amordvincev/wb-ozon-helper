(function () {
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(check, 200);
      };
      check();
    });
  }

  function extractPrice() {
    const selectors = [
      '[data-widget="webPrice"] span:last-child',
      '[class*="price"] [class*="main"]',
      '.tsBody500Large',
      '.c3011',
      '[class*="ControlPriceContainer"] span:last-child',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.textContent.replace(/\s/g, '').replace(/[^\d]/g, '');
        const val = parseInt(raw, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return null;
  }

  function extractOldPrice() {
    const selectors = [
      '[class*="old-price"]',
      '[class*="oldPrice"]',
      '[class*="price"] [class*="old"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.textContent.replace(/\s/g, '').replace(/[^\d]/g, '');
        const val = parseInt(raw, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return null;
  }

  function extractSku() {
    const urlMatch = window.location.pathname.match(/-(\d{6,})\//);
    if (urlMatch) return urlMatch[1];

    const el =
      document.querySelector('[data-sku]') ||
      document.querySelector('[data-product-id]') ||
      document.querySelector('[itemprop="sku"]');
    if (el) return el.getAttribute('data-sku') || el.getAttribute('data-product-id') || el.textContent.trim();

    const meta = document.querySelector('meta[property="product:retailer_item_id"]');
    if (meta) return meta.getAttribute('content');

    return null;
  }

  function extractName() {
    const el =
      document.querySelector('h1') ||
      document.querySelector('[class*="product"][class*="title"]') ||
      document.querySelector('[data-widget="webProductHeading"] h1');
    return el ? el.textContent.trim() : null;
  }

  function extractSeller() {
    const el =
      document.querySelector('[class*="seller"]') ||
      document.querySelector('[class*="supplier"]') ||
      document.querySelector('[data-widget="webSellerInfo"]');
    return el ? el.textContent.trim() : null;
  }

  function extractRating() {
    const el =
      document.querySelector('[class*="rating"] [class*="value"]') ||
      document.querySelector('[class*="star"]') ||
      document.querySelector('[class*="Rating"]');
    if (el) {
      const val = parseFloat(el.textContent.trim().replace(',', '.'));
      return isNaN(val) ? null : val;
    }
    return null;
  }

  function extractCategory() {
    const el = document.querySelector('[class*="breadcrumb"]');
    if (el) {
      const items = el.querySelectorAll('li, span, a, [class*="item"]');
      return Array.from(items)
        .map((i) => i.textContent.trim())
        .filter(Boolean)
        .join(' / ');
    }
    return null;
  }

  async function sendData() {
    const sku = extractSku();
    if (!sku) return;

    const data = {
      marketplace: 'ozon',
      sku,
      name: extractName(),
      price: extractPrice(),
      old_price: extractOldPrice(),
      seller: extractSeller(),
      rating: extractRating(),
      stock: null,
      category: extractCategory(),
      url: window.location.href,
    };

    chrome.runtime.sendMessage({ action: 'savePrice', data }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[WB-Ozon Helper] Send failed:', chrome.runtime.lastError.message);
      }
    });

    chrome.storage.local.set({ [`last_${sku}`]: data });
  }

  waitForElement('h1, [class*="price"], [data-widget="webPrice"]').then(() => {
    setTimeout(sendData, 1500);
  });
})();
