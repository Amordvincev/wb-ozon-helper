import * as cheerio from 'cheerio';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'avito-history.json');
const BACKEND_URL = process.env.BACKEND_URL || 'https://wb-ozon-helper.onrender.com';

const CITY = { name: 'Волгоград', slug: 'volgograd' };

const KNOWN_BRANDS = [
  'Lada', 'ВАЗ', 'Vaz', 'Toyota', 'Kia', 'Hyundai', 'Renault', 'Nissan',
  'Volkswagen', 'VW', 'BMW', 'Mercedes-Benz', 'Mercedes', 'Audi', 'Ford',
  'Skoda', 'Mitsubishi', 'Mazda', 'Chevrolet', 'Honda', 'Suzuki', 'Lexus',
  'Daewoo', 'Opel', 'Peugeot', 'Citroen', 'Land Rover', 'Jeep', 'Infiniti',
  'Porsche', 'Volvo', 'Mini', 'Subaru', 'Geely', 'Changan', 'Haval',
  'Chery', 'Exeed', 'Lifan', 'JAC', 'Zotye', 'Brilliance', 'Ravon',
  'Tesla', 'UAZ', 'ГАЗ', 'Газ', 'Moskvich', 'Москвич', 'Datsun',
  'Great Wall', 'Jaguar', 'Seat', 'Fiat', 'Dodge', 'Chrysler',
  'SsangYong', 'Ssang yong', 'Daihatsu', 'Alfa Romeo', 'Citroёn',
  'Omoda', 'Jetour', 'Faw', 'Bestune', 'Kaiyi', 'SWM',
];

const BRAND_SET = new Set(KNOWN_BRANDS.map(b => b.toLowerCase()));

function parseBrand(title) {
  const firstWord = title.split(/[\s,]+/)[0];
  const lower = firstWord.toLowerCase();
  if (BRAND_SET.has(lower)) return firstWord;
  // Check multi-word brands
  const words = title.split(/\s+/);
  for (let i = Math.min(words.length, 3); i >= 1; i--) {
    const phrase = words.slice(0, i).join(' ').toLowerCase();
    if (BRAND_SET.has(phrase)) return words.slice(0, i).join(' ');
  }
  return firstWord;
}

function parseModel(title, brand) {
  const rest = title.slice(brand.length).trim();
  return rest.split(/[\s,]+/)[0] || '-';
}

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

function extractNumber(text) {
  if (!text) return null;
  const nums = text.match(/\d[\d\s]*\d|\d/g);
  if (!nums) return null;
  return parseInt(nums.join('').replace(/\s/g, ''));
}

function extractListings(html) {
  const $ = cheerio.load(html);
  const listings = [];

  // Try multiple selectors for items
  const items = $('[data-marker="item"], .iva-item-content, [class*="iva-item"]');

  items.each((i, el) => {
    try {
      const htmlText = $(el).html() || '';
      const text = $(el).text();

      // Title from various possible elements
      let title = '';
      const titleSelectors = [
        '[itemprop="name"]', '[data-marker="item-title"]',
        'h3 a', 'h3', '[class*="title"] a',
        'a[href*="/avtomobili/"]',
      ];
      for (const sel of titleSelectors) {
        const found = $(el).find(sel).first().text().trim();
        if (found && found.length > 3) { title = found; break; }
      }
      if (!title) {
        const links = $(el).find('a');
        links.each((_, a) => {
          const href = $(a).attr('href') || '';
          if (href.includes('/avtomobili/') || href.includes('/item/')) {
            const t = $(a).text().trim();
            if (t.length > 3) title = t;
          }
        });
      }
      if (!title) title = text.substring(0, 100).split('\n')[0].trim();
      if (title.length < 4) return;

      // Price
      let price = null;
      const priceSelectors = [
        '[itemprop="price"]', '[data-marker="item-price"]',
        '[class*="price"]', '[class*="Price"]',
      ];
      for (const sel of priceSelectors) {
        const elPrice = $(el).find(sel).first();
        const priceTxt = elPrice.attr('content') || elPrice.text();
        const extracted = extractNumber(priceTxt);
        if (extracted && extracted > 10000 && extracted < 100000000) { price = extracted; break; }
      }

      // Fallback: find any price pattern in text
      if (!price) {
        const priceMatch = text.match(/(\d[\d\s]*)\s*₽/);
        if (priceMatch) {
          const p = extractNumber(priceMatch[1]);
          if (p && p > 10000 && p < 100000000) price = p;
        }
      }

      if (!price) return;

      // Year
      let year = null;
      const yearMatch = text.match(/(\d{4})\s*(?:г|год)/);
      if (yearMatch) year = parseInt(yearMatch[1]);

      // Mileage
      let mileage = null;
      const miMatch = text.match(/(\d[\d\s]*)\s*(?:км|тыс)/i);
      if (miMatch) mileage = extractNumber(miMatch[1]);
      if (mileage && mileage < 100) mileage *= 1000;

      // URL
      let url = '';
      $(el).find('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (href.includes('/avtomobili/') || href.includes('/item/')) {
          url = href.startsWith('http') ? href : `https://www.avito.ru${href}`;
        }
      });

      const brand = parseBrand(title);
      const model = parseModel(title, brand);

      listings.push({ title: title.substring(0, 100), brand, model, price, year, mileage, url: url.substring(0, 300) });
    } catch (_) {}
  });

  return listings;
}

