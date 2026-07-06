const { getDb } = require('./db');

let bot = null;
const ADMIN_ID = process.env.TG_ADMIN_ID || null;

function initBot() {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) {
    console.log('TG_BOT_TOKEN not set, bot disabled');
    return;
  }

  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    showBrands(chatId, null, true);
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;

    try {
      if (data === 'back_brands') {
        await bot.editMessageText(
          '🚗 *Avito Волгоград — рынок авто*\n\nВыбери марку:',
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[]] } }
        );
        await showBrands(chatId, msgId, false);
      }
      else if (data.startsWith('brand_')) {
        const brand = data.slice(6);
        await showModels(chatId, msgId, brand);
      }
      else if (data.startsWith('model_')) {
        const parts = data.slice(6).split('||');
        const brand = parts[0];
        const model = parts[1];
        await showModelStats(chatId, msgId, brand, model);
      }
      else if (data.startsWith('trend_')) {
        const parts = data.slice(6).split('||');
        await showTrend(chatId, msgId, parts[0], parts[1], parseInt(parts[2]) || 7);
      }
    } catch (e) {
      console.error('Bot callback error:', e.message);
    }

    bot.answerCallbackQuery(query.id);
  });

  console.log('Telegram bot started');
}

async function showBrands(chatId, msgId, isNew) {
  const db = getDb();
  const rows = db.exec(
    `SELECT UPPER(brand) as brand_upper, COUNT(*) as count, AVG(price) as avg
     FROM avito_listings WHERE brand != ''
     AND date >= date('now', '-14 days')
     GROUP BY brand_upper ORDER BY count DESC LIMIT 12`,
    []
  );

  const brands = rows[0]?.values || [];
  const buttons = brands.map(([brand, count, avg]) => ([{
    text: `${brand}  (${count} шт, ${(avg / 1000).toFixed(0)}k₽)`,
    callback_data: `brand_${brand}`,
  }]));

  buttons.push([{ text: '🔄 Обновить', callback_data: 'back_brands' }]);

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  };

  if (isNew) {
    const total = db.exec(
      `SELECT COUNT(*) FROM avito_listings WHERE date = (SELECT MAX(date) FROM avito_listings)`, []
    );
    const count = total[0]?.values[0]?.[0] || 0;
    await bot.sendMessage(chatId, `📊 Всего объявлений сегодня: ${count}`, opts);
  } else {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: buttons },
      { chat_id: chatId, message_id: msgId }
    );
  }
}

async function showModels(chatId, msgId, brand) {
  const db = getDb();
  const rows = db.exec(
    `SELECT model, COUNT(*) as count, AVG(price) as avg
     FROM avito_listings WHERE brand = ?
     AND date >= date('now', '-14 days')
     GROUP BY model ORDER BY count DESC LIMIT 10`,
    [brand]
  );

  const models = rows[0]?.values || [];
  const buttons = models.map(([model, count, avg]) => ([{
    text: `${model}  (${count} шт, ${(avg / 1000).toFixed(0)}k₽)`,
    callback_data: `model_${brand}||${model}`,
  }]));

  buttons.push([{ text: '← Назад к маркам', callback_data: 'back_brands' }]);

  await bot.editMessageText(
    `🚗 *${brand}* — модели:\n\nВыбери модель для детальной статистики:`,
    {
      chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    }
  );
}

