(function () {
  console.log('[WB-Ozon Helper] Ozon loaded');
  function extractPrice() {
    const priceSelectors = [
      '[data-widget="webPrice"] span:last-child',
      '[class*="price"] [class*="main"]',
      '.tsBody500Large',
      '.c3011',
      '[class*="ControlPriceContainer"] span:last-child',
      '[data-widget="webProductMainWidget"]',
    ];
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.textContent.replace(/\s/g, '').replace(/[^\d]/g, '');
        const val = parseInt(raw, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }

    const allElements = document.querySelectorAll('span, div, ins, b, strong, button');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text.length > 3 && text.length < 20) {
        const match = text.match(/(\d{1,3}(?:\s?\d{3})*)\s*[₽р]/i);
        if (match) {
          const raw = match[1].replace(/\s/g, '');
          const val = parseInt(raw, 10);
          if (!isNaN(val) && val > 0) return val;
        }
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
    const urlMatch = window.location.pathname.match(/-(\d{6,})\/?/);
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
    const el = document.querySelector('h1') || document.querySelector('[data-widget="webProductHeading"] h1');
    return el ? el.textContent.trim() : null;
  }

  function extractSeller() {
    const selectors = [
      '[data-widget="webSellerInfo"]',
      '[class*="seller"]',
      '[class*="supplier"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && text !== 'Продавец') return text;
      }
    }
    return null;
  }

  function extractRating() {
    const selectors = [
      '[class*="rating"] [class*="value"]',
      '[class*="Rating"]',
      '[class*="star"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = parseFloat(el.textContent.trim().replace(',', '.'));
        if (!isNaN(val)) return val;
      }
    }
    return null;
  }

  function extractCategory() {
    const selectors = ['[class*="breadcrumb"]', '[class*="crumb"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text) return text;
      }
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

    const API_URL = 'https://wb-ozon-helper.onrender.com';

    try {
      const res = await fetch(`${API_URL}/api/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        console.log('[WB-Ozon Helper] Data sent:', sku);
      }
    } catch (e) {
      console.warn('[WB-Ozon Helper] Send failed:', e.message);
    }

    chrome.storage.local.set({ [`last_${sku}`]: data });
  }

  setTimeout(sendData, 3000);
})();
