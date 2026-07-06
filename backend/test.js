const { initDb, getDb, saveDb } = require('./db');

async function main() {
  await initDb();
  const db = getDb();

  console.log('Testing INSERT...');
  db.run('INSERT INTO products (marketplace, sku, name, seller, rating, stock, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['wb', '999', 'Test Product', 'Test Seller', 4.5, 100, 'Electronics']);
  
  db.run('INSERT INTO price_history (marketplace, sku, price, old_price, url) VALUES (?, ?, ?, ?, ?)',
    ['wb', '999', 1500, 2000, 'https://example.com']);
  
  saveDb();
  console.log('Data inserted');

  console.log('Testing SELECT...');
  const r = db.exec('SELECT * FROM products WHERE marketplace = ? AND sku = ?', { bind: ['wb', '999'] });
  console.log('Result:', JSON.stringify(r, null, 2));

  if (r.length > 0 && r[0].values.length > 0) {
    const cols = r[0].columns;
    const vals = r[0].values[0];
    const obj = {};
    cols.forEach((col, i) => { obj[col] = vals[i]; });
    console.log('Parsed:', JSON.stringify(obj));
  } else {
    console.log('No results found');
  }

  const r2 = db.exec('SELECT * FROM products');
  console.log('All products:', JSON.stringify(r2));

  console.log('Test passed!');
}

main().catch(console.error);
