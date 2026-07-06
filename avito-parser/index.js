import * as cheerio from 'cheerio';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'avito-history.json');
const BACKEND_URL = process.env.BACKEND_URL || 'https://wb-ozon-helper.onrender.com';

const CITY = { name: 'Волгоград', slug: 'volgograd' };

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

const KNOWN_BRANDS = [
  'toyota', 'kia', 'hyundai', 'renault', 'lada', 'volkswagen', 'nissan', 'bmw', 'mercedes', 'audi',
  'ford', 'skoda', 'mitsubishi', 'mazda', 'chevrolet', 'honda', 'suzuki', 'lexus', 'daewoo', 'opel',
  'peugeot', 'citroen', 'land rover', 'jeep', 'infiniti', 'porsche', 'volvo', 'mini', 'subaru', 'geely',
  'changan', 'haval', 'chery', 'exeed', 'lifan', 'jac', 'uaz', 'gaz', 'vaz', 'zaz', 'moskvich',
];

function parseBrand(title) {
  const lower = title.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.startsWith(brand)) return brand;
  }
  const firstWord = title.split(/\s+/)[0];
  return firstWord;
}

function parseModel(title, brand) {
  const withoutBrand = title.slice(brand.length).trim();
  const parts = withoutBrand.split(/[\s,]+/);
  return parts[0] || '-';
}

function extractListings(html) {
  const $ = cheerio.load(html);
  const listings = [];

  $('[data-marker="item"]').each((i, el) => {
    const titleEl = $(el).find('[itemprop="name"], [data-marker="item-title"]');
    const priceEl = $(el).find('[itemprop="price"], [data-marker="item-price"]');
    const descEl = $(el).find('[class*="description"], [class*="params"]');
    const linkEl = $(el).find('a[href*="/avtomobili/"]');

    const title = titleEl.text().trim();
    const priceRaw = priceEl.attr('content') || priceEl.text().trim();
    const price = parseInt(priceRaw.replace(/\s/g, '').replace(/[^0-9]/g, ''));

    if (!title || !price) return;

    const desc = descEl.text();
    const yearMatch = desc.match(/(\d{4})\s*г/i) || title.match(/,?\s*(\d{4})\b/);
    const mileageMatch = desc.match(/(\d[\d\s]*)\s*км/i) || desc.match(/пробег[^0-9]*(\d[\d\s]*)/i);

    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/\s/g, '')) : null;
    const brand = parseBrand(title);
    const model = parseModel(title, brand);
    const href = linkEl.attr('href') || '';
    const url = href.startsWith('http') ? href : `https://www.avito.ru${href}`;

    listings.push({
      title: title.substring(0, 80),
      brand,
      model,
      price,
      year,
      mileage,
      url,
    });
  });

  return listings;
}

function computeStats(listings) {
  if (listings.length === 0) return null;

  const prices = listings.map(l => l.price).sort((a, b) => a - b);
  const withYear = listings.filter(l => l.year);
  const withMileage = listings.filter(l => l.mileage);

  const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const median = arr => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };

  const brandStats = {};
  for (const l of listings) {
    if (!brandStats[l.brand]) brandStats[l.brand] = { count: 0, prices: [] };
    brandStats[l.brand].count++;
    brandStats[l.brand].prices.push(l.price);
  }

  const modelStats = {};
  for (const l of listings) {
    const key = `${l.brand} ${l.model}`;
    if (!modelStats[key]) modelStats[key] = { brand: l.brand, model: l.model, count: 0, prices: [], years: [], mileages: [] };
    modelStats[key].count++;
    modelStats[key].prices.push(l.price);
    if (l.year) modelStats[key].years.push(l.year);
    if (l.mileage) modelStats[key].mileages.push(l.mileage);
  }

  const brands = Object.entries(brandStats)
    .filter(([_, v]) => v.count >= 2)
    .map(([name, data]) => ({ brand: name, count: data.count, avgPrice: avg(data.prices) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const models = Object.entries(modelStats)
    .filter(([_, v]) => v.count >= 2)
    .map(([name, data]) => ({
      brand: data.brand,
      model: data.model,
      fullName: name,
      count: data.count,
      avgPrice: avg(data.prices),
      avgYear: data.years.length > 0 ? avg(data.years) : null,
      avgMileage: data.mileages.length > 0 ? avg(data.mileages) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  return {
    total: listings.length,
    avgPrice: avg(prices),
    medianPrice: median(prices),
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    avgYear: withYear.length > 0 ? avg(withYear.map(l => l.year)) : null,
    avgMileage: withMileage.length > 0 ? avg(withMileage.map(l => l.mileage)) : null,
    brands,
    models,
    sampledAt: new Date().toISOString(),
  };
}

function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

async function sendToBackend(listings, stats) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/avito/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: CITY.name, listings, stats }),
    });
    if (res.ok) console.log('Данные отправлены на сервер');
    else console.error('Ошибка отправки:', res.status, await res.text());
  } catch (err) {
    console.error('Сервер недоступен:', err.message);
  }
}

async function main() {
  console.log(`\n=== ${CITY.name} ===`);
  let listings = [];
  let stats = null;

  try {
    const url = `https://www.avito.ru/${CITY.slug}/avtomobili`;
    const html = await fetchPage(url);
    listings = extractListings(html);
    stats = computeStats(listings);

    if (stats) {
      console.log(`Найдено: ${stats.total} машин`);
      console.log(`Средняя цена: ${stats.avgPrice.toLocaleString()} ₽`);
      console.log(`Медианная цена: ${stats.medianPrice.toLocaleString()} ₽`);
      console.log(`Средний год: ${stats.avgYear}`);
      console.log(`Средний пробег: ${stats.avgMileage ? (stats.avgMileage / 1000).toFixed(1) : '?'} тыс. км`);
      console.log(`Моделей: ${stats.models.length}`);
    }
  } catch (err) {
    console.error(`Ошибка ${CITY.name}:`, err.message);
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const history = loadHistory();
  history.push({
    date: new Date().toISOString().split('T')[0],
    city: CITY.name,
    stats,
  });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  console.log(`\nИстория сохранена`);

  await sendToBackend(listings, stats);

  if (stats) {
    try {
      await fetch(`${BACKEND_URL}/api/avito/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats }),
      });
      console.log('Уведомление отправлено');
    } catch (_) {}
  }
}

main().catch(console.error);
