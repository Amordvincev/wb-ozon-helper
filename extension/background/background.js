const API_URL = 'https://wb-ozon-helper.onrender.com';

function generateClientId() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getClientId() {
  const result = await chrome.storage.local.get('client_id');
  if (result.client_id) return result.client_id;
  const client_id = generateClientId();
  await chrome.storage.local.set({ client_id });
  try {
    await fetch(`${API_URL}/api/pro/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id }),
    });
  } catch (e) {
    console.warn('[WB-Ozon] Register failed:', e.message);
  }
  return client_id;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('priceCheck', { periodInMinutes: 60 });
  getClientId();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'priceCheck') {
    chrome.tabs.query({ url: [
      'https://www.wildberries.ru/catalog/*/detail.aspx*',
      'https://www.ozon.ru/product/*'
    ]}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'checkPrice' }).catch(() => {});
      });
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'savePrice') {
    fetch(`${API_URL}/api/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.data),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'getPriceHistory') {
    fetch(`${API_URL}/api/price/${request.marketplace}/${request.sku}`)
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'proStatus') {
    (async () => {
      const client_id = await getClientId();
      try {
        const r = await fetch(`${API_URL}/api/pro/status?client_id=${client_id}`);
        const data = await r.json();
        sendResponse({ success: true, data });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'proActivate') {
    (async () => {
      const client_id = await getClientId();
      try {
        const r = await fetch(`${API_URL}/api/pro/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: request.key, client_id }),
        });
        const data = await r.json();
        sendResponse({ success: true, data });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'proUse') {
    (async () => {
      const client_id = await getClientId();
      try {
        await fetch(`${API_URL}/api/pro/use`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id }),
        });
      } catch (e) {}
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'proClientId') {
    (async () => {
      const client_id = await getClientId();
      sendResponse({ success: true, client_id });
    })();
    return true;
  }

  if (request.action === 'getDashboard') {
    fetch(`${API_URL}/api/dashboard?marketplace=${request.marketplace || ''}&sku=${request.sku || ''}`)
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }
});