async function showModelStats(chatId, msgId, brand, model) {
  const db = getDb();
  const rows = db.exec(
    `SELECT AVG(price) as avg, MIN(price) as min, MAX(price) as max,
            COUNT(*) as count, AVG(year) as avgYear, AVG(mileage) as avgMileage
     FROM avito_listings WHERE brand = ? AND model = ?
     AND date = (SELECT MAX(date) FROM avito_listings)`,
    [brand, model]
  );

  const vals = rows[0]?.values[0];
  if (!vals) {
    await bot.editMessageText(
      `Нет данных по ${brand} ${model} за сегодня`,
      { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: '← Назад', callback_data: `brand_${brand}` }]] } }
    );
    return;
  }

  const [avg, min, max, count, avgYear, avgMileage] = vals;
  const formatPrice = (p) => (p || 0).toLocaleString() + ' ₽';

  const text =
    `🚗 *${brand} ${model}*\n\n`
    + `📅 *Сегодня*\n`
    + `▫️ Всего: *${count}* объявлений\n`
    + `▫️ Средняя: *${formatPrice(avg)}*\n`
    + `▫️ Мин: *${formatPrice(min)}*\n`
    + `▫️ Макс: *${formatPrice(max)}*\n\n`
    + (avgYear ? `📆 Средний год: *${avgYear.toFixed(0)}*\n` : '')
    + (avgMileage ? `🛞 Средний пробег: *${(avgMileage / 1000).toFixed(0)} тыс. км*\n` : '')
    + `\nВыбери период для графика цен:`;

  const buttons = [
    [{ text: '📈 7 дней', callback_data: `trend_${brand}||${model}||7` }],
    [{ text: '📈 30 дней', callback_data: `trend_${brand}||${model}||30` }],
    [{ text: '← Назад к моделям', callback_data: `brand_${brand}` }],
  ];

  await bot.editMessageText(text, {
    chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
}

async function showTrend(chatId, msgId, brand, model, days) {
  const db = getDb();
  const rows = db.exec(
    `SELECT date, AVG(price) as avg, COUNT(*) as count
     FROM avito_listings WHERE brand = ? AND model = ?
     AND date >= date('now', '-' || ? || ' days')
     GROUP BY date ORDER BY date ASC`,
    [brand, model, days]
  );

  const data = rows[0]?.values || [];

  if (data.length < 2) {
    await bot.editMessageText(
      `Недостаточно данных для графика (${data.length} день)`,
      { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: '← Назад', callback_data: `model_${brand}||${model}` }]] } }
    );
    return;
  }

  // Build ASCII chart
  const prices = data.map(r => r[1]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const barWidth = 10;

  let chart = '📈 *Динамика цен*\n```\n';
  for (const [date, price, count] of data) {
    const barLen = Math.round(((price - min) / range) * barWidth);
    const bar = '█'.repeat(barLen) + '░'.repeat(barWidth - barLen);
    const shortDate = date.slice(5);
    chart += `${shortDate} ${bar} ${price.toLocaleString()}₽ (${count})\n`;
  }

  const startPrice = data[0][1];
  const endPrice = data[data.length - 1][1];
  const diff = endPrice - startPrice;
  const sign = diff >= 0 ? '📈' : '📉';
  chart += '```\n';
  chart += `${sign} За ${days} дней: ${diff >= 0 ? '+' : ''}${diff.toLocaleString()}₽ (${(diff / startPrice * 100).toFixed(1)}%)`;

  await bot.editMessageText(chart, {
    chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '← Назад', callback_data: `model_${brand}||${model}` }]] },
  });
}

function sendDailyDigest(stats) {
  if (!bot || !ADMIN_ID || !stats) return;
  try {
    const text =
      `🌅 *Доброе утро!* Сводка по Avito Волгоград\n\n`
      + `📊 Всего: *${stats.total}* машин\n`
      + `💰 Средняя цена: *${(stats.avgPrice || 0).toLocaleString()} ₽*\n`
      + `📊 Медианная: *${(stats.medianPrice || 0).toLocaleString()} ₽*\n`
      + (stats.avgYear ? `📆 Средний год: *${stats.avgYear.toFixed(0)}*\n` : '')
      + (stats.avgMileage ? `🛞 Пробег: *${(stats.avgMileage / 1000).toFixed(0)} тыс. км*\n\n` : '\n')
      + `Топ марок:\n`
      + (stats.brands || []).slice(0, 5).map(b => `▫️ *${b.brand}* — ${b.count} шт, средняя ${(b.avgPrice / 1000).toFixed(0)}k₽`).join('\n')
      + `\n\nОткрой бота — выбери марку и модель для деталей 📊`;

    bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('Digest error:', e.message);
  }
}

module.exports = { initBot, sendDailyDigest };
