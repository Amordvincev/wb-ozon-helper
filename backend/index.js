const express = require('express');
const cors = require('cors');
const { initDb, getDb, saveDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/price', (req, res) => {
  try {
    const raw = req.body;
    const marketplace = raw.marketplace ?? null;
    const sku = raw.sku ?? null;
    const name = raw.name ?? null;
    const price = raw.price ?? null;
    const old_price = raw.old_price ?? null;
    const seller = raw.seller ?? null;
    const rating = raw.rating ?? null;
    const stock = raw.stock ?? null;
    const category = raw.category ?? null;
    const url = raw.url ?? null;

    if (!marketplace || !sku) {
      return res.status(400).json({ error: 'marketplace and sku are required' });
    }

    const db = getDb();

    const existing = db.exec(
      'SELECT id FROM products WHERE marketplace = ? AND sku = ?',
      [marketplace, sku]
    );

    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run(
        `UPDATE products SET name = COALESCE(?, name), price = COALESCE(?, price),
         old_price = COALESCE(?, old_price), seller = COALESCE(?, seller),
         rating = COALESCE(?, rating), stock = COALESCE(?, stock),
         category = COALESCE(?, category), updated_at = datetime('now')
         WHERE marketplace = ? AND sku = ?`,
        [name, price, old_price, seller, rating, stock, category, marketplace, sku]
      );
    } else {
      db.run(
        `INSERT INTO products (marketplace, sku, name, price, old_price, seller, rating, stock, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [marketplace, sku, name, price, old_price, seller, rating, stock, category]
      );
    }

    db.run(
      `INSERT INTO price_history (marketplace, sku, price, old_price, url)
       VALUES (?, ?, ?, ?, ?)`,
      [marketplace, sku, price, old_price, url]
    );

    saveDb();
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/price error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/price/:marketplace/:sku', (req, res) => {
  try {
    const { marketplace, sku } = req.params;
    const days = parseInt(req.query.days, 10) || 30;
    const db = getDb();

    const productResult = db.exec(
      'SELECT * FROM products WHERE marketplace = ? AND sku = ?',
      [marketplace, sku]
    );

    let product = null;
    if (productResult.length > 0 && productResult[0].values.length > 0) {
      const cols = productResult[0].columns;
      const vals = productResult[0].values[0];
      product = {};
      cols.forEach((col, i) => { product[col] = vals[i]; });
    }

    const historyResult = db.exec(
      `SELECT * FROM price_history
       WHERE marketplace = ? AND sku = ?
         AND created_at >= datetime('now', ? || ' days')
       ORDER BY created_at ASC`,
      [marketplace, sku, `-${days}`]
    );

    const history = [];
    if (historyResult.length > 0) {
      const cols = historyResult[0].columns;
      historyResult[0].values.forEach((vals) => {
        const row = {};
        cols.forEach((col, i) => { row[col] = vals[i]; });
        history.push(row);
      });
    }

    let sellerInfo = null;
    if (product && product.seller) {
      const sr = db.exec(
        `SELECT COUNT(*) as product_count, AVG(rating) as avg_rating
         FROM products WHERE seller = ? AND marketplace = ? AND rating IS NOT NULL`,
        [product.seller, marketplace]
      );
      if (sr.length > 0 && sr[0].values.length > 0) {
        const cols = sr[0].columns;
        const vals = sr[0].values[0];
        sellerInfo = {};
        cols.forEach((col, i) => { sellerInfo[col] = vals[i]; });
      }
    }

    res.json({ product, history, sellerInfo });
  } catch (e) {
    console.error('GET /api/price error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard', (req, res) => {
  try {
    const { marketplace, sku } = req.query;
    const db = getDb();

    let product = null;
    let history = [];

    if (marketplace && sku) {
      const pr = db.exec('SELECT * FROM products WHERE marketplace = ? AND sku = ?', [marketplace, sku]);
      if (pr.length > 0 && pr[0].values.length > 0) {
        const cols = pr[0].columns;
        const vals = pr[0].values[0];
        product = {};
        cols.forEach((col, i) => { product[col] = vals[i]; });
      }

      const hr = db.exec(
        'SELECT * FROM price_history WHERE marketplace = ? AND sku = ? ORDER BY created_at DESC LIMIT 90',
        [marketplace, sku]
      );
      if (hr.length > 0) {
        const cols = hr[0].columns;
        hr[0].values.forEach((vals) => {
          const row = {};
          cols.forEach((col, i) => { row[col] = vals[i]; });
          history.push(row);
        });
      }
    }

    const recentResult = db.exec(
      `SELECT marketplace, sku, name, price, created_at
       FROM price_history
       WHERE created_at >= datetime('now', '-1 day')
       ORDER BY created_at DESC LIMIT 20`
    );

    const recentPrices = [];
    if (recentResult.length > 0) {
      const cols = recentResult[0].columns;
      recentResult[0].values.forEach((vals) => {
        const row = {};
        cols.forEach((col, i) => { row[col] = vals[i]; });
        recentPrices.push(row);
      });
    }

    res.json({ product, history, recentPrices });
  } catch (e) {
    console.error('GET /api/dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ----- SUBSCRIPTIONS & PRO -----

const YOOMONEY_WALLET = process.env.YOOMONEY_WALLET || '';
const YOOMONEY_SECRET = process.env.YOOMONEY_SECRET || '';

function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'PRO-';
  for (let i = 0; i < 12; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
    if (i % 4 === 3 && i < 11) key += '-';
  }
  return key;
}

function cryptoRandom() {
  return require('crypto').randomBytes(16).toString('hex');
}

app.post('/api/pro/register', (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const db = getDb();
    db.run('INSERT OR IGNORE INTO clients (client_id) VALUES (?)', [client_id]);
    saveDb();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pro/activate', (req, res) => {
  try {
    const { key, client_id } = req.body;
    if (!key || !client_id) return res.status(400).json({ error: 'key and client_id required' });

    const db = getDb();
    const sub = db.exec(
      'SELECT * FROM subscriptions WHERE key = ? AND active = 1 AND (expires_at IS NULL OR expires_at >= datetime(\'now\'))',
      [key]
    );

    if (sub.length === 0 || sub[0].values.length === 0) {
      return res.json({ success: false, error: 'Неверный или просроченный ключ' });
    }

    const cols = sub[0].columns;
    const vals = sub[0].values[0];
    const subData = {};
    cols.forEach((col, i) => { subData[col] = vals[i]; });

    if (subData.client_id && subData.client_id !== client_id) {
      return res.json({ success: false, error: 'Ключ уже используется другим пользователем' });
    }

    db.run('UPDATE subscriptions SET client_id = ? WHERE id = ?', [client_id, subData.id]);
    saveDb();
    res.json({ success: true, expires_at: subData.expires_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pro/use', (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const db = getDb();
    db.run(
      `INSERT INTO usage_log (client_id, date, count) VALUES (?, date('now'), 1)
       ON CONFLICT(client_id, date) DO UPDATE SET count = count + 1`,
      [client_id]
    );
    saveDb();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pro/status', (req, res) => {
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const db = getDb();

    const usageResult = db.exec(
      'SELECT count FROM usage_log WHERE client_id = ? AND date = date(\'now\')',
      [client_id]
    );
    const todayUsage = usageResult.length > 0 && usageResult[0].values.length > 0
      ? usageResult[0].values[0][0] : 0;

    const subResult = db.exec(
      `SELECT * FROM subscriptions WHERE client_id = ? AND active = 1
       AND (expires_at IS NULL OR expires_at >= datetime('now'))`,
      [client_id]
    );

    const isPro = subResult.length > 0 && subResult[0].values.length > 0;

    res.json({
      is_pro: !!isPro,
      today_usage: todayUsage,
      daily_limit: 10,
      expires_at: isPro ? (subResult[0].values[0][subResult[0].columns.indexOf('expires_at')] || null) : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pro/generate-key', (req, res) => {
  try {
    const { days } = req.body;
    const db = getDb();
    const key = generateKey();
    const expiresAt = days ? `datetime('now', '+${days} days')` : null;

    db.run(
      `INSERT INTO subscriptions (key, expires_at) VALUES (?, ${expiresAt || 'NULL'})`,
      [key]
    );
    saveDb();
    res.json({ success: true, key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/yoomoney/callback', (req, res) => {
  try {
    const notification_type = req.body.notification_type || '';
    const operation_id = req.body.operation_id || '';
    const amount = req.body.amount || '0';
    const currency = req.body.currency || '';
    const datetime = req.body.datetime || '';
    const sender = req.body.sender || '';
    const codepro = req.body.codepro || '';
    const label = req.body.label || '';
    const sha1_hash = req.body.sha1_hash || '';

    const checkStr = `${notification_type}&${operation_id}&${amount}&${currency}&${datetime}&${sender}&${codepro}&${YOOMONEY_SECRET}&${label}`;
    const hash = require('crypto').createHash('sha1').update(checkStr).digest('hex');

    if (hash !== sha1_hash) {
      return res.status(400).send('Invalid hash');
    }

    const db = getDb();
    const key = generateKey();
    db.run(
      `INSERT INTO subscriptions (key, expires_at) VALUES (?, datetime('now', '+30 days'))`,
      [key]
    );
    saveDb();

    res.status(200).send(`KEY: ${key}`);
  } catch (e) {
    console.error('yoomoney error:', e);
    res.status(500).send('Error');
  }
});

app.get('/api/pro/test-pay', (req, res) => {
  const db = getDb();
  const key = generateKey();
  db.run(
    `INSERT INTO subscriptions (key, expires_at) VALUES (?, datetime('now', '+30 days'))`,
    [key]
  );
  saveDb();
  res.send(`<h2>Тестовый платёж</h2><p>Сгенерирован ключ: <b>${key}</b></p><p>Введите его в расширении.</p>`);
});

app.get('/api/pro/pay', (req, res) => {
  const receiver = YOOMONEY_WALLET || 'YOUR_WALLET_NUMBER';
  const label = cryptoRandom();
  const sum = '500';

  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Оплата PRO</title></head><body>
    <h2>WB-Ozon Helper PRO — 500₽/мес</h2>
    <form method="POST" action="https://yoomoney.ru/quickpay/confirm.xml">
      <input type="hidden" name="receiver" value="${receiver}">
      <input type="hidden" name="formcomment" value="WB-Ozon Helper PRO">
      <input type="hidden" name="short-dest" value="WB-Ozon Helper PRO">
      <input type="hidden" name="label" value="${label}">
      <input type="hidden" name="quickpay-form" value="shop">
      <input type="hidden" name="targets" value="PRO подписка">
      <input type="hidden" name="sum" value="${sum}" data-type="number">
      <input type="hidden" name="comment" value="PRO подписка WB-Ozon Helper">
      <input type="hidden" name="successURL" value="https://wb-ozon-helper.onrender.com/api/pro/success?label=${label}">
      <button type="submit">Оплатить 500₽</button>
    </form>
    <p>После оплаты ключ придёт на этот адрес через минуту. Проверьте статус в расширении.</p>
    </body></html>
  `);
});

app.get('/api/pro/success', (req, res) => {
  const { label } = req.query;
  const db = getDb();
  const sub = db.exec(
    'SELECT key FROM subscriptions ORDER BY id DESC LIMIT 1',
    []
  );
  const key = sub.length > 0 && sub[0].values.length > 0 ? sub[0].values[0][0] : 'ожидайте...';
  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Оплата принята</title></head><body>
    <h2>Спасибо за оплату!</h2>
    <p>Ваш PRO-ключ: <b>${key}</b></p>
    <p>Скопируйте его и введите в расширении.</p>
    <p>Если ключ ещё не активирован — подождите минуту и проверьте статус в расширении.</p>
    </body></html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`WB-Ozon Helper API running on http://localhost:${PORT}`);
  });
}

start().catch((e) => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
