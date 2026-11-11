import { chartAt, natalTransitAspects } from './astro-personal.js';
import { houseOf, placidusHouses } from './astro-chart.js';
import { forecastForDate, tarotForDate } from './daily-forecast.js';

const PLANETS = { sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс',
  jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон' };
const ASPECTS = { conjunction: 'соединение', sextile: 'секстиль', square: 'квадрат',
  trine: 'трин', opposition: 'оппозиция' };
const FAST = ['sun', 'moon', 'mercury', 'venus', 'mars'];
// Editorial reflection prompts, not a claimed Anna method or a prediction of events.
// The existing natal-texts.json is itself a draft; no unapproved quotation is presented as her teaching.
const TOPICS = {
  sun: ['личные приоритеты', 'Выдели одно дело, в котором важно твоё собственное решение.', 'Какой выбор сегодня действительно мой?'],
  moon: ['эмоции и привычный ритм', 'Оставь паузу между переживанием и ответом; назови свою потребность.', 'Какой поддержки мне сейчас не хватает?'],
  mercury: ['общение и ясность', 'Уточни одну важную деталь и запиши договорённость своими словами.', 'Что стоит переспросить, прежде чем делать вывод?'],
  venus: ['взаимность и ценности', 'Обсуди одно ожидание в отношениях, оставив другому человеку право на свой ответ.', 'Что для меня важно в этой договорённости?'],
  mars: ['инициатива и границы', 'Выбери посильный шаг и заранее обозначь, какие задачи сейчас не берёшь на себя.', 'Где стоит действовать, а где обозначить границу?'],
  jupiter: ['планы и обучение', 'Сверь большой замысел с доступным временем и выбери один вопрос для изучения.', 'Какой следующий шаг соответствует моей цели?'],
  saturn: ['обязательства и сроки', 'Пересмотри одно обязательство: уточни срок и объём, который можешь взять на себя.', 'Какую ответственность я могу нести без перегрузки?'],
  uranus: ['свобода и перемены', 'Попробуй другой способ в небольшом обратимом деле.', 'Что я хочу изменить и как проверить это небольшим шагом?'],
  neptune: ['воображение и ясность ожиданий', 'Отдели известные факты от надежд и запиши, что ещё нужно проверить.', 'На что я опираюсь: на факт или на предположение?'],
  pluto: ['контроль и личные границы', 'Раздели ситуацию на то, что зависит от тебя, и то, что требует чужого решения.', 'Где я могу ослабить контроль, сохранив свои границы?'],
};
const HOUSE_TOPICS = [null, 'собственный способ действовать', 'личные ресурсы и приоритеты', 'разговоры и повседневное обучение',
  'дом и семейные договорённости', 'творчество и личные увлечения', 'повседневные дела и нагрузка',
  'партнёрство и взаимные ожидания', 'общие ресурсы и границы ответственности', 'обучение и дальние планы',
  'работа и долгосрочные задачи', 'друзья и совместные проекты', 'уединение и незавершённые дела'];
const MODE = {
  conjunction: ['Здесь полезно увидеть связь между своими желаниями и повседневными решениями.', 'Свяжи это с одним конкретным делом.'],
  square: ['Если хочется успеть больше, чем позволяют силы, стоит пересмотреть объём, а не требовать от себя большего.', 'Перед действием проверь нагрузку и оставь запас времени.'],
  opposition: ['Если ожидания расходятся, сначала стоит понять обе стороны и только потом искать решение.', 'Сначала уточни ожидания обеих сторон.'],
  sextile: ['Вместо большого изменения можно проверить одну идею небольшим шагом.', 'Выбери небольшой опыт, результат которого можно проверить.'],
  trine: ['Здесь можно опереться на знакомый способ, сохранив внимание к тому, что изменилось.', 'Начни со знакомого способа, который уже подходит тебе.'],
};

export function personalForecastForDate(day, profile, userId, generalForecast = null, position = 0) {
  if (!profile?.birthUtc || !Number.isFinite(profile.birthLatitude) || Math.abs(profile.birthLatitude) > 90
    || !Number.isFinite(profile.birthLongitude) || Math.abs(profile.birthLongitude) > 180) throw new Error('unresolved_birth_profile');
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('invalid_user');
  const general = generalForecast || forecastForDate(day, position);
  if (general.date !== day || general.scope !== 'general') throw new Error('invalid_general_forecast');
  const birthInstant = new Date(profile.birthUtc);
  const natal = chartAt(birthInstant);
  const transit = chartAt(new Date(`${day}T09:00:00Z`));
  const timeKnown = Boolean(profile.birthTime) && profile.timeKnown !== false && profile.birthTimeKnown !== false
    && profile.timeUnknown !== true && profile.birthTimeUnknown !== true;
  let natalHouses = null;
  let housesUnavailable = timeKnown ? null : 'unknown_birth_time';
  if (timeKnown) {
    try { natalHouses = placidusHouses(birthInstant, profile.birthLatitude, profile.birthLongitude); }
    catch (error) {
      if (error.message !== 'houses_unavailable_latitude') throw error;
      housesUnavailable = error.message;
    }
  }
  const transitHouses = natalHouses ? Object.fromEntries(Object.entries(transit)
    .filter(([, point]) => Number.isFinite(point?.longitude))
    .map(([name, point]) => [name, houseOf(point.longitude, natalHouses.cusps)])) : null;
  const transitAspects = natalTransitAspects(natal, transit).filter(item => FAST.includes(item.transit)
    && (timeKnown || item.natal !== 'moon')).slice(0, 8);
  const seen = new Set();
  const selected = transitAspects.filter(item => {
    if (seen.has(item.natal)) return false;
    seen.add(item.natal); return true;
  }).slice(0, 3);
  const personalThemes = selected.map(basis => {
    const [topic, action, question] = TOPICS[basis.natal];
    const movingTopic = TOPICS[basis.transit][0];
    const house = transitHouses?.[basis.transit] ?? null;
    const area = house ? HOUSE_TOPICS[house] : null;
    const theme = `${topic}${area ? ` · ${area}` : ''}`;
    const fact = `${PLANETS[basis.transit]} — ${PLANETS[basis.natal]} в карте рождения: ${ASPECTS[basis.aspect]}, орб ${basis.orb.toFixed(1)}°${house ? `; текущая планета в ${house} доме твоей карты` : ''}.`;
    return { theme, basis, house, area, fact,
      text: `Фокус дня — ${topic}${area ? `. Присмотрись к сфере «${area}»` : ''}. ${MODE[basis.aspect][0]}${movingTopic !== topic ? ` Это связывает две темы: ${movingTopic}; ${topic}.` : ''}`,
      action: `${action} ${MODE[basis.aspect][1]}${area ? ` Примени это к сфере «${area}».` : ''}`,
      question: `${question}${area ? ` Как это связано со сферой «${area}»?` : ''}` };
  });
  const main = personalThemes[0];
  const houseFallback = transitHouses?.moon;
  const fallbackTheme = houseFallback ? HOUSE_TOPICS[houseFallback] : 'собственные приоритеты';
  const timeNote = !timeKnown ? 'Время рождения неизвестно: дома и аспекты к натальной Луне не используются; остальные положения рассчитаны на указанный ориентировочный момент.'
    : housesUnavailable ? 'На этой широте дома Плацидуса не рассчитываются; разбор опирается на аспекты планет.' : '';
  const reading = {
    title: main ? main.theme : fallbackTheme,
    body: `${main ? `${main.text} В основе разбора — ${PLANETS[main.basis.transit]} и ${PLANETS[main.basis.natal]} в карте рождения (${ASPECTS[main.basis.aspect]}).` : `Фокус дня — ${fallbackTheme}. В дневном наборе нет близких аспектов к карте рождения; выбери тему для наблюдения по своим обстоятельствам.`} ${timeNote ? `${timeNote} ` : ''}Расчёт на 12:00 МСК; это ориентир для размышления, а не обещание событий.`,
    focus: main ? `${PLANETS[main.basis.transit]} — ${PLANETS[main.basis.natal]}` : fallbackTheme,
    theme: main?.theme ?? fallbackTheme,
    action: main?.action ?? `Выбери один посильный шаг в сфере «${fallbackTheme}» и проверь, подходит ли он твоему сегодняшнему плану.`,
    question: main?.question ?? `Что в сфере «${fallbackTheme}» требует моего внимания сегодня?`,
  };
  const card = tarotForDate(day, userId, position);
  return {
    date: day, scope: 'personal', calculatedFor: general.calculatedFor,
    astronomy: { source: 'Astronomy Engine 2.1.19', zodiac: 'tropical', frame: 'geocentric',
      natal, transit, transitAspects, natalHouses, transitHouses, timeKnown, housesUnavailable,
      moonIngresses: general.astronomy.moonIngresses, exactAspects: general.astronomy.exactAspects,
      moonPhase: general.astronomy.moonPhase, moonAngle: general.astronomy.moonAngle },
    tarot: { number: card.number, name: card.name, focus: card.focus, position, method: card.method, action: card.action, question: card.question },
    generation: { kind: 'rules', basis: 'natal-transits-and-houses', interpretation: 'editorial-reflection-v1', annaMethodApproved: false },
    personalThemes, personalReading: reading, generalReading: general.reading, reading,
  };
}
