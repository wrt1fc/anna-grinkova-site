import { forecastForDate, moscowDate } from './daily-forecast.js';
import { personalForecastForDate } from './personal-forecast.js';

const DAY_MS = 86_400_000;
export function validForecastDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Calendar arithmetic is performed in UTC on ISO dates, after choosing the Moscow date.
export function weekDates(day = moscowDate()) {
  if (!validForecastDate(day)) throw new Error('invalid_forecast_date');
  const date = new Date(`${day}T12:00:00Z`);
  const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

export function calculatedDay(day, { userId = null, profile = null, general = null, draw = 0 } = {}) {
  if (profile?.birthUtc) return personalForecastForDate(day, profile, userId, general ?? forecastForDate(day, draw), draw);
  return forecastForDate(day, draw, userId);
}

const GUIDANCE = {
  Овен: 'Выбери одно дело, в котором можно проявить инициативу. Начни с небольшого шага и оставь время на обратную связь.',
  Телец: 'Вернись к понятному ритму: сон, еда, движение и посильные дела. Проверь, хватает ли тебе простых опор.',
  Близнецы: 'Собери недостающие сведения и задай уточняющий вопрос. Важные договорённости полезно записать.',
  Рак: 'Оставь место для дома, близких и восстановления. Подумай, о какой поддержке ты можешь попросить прямо.',
  Лев: 'Выдели время для творчества или разговора, в котором важно быть услышанной. Вырази свою мысль без давления.',
  Дева: 'Раздели большую задачу на понятные части. Закрой один небольшой незавершённый вопрос.',
  Весы: 'Проверь, устраивают ли тебя договорённости. Обсуди ожидания и постарайся услышать другую сторону.',
  Скорпион: 'Назови чувство, которое требует внимания. Не торопи важный разговор, если сначала нужно разобраться в себе.',
  Стрелец: 'Посмотри на задачу шире и уточни, зачем она тебе нужна. Выбери направление, прежде чем добавлять новые обязательства.',
  Козерог: 'Определи приоритет и доступный срок. Оставь в плане запас, чтобы не превращать ответственность в перегрузку.',
  Водолей: 'Рассмотри непривычный вариант решения. Сверь его со своими потребностями, прежде чем следовать чужому совету.',
  Рыбы: 'Предусмотри паузы и спокойное занятие. Запиши мысль, к которой хочется вернуться без спешки.',
};

const shortDate = (day) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00Z`));

// Weekly reading is derived from all seven calculated days. No random favourable-day scores
// or fabricated model output; each recommendation names the actual lunar sign behind it.
export function weeklyForecast(day, { userId = null, profile = null, generalDays = null } = {}) {
  const dates = weekDates(day);
  const days = dates.map((date, i) => calculatedDay(date, { userId, profile, general: generalDays?.[i] }));
  const periods = [];
  for (const forecast of days) {
    const sky = forecast.astronomy.transit ?? forecast.astronomy;
    const last = periods.at(-1);
    if (last?.sign === sky.moon.sign) last.end = forecast.date;
    else periods.push({ start: forecast.date, end: forecast.date, sign: sky.moon.sign, theme: forecast.reading.theme });
  }
  const frequencies = new Map();
  for (const f of days) frequencies.set(f.reading.theme, (frequencies.get(f.reading.theme) ?? 0) + 1);
  const dominant = [...frequencies].sort((a, b) => b[1] - a[1])[0][0];
  const personal = days[0].scope === 'personal';
  const recommendations = periods.map((p) => ({
    ...p, label: p.start === p.end ? shortDate(p.start) : `${shortDate(p.start)} — ${shortDate(p.end)}`,
    text: GUIDANCE[p.sign],
  }));
  const personalThemes = personal ? [...new Set(days.map(f => f.reading.focus))].slice(0, 3) : [];
  return {
    weekStart: dates[0], weekEnd: dates[6], scope: personal ? 'personal' : 'general',
    updatedFor: `${dates[0]}T00:00:00+03:00`, timeZone: 'Europe/Moscow', days,
    generation: { kind: 'rules', basis: 'seven-daily-calculations' },
    reading: {
      title: dominant.charAt(0).toUpperCase() + dominant.slice(1),
      body: `На этой неделе Луна на полдень проходит знаки: ${periods.map(p => p.sign).join(' → ')}. Основная тема по лунным положениям — ${dominant}. Распредели дела по силам: рекомендации ниже можно использовать как вопросы к своему плану, а не как обещание событий.`,
      personalNote: personal ? `В дневных расчётах учтены твои данные рождения. Среди личных тем недели: ${personalThemes.join('; ')}. Выбери день в календаре, чтобы прочитать его разбор.` : 'Это общий разбор. С данными рождения дневные прогнозы внутри недели учитывают твою карту.',
      recommendations,
      question: 'Что на этой неделе для меня главное, а что можно отложить?',
    },
  };
}
