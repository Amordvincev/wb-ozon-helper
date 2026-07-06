let chart = null;
let currentSku = null;
let currentMarketplace = null;
let currentDays = 30;

function $(sel) {
  return document.querySelector(sel);
}

function show(el) {
  if (typeof el === 'string') el = $(el);
  el.classList.remove('hidden');
}

function hide(el) {
  if (typeof el === 'string') el = $(el);
  el.classList.add('hidden');
}

function formatPrice(val) {
  if (val == null || isNaN(val)) return '—';
  return val.toLocaleString('ru-RU');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function extractSkuAndMarketplace(url) {
  if (!url) return null;
  const wbMatch = url.match(/wildberries\.ru\/catalog\/(\d+)\/detail\.aspx/);
  if (wbMatch) return { marketplace: 'wb', sku: wbMatch[1] };
  const ozonMatch = url.match(/ozon\.ru\/product\/[^/]+-(\d{6,})\//);
  if (ozonMatch) return { marketplace: 'ozon', sku: ozonMatch[1] };
  const ozonMatch2 = url.match(/ozon\.ru\/product\/[^/]+\/(\d{6,})\//);
  if (ozonMatch2) return { marketplace: 'ozon', sku: ozonMatch2[1] };
  return null;
}

async function loadData(marketplace, sku, days) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getPriceHistory', marketplace, sku, days },
      (response) => {
        if (response && response.success) resolve(response.data);
        else reject(response?.error || 'Failed to load');
      }
    );
  });
}

async function loadDashboard(marketplace, sku) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getDashboard', marketplace, sku },
      (response) => {
        if (response && response.success) resolve(response.data);
        else reject(response?.error || 'Failed to load');
      }
    );
  });
}

function updateUI(data) {
  if (!data || !data.product) {
    show('#no-product');
    hide('#product-info');
    return;
  }

  hide('#no-product');
  show('#product-info');

  const p = data.product;
  const history = data.history || [];

  $('#marketplace-badge').textContent = p.marketplace === 'wb' ? 'WB' : 'OZON';
  $('#product-sku').textContent = `Арт: ${p.sku}`;
  $('#product-name').textContent = p.name || '—';
  $('#current-price').textContent = formatPrice(p.price);
  $('#detail-seller').textContent = p.seller || '—';
  $('#detail-rating').textContent = p.rating != null ? `★ ${p.rating.toFixed(1)}` : '—';
  $('#detail-category').textContent = p.category || '—';
  $('#detail-stock').textContent = p.stock != null ? `${p.stock} шт` : '—';

  if (p.old_price && p.old_price > p.price) {
    show('#old-price-block');
    $('#old-price').textContent = formatPrice(p.old_price);
    const discount = Math.round((1 - p.price / p.old_price) * 100);
    $('#discount-badge').textContent = `-${discount}%`;
  } else {
    hide('#old-price-block');
  }

  if (history.length > 0) {
    const prices = history.map((h) => h.price).filter((v) => v != null);
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const change = prices.length >= 2 ? prices[prices.length - 1] - prices[0] : 0;
      const changePercent = prices.length >= 2 && prices[0] > 0
        ? ((change / prices[0]) * 100).toFixed(1)
        : '—';

      $('#stat-min').textContent = formatPrice(min);
      $('#stat-max').textContent = formatPrice(max);
      $('#stat-avg').textContent = formatPrice(avg);
      $('#stat-change').textContent = change !== 0
        ? `${change > 0 ? '+' : ''}${formatPrice(change)} (${changePercent}%)`
        : '0';
    }

    renderChart(history);
  }

  if (data.sellerInfo) {
    show('#seller-analysis');
    const si = data.sellerInfo;
    $('#seller-products-count').textContent = `Товаров: ${si.product_count || '—'}`;
    $('#seller-avg-rating').textContent = `Средний рейтинг: ${si.avg_rating != null ? si.avg_rating.toFixed(2) : '—'}`;
  }
}

function renderChart(history) {
  const ctx = $('#price-chart').getContext('2d');

  const sorted = [...history].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const labels = sorted.map((h) => formatDate(h.created_at));
  const prices = sorted.map((h) => h.price);
  const oldPrices = sorted.map((h) => h.old_price);

  if (chart) chart.destroy();

  const datasets = [
    {
      label: 'Цена',
      data: prices,
      borderColor: '#e74c3c',
      backgroundColor: 'rgba(231, 76, 60, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointHitRadius: 10,
      borderWidth: 2,
    },
  ];

  const hasOldPrices = oldPrices.some((v) => v != null && v > 0);
  if (hasOldPrices) {
    datasets.push({
      label: 'Цена без скидки',
      data: oldPrices,
      borderColor: '#999',
      backgroundColor: 'transparent',
      borderDash: [5, 5],
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 1.5,
    });
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: hasOldPrices, position: 'top', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatPrice(ctx.parsed.y)} ₽`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 10, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            font: { size: 10 },
            callback: (v) => `${v.toLocaleString('ru-RU')} ₽`,
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    },
  });
}

async function init() {
  const tab = await getCurrentTab();
  if (!tab || !tab.url) {
    show('#no-product');
    return;
  }

  const info = extractSkuAndMarketplace(tab.url);
  if (!info) {
    show('#no-product');
    return;
  }

  currentSku = info.sku;
  currentMarketplace = info.marketplace;

  show('#loading');
  hide('#no-product');
  hide('#product-info');

  try {
    const data = await loadData(currentMarketplace, currentSku, currentDays);
    hide('#loading');
    updateUI(data);
  } catch (e) {
    hide('#loading');
    show('#no-product');
    const np = $('#no-product');
    np.innerHTML = `<p>Ошибка загрузки: ${e.message}</p>`;
  }
}

document.querySelectorAll('.period-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentDays = parseInt(btn.dataset.days, 10);

    if (currentSku && currentMarketplace) {
      show('#loading');
      hide('#product-info');
      try {
        const data = await loadData(currentMarketplace, currentSku, currentDays);
        hide('#loading');
        updateUI(data);
      } catch (e) {
        hide('#loading');
      }
    }
  });
});

init();
