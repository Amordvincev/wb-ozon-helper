const API_URL = 'http://localhost:3000';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('priceCheck', { periodInMinutes: 60 });
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

  if (request.action === 'getDashboard') {
    fetch(`${API_URL}/api/dashboard?marketplace=${request.marketplace || ''}&sku=${request.sku || ''}`)
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }
});
