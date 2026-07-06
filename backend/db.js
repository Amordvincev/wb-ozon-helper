const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marketplace TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT,
      price INTEGER,
      old_price INTEGER,
      seller TEXT,
      rating REAL,
      stock INTEGER,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(marketplace, sku)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marketplace TEXT NOT NULL,
      sku TEXT NOT NULL,
      price INTEGER,
      old_price INTEGER,
      url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_price_history_lookup
    ON price_history(marketplace, sku, created_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_products_lookup
    ON products(marketplace, sku)
  `);

  // Add price column if missing (migration)
  try {
    db.run('ALTER TABLE products ADD COLUMN price INTEGER');
  } catch (e) {}
  try {
    db.run('ALTER TABLE products ADD COLUMN old_price INTEGER');
  } catch (e) {}

  saveDb();
  console.log('Database initialized');
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDb, getDb, saveDb };
