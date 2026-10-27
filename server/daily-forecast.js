import { createHash, createHmac } from 'node:crypto';
import { EclipticGeoMoon, MoonPhase, SunPosition } from 'astronomy-engine';
import { dailySkyEvents } from './astro-personal.js';

const SIGNS = [
  ['Овен', 'Овне', 'Инициатива полезна, если выбрать один ясный шаг.', 'энергия первого шага'],
  ['Телец', 'Тельце', 'Полезно опереться на привычный ритм и конкретные дела.', 'устойчивость и телесный комфорт'],
  ['Близнецы', 'Близнецах', 'Разговор и новый взгляд помогут прояснить детали.', 'разговоры и новая информация'],
  ['Рак', 'Раке', 'Обрати внимание на потребность в заботе и спокойствии.', 'потребность в заботе и безопасности'],
  ['Лев', 'Льве', 'Скажи важную мысль открыто и без лишнего нажима.', 'тепло, признание и творчество'],
  ['Дева', 'Деве', 'Небольшой порядок в делах освободит внимание.', 'порядок и польза'],
  ['Весы', 'Весах', 'Ищи равновесие между своими желаниями и договорённостями.', 'равновесие и отношения'],
  ['Скорпион', 'Скорпионе', 'Назови чувство, которое просит внимания.', 'глубокие чувства и правда'],
  ['Стрелец', 'Стрельце', 'Полезно увидеть более широкую картину происходящего.', 'широкий взгляд и смысл'],
  ['Козерог', 'Козероге', 'Сосредоточься на одном выполнимом обязательстве.', 'ответственность и цель'],
  ['Водолей', 'Водолее', 'Оставь место необычному решению и собственному взгляду.', 'свобода и свой взгляд'],
  ['Рыбы', 'Рыбах', 'Дай себе паузу, чтобы услышать тихую, но важную мысль.', 'тишина, воображение и отдых'],
];

const CARDS = [
  ['Маяк', 'у тебя есть ориентир, даже когда вокруг шумно', 'Назови одну ценность, по которой сегодня сверишь решения.', 'Что для меня сейчас ориентир?'],
  ['Мост', 'связь между двумя берегами важнее победы одной стороны', 'Сделай один шаг навстречу человеку или решению, которое давно откладываешь.', 'Что я могу соединить, а не выбирать одно из двух?'],
  ['Ключ', 'ответ может быть уже у тебя, нужна подходящая дверь', 'Определи, какая дверь тебе действительно нужна.', 'Что откроется, если я перестану подбирать чужие ключи?'],
  ['Корни', 'устойчивость растёт из того, что тебя питает', 'Вспомни, что поддерживает тебя давно, и вернись к этому.', 'Что даёт мне опору, когда всё меняется?'],
  ['Зеркало', 'в других мы часто видим то, что не замечаем в себе', 'Заметь, что в другом человеке тебя цепляет, и спроси себя, почему.', 'Что во мне откликается на эту реакцию?'],
  ['Компас', 'направление важнее скорости', 'Выбери направление на сегодня, не весь маршрут.', 'Куда я иду, если убрать чужие ожидания?'],
  ['Якорь', 'иногда важнее удержаться, чем плыть', 'Сделай первым то, что помогает тебе сохранять спокойствие.', 'Что меня стабилизирует?'],
  ['Дверь', 'переход требует решимости и места для нового', 'Назови вслух, что пора оставить за порогом.', 'Что мне сложно оставить позади?'],
  ['Нить', 'путь складывается из небольших связей', 'Напиши человеку, с которым давно потеряна связь.', 'Какая связь просит внимания?'],
  ['Лестница', 'рост идёт по ступеням', 'Определи следующую ступень, а не всю лестницу.', 'Что станет следующим небольшим шагом?'],
  ['Река', 'течение несёт, если не сопротивляться ему изо всех сил', 'Отпусти то, что пытаешься удержать силой.', 'Где я сопротивляюсь течению?'],
  ['Гора', 'большая цель складывается из тропы', 'Раздели цель на три участка и сделай первый.', 'Какая часть пути сегодня мне по силам?'],
  ['Семя', 'всему нужно время, чтобы прорасти', 'Посади маленькое начало и не требуй результата сегодня.', 'Что я могу начать и не торопить?'],
  ['Огонь', 'энергия просит выхода', 'Направь накопившуюся энергию в одно конкретное дело.', 'На что мне хочется потратить силы?'],
  ['Окно', 'взгляд со стороны освежает картину', 'Посмотри на ситуацию глазами друга или наблюдателя.', 'Что видно из другого окна?'],
  ['Колодец', 'глубина открывается тому, кто остановился', 'Выдели десять минут тишины и послушай себя.', 'Что говорит мой внутренний голос, когда никто не спрашивает?'],
  ['Лабиринт', 'запутанный путь можно пройти по одному повороту', 'Вернись к тому, что знаешь твёрдо, и двигайся от этого.', 'Что я знаю в этой ситуации твёрдо?'],
  ['Сад', 'забота помогает расти тому, что посажено', 'Позаботься о том, что давно требует внимания.', 'Что в моей жизни просит ухода?'],
  ['Дорога', 'перемены начинаются с первого шага', 'Сделай первый небольшой шаг в сторону желаемого.', 'Какой первый шаг я могу сделать сегодня?'],
  ['Свеча', 'малого света хватает, чтобы увидеть следующий шаг', 'Не жди полной ясности: определи только ближайший шаг.', 'Что мне уже видно?'],
  ['Часы', 'у каждого дела свой срок', 'Определи, что требует срочности, а что может подождать.', 'Что я пытаюсь ускорить?'],
  ['Дом', 'безопасное место нужно и внутри, и снаружи', 'Сделай что-нибудь, что создаёт у тебя ощущение дома.', 'Где мне спокойно?'],
];

