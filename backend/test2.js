const { initDb, getDb, saveDb } = require('./db');

async function main() {
  await initDb();
  const db = getDb();

  db.run('INSERT INTO products (marketplace, sku, name) VALUES (?, ?, ?)', ['wb', '999', 'Test']);
  saveDb();

  // Test 1: bind as array
  const r1 = db.exec('SELECT * FROM products WHERE marketplace = ? AND sku = ?', ['wb', '999']);
  console.log('Test 1 (array bind):', r1.length > 0 ? 'FOUND' : 'EMPTY');

  // Test 2: bind as object with bind key
  const r2 = db.exec('SELECT * FROM products WHERE marketplace = ? AND sku = ?', { bind: ['wb', '999'] });
  console.log('Test 2 ({bind: arr}):', r2.length > 0 ? 'FOUND' : 'EMPTY');

  // Test 3: named params
  const r3 = db.exec('SELECT * FROM products WHERE marketplace = $m AND sku = $s', { $m: 'wb', $s: '999' });
  console.log('Test 3 (named):', r3.length > 0 ? 'FOUND' : 'EMPTY');

  // Test 4: no params
  const r4 = db.exec('SELECT * FROM products WHERE marketplace = "wb" AND sku = "999"');
  console.log('Test 4 (inline):', r4.length > 0 ? 'FOUND' : 'EMPTY');
}

main().catch(console.error);
