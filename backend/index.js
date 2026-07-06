const express = require('express');
const cors = require('cors');
const { initDb, getDb, saveDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/price', (req, res) => {
  try {
    const { marketplace, sku, name, price, old_price, seller, rating, stock, category, url } = req.body;

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
