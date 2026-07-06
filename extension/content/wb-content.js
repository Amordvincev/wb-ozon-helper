(function () {
  function extractPrice() {
    const priceSelectors = [
      '.price-block__final-price',
      '.price-block__content ins',
      '.final-price',
      '[data-link="{:linkPriceLbl }"]',
      '[class*="ProductPagePrice"]',
      '[class*="WalletPrice"]',
      '.walletPrice',
      '[data-widget="webPrice"]',
    ];
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.textContent.replace(/\s/g, '').replace(/[^\d]/g, '');
        const val = parseInt(raw, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }

    const allElements = document.querySelectorAll('span, div, ins, b, strong');
    for (const el of allElements) {
      const text = el.textContent.trim();
      const match = text.match(/(\d{1,3}(?:\s?\d{3})*)\s*[₽р]/i);
      if (match) {
        const raw = match[1].replace(/\s/g, '');
        const val = parseInt(raw, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return null;
  }

  function extractOldPrice() {
    const selectors = [
      '.price-block__old-price',
      '.price-block__content del',
      '[class*="old-price"]',
      '[class*="oldPrice"]',
      '[class*="price-old"]',
      '[class*="discount"] span:first-child',
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
    const urlMatch = window.location.pathname.match(/(\d{6,})/);
    if (urlMatch) return urlMatch[1];
    const meta = document.querySelector('[data-nm-id]');
    if (meta) return meta.getAttribute('data-nm-id');
    return null;
  }

  function extractName() {
    const selectors = [
      'h1.product-page__title',
      'h1',
      '[class*="product"][class*="title"]',
      '[data-link="text{:productCard.productName }"]',
      '[class*="ProductName"]',
      '[class*="product-name"]',
      '[class*="goods-name"]',
      '[class*="product__header"] h1',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }

  function extractSeller() {
    const selectors = [
      '[class*="sellerAndBrandItemName"]',
      '[class*="brandBadgeWrapper"]',
      '[class*="brandBadgeText"]',
      '[class*="sellerInfoWithChat"]',
      '[class*="sellerAndBrand"]',
      '.product-card__brand',
      '[class*="brand-name"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim().replace('Стать продавцом', '').replace('Продавец', '').trim();
        if (text && text.length > 1) return text;
      }
    }
    return null;
  }

  function extractRating() {
    const selectors = [
      '.smart-banner__rating',
      '[class*="smart-banner__rating"]',
      '[class*="rating"]',
      '.product-review__rating',
      '[class*="rating"][class*="value"]',
      '.star',
      '[class*="RatingValue"]',
      '[class*="product__rating"]',
      '[class*="review-rating"]',
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

  function extractStock() {
    const selectors = [
      '[class*="stock"]',
      '[class*="quantity"]',
      '[class*="leftover"]',
      '[class*="rest"]',
      '.seller-info__quantity',
      '[class*="product__stock"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const raw = el.textContent.replace(/\s/g, '');
        const match = raw.match(/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    }
    return null;
  }

  function extractCategory() {
    const selectors = ['[class*="breadcrumbs"]', '[class*="breadcrumb"]', '.breadcrumbs', '[class*="Breadcrumbs"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        let text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text) return text;
        const items = el.querySelectorAll('li, span, a, [class*="item"]');
        text = Array.from(items).map((i) => i.textContent.trim()).filter(Boolean).join(' / ');
        if (text) return text;
      }
    }
    return null;
  }

  async function sendData() {
    const sku = extractSku();
    if (!sku) return;

    const data = {
      marketplace: 'wb',
      sku,
      name: extractName(),
      price: extractPrice(),
      old_price: extractOldPrice(),
      seller: extractSeller(),
      rating: extractRating(),
      stock: extractStock(),
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

  function waitForData() {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const seller = document.querySelector('[class*="sellerAndBrandItemName"]');
        const price = document.querySelector('[class*="price"]');
        if (seller || price || Date.now() - start > 8000) resolve();
        else setTimeout(check, 300);
      };
      check();
    });
  }

  setTimeout(sendData, 4000);
})();