async function parseAllPages() {
  const allListings = [];
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const p = page === 1 ? '' : `?p=${page}`;
      const url = `https://www.avito.ru/${CITY.slug}/avtomobili${p}`;
      console.log(`Страница ${page}...`);
      const html = await fetchPage(url);
      const listings = extractListings(html);

      if (listings.length === 0) {
        console.log(`  → пусто, стоп`);
        break;
      }
      allListings.push(...listings);
      console.log(`  → ${listings.length} объявлений (всего: ${allListings.length})`);
    } catch (err) {
      console.log(`  → ошибка: ${err.message}`);
      break;
    }
  }

  return allListings;
}

function computeStats(listings) {
  if (listings.length === 0) return null;

  const valid = listings.filter(l => l.price > 50000 && l.price < 50000000);
  const prices = valid.map(l => l.price).sort((a, b) => a - b);
  const withYear = valid.filter(l => l.year && l.year >= 1990 && l.year <= 2026);
  const withMileage = valid.filter(l => l.mileage && l.mileage > 0 && l.mileage < 500000);

  const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const median = arr => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };

  const brandStats = {};
  for (const l of valid) {
    if (!brandStats[l.brand]) brandStats[l.brand] = { count: 0, prices: [] };
    brandStats[l.brand].count++;
    brandStats[l.brand].prices.push(l.price);
  }

  const modelStats = {};
  for (const l of valid) {
    const key = `${l.brand} ${l.model}`;
    if (!modelStats[key]) modelStats[key] = { brand: l.brand, model: l.model, count: 0, prices: [], years: [], mileages: [] };
    modelStats[key].count++;
    modelStats[key].prices.push(l.price);
    if (l.year && l.year >= 1990) modelStats[key].years.push(l.year);
    if (l.mileage && l.mileage > 0 && l.mileage < 500000) modelStats[key].mileages.push(l.mileage);
  }

  const brands = Object.entries(brandStats)
    .filter(([_, v]) => v.count >= 2)
    .map(([name, data]) => ({ brand: name, count: data.count, avgPrice: avg(data.prices) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const models = Object.entries(modelStats)
    .filter(([_, v]) => v.count >= 2)
    .map(([name, data]) => ({
      brand: data.brand, model: data.model,
      fullName: name, count: data.count, avgPrice: avg(data.prices),
      avgYear: data.years.length > 0 ? avg(data.years) : null,
      avgMileage: data.mileages.length > 0 ? avg(data.mileages) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  return {
    total: prices.length,
    avgPrice: avg(prices),
    medianPrice: median(prices),
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    avgYear: withYear.length > 0 ? avg(withYear.map(l => l.year)) : null,
    avgMileage: withMileage.length > 0 ? avg(withMileage.map(l => l.mileage)) : null,
    brands, models,
    sampledAt: new Date().toISOString(),
  };
}

function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return []; }
}

async function sendToBackend(listings, stats) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/avito/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: CITY.name, listings, stats }),
    });
    if (res.ok) console.log('Данные отправлены на сервер');
    else console.error('Ошибка отправки:', res.status);
  } catch (err) {
    console.error('Сервер недоступен:', err.message);
  }
}

async function main() {
  console.log(`Парсинг Avito ${CITY.name}...`);
  const listings = await parseAllPages();
  const stats = computeStats(listings);

  if (stats) {
    console.log(`\n=== ИТОГО ===`);
    console.log(`Объявлений: ${stats.total}`);
    console.log(`Цена: средняя ${stats.avgPrice.toLocaleString()} ₽, медиана ${stats.medianPrice.toLocaleString()} ₽`);
    console.log(`Год: ${stats.avgYear || '?'}`);
    console.log(`Пробег: ${stats.avgMileage ? (stats.avgMileage / 1000).toFixed(0) + ' тыс. км' : '?'}`);
    console.log(`Марок: ${stats.brands.length}, Моделей: ${stats.models.length}`);
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const history = loadHistory();
  history.push({ date: new Date().toISOString().split('T')[0], city: CITY.name, stats });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  await sendToBackend(listings, stats);

  if (stats) {
    try {
      await fetch(`${BACKEND_URL}/api/avito/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats }),
      });
      console.log('Уведомление в Telegram отправлено');
    } catch (_) {}
  }
}

main().catch(console.error);
