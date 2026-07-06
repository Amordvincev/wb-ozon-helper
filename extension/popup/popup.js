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

let isPro = false;
let proData = null;

function proStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'proStatus' }, (r) => {
      resolve(r?.success ? r.data : null);
    });
  });
}

function proActivate(key) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'proActivate', key }, (r) => {
      resolve(r?.success ? r.data : null);
    });
  });
}

function proUse() {
  chrome.runtime.sendMessage({ action: 'proUse' });
}

function updateProUI() {
  const btn = $('#pro-btn');
  if (proData?.is_pro) {
    btn.classList.add('pro-active');
    btn.textContent = 'PRO';
  } else {
    btn.classList.remove('pro-active');
    btn.textContent = 'PRO';
  }
}

function limitPeriods() {
  document.querySelectorAll('.period-btn').forEach((btn) => {
    const days = parseInt(btn.dataset.days, 10);
    if (!proData?.is_pro && days > 7) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.title = 'Только для PRO';
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.title = '';
    }
  });
}

$('#pro-btn').addEventListener('click', () => {
  show('#pro-overlay');
  renderProModal();
});

$('#pro-close-btn').addEventListener('click', () => {
  hide('#pro-overlay');
});

$('#pro-activate-btn').addEventListener('click', async () => {
  const key = $('#pro-key-input').value.trim();
  if (!key) return;
  $('#pro-activate-btn').textContent = 'Активация...';
  $('#pro-activate-btn').disabled = true;
  const result = await proActivate(key);
  $('#pro-activate-btn').textContent = 'Активировать';
  $('#pro-activate-btn').disabled = false;
  if (result?.success) {
    await checkProStatus();
    renderProModal();
    limitPeriods();
  } else {
    alert(result?.error || 'Ошибка активации');
  }
});

async function renderProModal() {
  await checkProStatus();
  const statusEl = $('#pro-status');
  const statusText = $('#pro-status-text');
  const usageEl = $('#pro-usage');
  const todayEl = $('#pro-today');

  if (proData?.is_pro) {
    statusEl.className = 'pro-active-status';
    statusText.textContent = '✓ PRO активна';
    usageEl.style.display = 'none';
  } else {
    statusEl.className = 'pro-free';
    statusText.textContent = 'Бесплатный тариф';
    usageEl.style.display = 'block';
    todayEl.textContent = proData?.today_usage || 0;
  }
}

async function checkProStatus() {
  const result = await proStatus();
  if (result) {
    proData = result;
    isPro = !!result.is_pro;
    updateProUI();
    limitPeriods();
  }
}

document.querySelectorAll('.period-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const days = parseInt(btn.dataset.days, 10);
    if (!proData?.is_pro && days > 7) return;

    document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentDays = days;

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

init().then(() => {
  checkProStatus();
  if (currentSku) proUse();
});
