// Usage: node scripts/stats.js [days=7]
// Prints daily traffic and chat counters from the site database.
import { createStore } from '../server/store.js';
import { moscowDate } from '../server/daily-forecast.js';

const days = Math.max(1, Math.min(365, Number(process.argv[2] ?? 7) || 7));
const from = moscowDate(new Date(Date.now() - (days - 1) * 86_400_000));
const store = await createStore(process.env.DATABASE_URL || 'pglite:./data/pglite');
try {
  const byDay = new Map();
  for (const { day, metric, value } of await store.listMetrics(from)) {
    if (!byDay.has(day)) byDay.set(day, {});
    byDay.get(day)[metric] = value;
  }
  const avg = (row, name) => (row[`${name}_count`] ? Math.round(row[`${name}_ms_sum`] / row[`${name}_count`]) : '—');
  const rows = [...byDay].map(([day, row]) => ({
    'день': day, 'просмотры': row.page_views ?? 0, 'посетители': row.unique_visitors ?? 0, 'API': row.api_requests ?? 0,
    'регистрации': row.signups ?? 0, 'входы': row.logins ?? 0, 'чат': row.chat_messages ?? 0,
    'ошибки': row.chat_errors ?? 0, 'занято': row.chat_busy ?? 0, 'лимит': (row.chat_rate_limited ?? 0) + (row.chat_daily_limit ?? 0),
    'отсеяно': row.chat_filtered ?? 0, 'первый токен, мс': avg(row, 'chat_first_token'), 'ответ, мс': avg(row, 'chat_answer'),
  }));
  if (rows.length) console.table(rows);
  else console.log(`Нет данных с ${from}`);
} finally { await store.close(); }