export const CARD_NAMES = CARDS.map(([name]) => name);

// Five distinct cards laid out from one key; digest turns a text into bytes (a plain hash or a keyed one).
function spreadCard(key, position, digest) {
  if (!Number.isInteger(position) || position < 0 || position > 4) throw new Error('invalid_draw_position');
  const chosen = new Set();
  let number;
  for (let slot = 0; slot <= position; slot++) {
    number = digest(slot === 0 ? key : `${key}:draw:${slot}`).readUInt32BE(0) % CARDS.length;
    while (chosen.has(number)) number = (number + 1) % CARDS.length;
    chosen.add(number);
  }
  const [name, focus, action, question] = CARDS[number];
  return { number, name, focus, action, question, position, method: 'digital-deterministic' };
}

const sha256 = (text) => createHash('sha256').update(text).digest();

// Cards of the day: anyone may open all five on the day page, so a plain hash is enough.
export function tarotForDate(day, userId = null, position = 0) {
  return spreadCard(userId == null ? `anna-day:${day}` : `anna-personal:${userId}:${day}`, position, sha256);
}

// The server's own key for reading cards, derived from AUTH_CODE_SECRET so no extra setting is needed.
export function readingCardKey(codeSecret) {
  return createHmac('sha256', String(codeSecret)).update('anna-reading-cards').digest();
}

// Cards of a reading by request are laid out anew for every reading of the day (round = readings already given)
// with the server's secret key: the code is public, so without the key anyone could work out the cards from an account
// id, and the cards of the day would show them in advance. A card becomes known only together with its answer.
export function tarotForReading(key, { userId, day, round, position }) {
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(round) || round < 0) throw new Error('invalid_reading');
  return spreadCard(`anna-reading:${userId}:${day}:${round}`, position, (text) => createHmac('sha256', key).update(text).digest());
}

// One card of the deck by its number, for tooling that builds training examples without an account.
export function tarotCardByNumber(number, position = 0) {
  if (!Number.isInteger(number) || number < 0 || number >= CARDS.length) throw new Error('invalid_card_number');
  if (!Number.isInteger(position) || position < 0 || position > 4) throw new Error('invalid_draw_position');
  const [name, focus, action, question] = CARDS[number];
  return { number, name, focus, action, question, position, method: 'digital-deterministic' };
}

function signFor(longitude) {
  const [name, place, guidance, theme] = SIGNS[Math.floor(longitude / 30)];
  return { name, place, guidance, theme };
}

function phaseFor(angle) {
  if (angle < 10 || angle >= 350) return 'около новолуния';
  if (angle < 170) return 'растущая Луна';
  if (angle < 190) return 'около полнолуния';
  return 'убывающая Луна';
}

export function moscowDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function planetPositionsAt(instant) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) throw new Error('invalid_instant');
  const sunLongitude = SunPosition(instant).elon;
  const moonLongitude = EclipticGeoMoon(instant).lon;
  return {
    sun: { longitude: sunLongitude, sign: signFor(sunLongitude).name },
    moon: { longitude: moonLongitude, sign: signFor(moonLongitude).name },
    moonPhase: phaseFor(MoonPhase(instant)),
    moonAngle: MoonPhase(instant),
  };
}

// ownerId picks the signed-in account's own five cards; without it the shared set for guests is used.
export function forecastForDate(day, position = 0, ownerId = null) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || new Date(`${day}T09:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('invalid_forecast_date');
  const instant = new Date(`${day}T09:00:00Z`);
  const positions = planetPositionsAt(instant);
  const skyEvents = dailySkyEvents(day);
  const sun = signFor(positions.sun.longitude);
  const moon = signFor(positions.moon.longitude);
  const phase = positions.moonPhase;
  const card = tarotForDate(day, ownerId, position);
  const { number: cardIndex, name, focus, action, question } = card;
  return {
    date: day,
    scope: 'general',
    calculatedFor: `${day}T12:00:00+03:00`,
    astronomy: {
      source: 'Astronomy Engine 2.1.19',
      sun: { longitude: Number(positions.sun.longitude.toFixed(3)), sign: sun.name },
      moon: { longitude: Number(positions.moon.longitude.toFixed(3)), sign: moon.name },
      moonPhase: phase,
      moonAngle: Number(positions.moonAngle.toFixed(1)),
      moonIngresses: skyEvents.moonIngresses,
      exactAspects: skyEvents.exactAspects,
    },
    tarot: { number: cardIndex, name, focus, position, method: card.method },
    generation: { kind: 'rules' },
    reading: {
      title: `${name}: тема дня`,
      body: `На 12:00 МСК Солнце в ${sun.place}, Луна в ${moon.place}; фаза — ${phase}. ${moon.guidance} Карта «${name}» напоминает: ${focus}.`,
      focus: `Луна в ${moon.place}`, theme: moon.theme, action, question,
    },
  };
}
