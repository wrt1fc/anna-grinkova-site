import { createHash } from 'node:crypto';
import { EclipticGeoMoon, MoonPhase, SunPosition } from 'astronomy-engine';
import { dailySkyEvents } from './astro-personal.js';

const SIGNS = [
  ['Овен', 'Овне', 'Инициатива полезна, если выбрать один ясный шаг.'],
  ['Телец', 'Тельце', 'Полезно опереться на привычный ритм и конкретные дела.'],
  ['Близнецы', 'Близнецах', 'Разговор и новый взгляд помогут прояснить детали.'],
  ['Рак', 'Раке', 'Обратите внимание на потребность в заботе и спокойствии.'],
  ['Лев', 'Льве', 'Выразите важную мысль открыто и без лишнего нажима.'],
  ['Дева', 'Деве', 'Небольшой порядок в делах освободит внимание.'],
  ['Весы', 'Весах', 'Ищите равновесие между своими желаниями и договорённостями.'],
  ['Скорпион', 'Скорпионе', 'Назовите чувство, которое просит внимания.'],
  ['Стрелец', 'Стрельце', 'Полезно увидеть более широкую картину происходящего.'],
  ['Козерог', 'Козероге', 'Сосредоточьтесь на одном выполнимом обязательстве.'],
  ['Водолей', 'Водолее', 'Оставьте место необычному решению и собственному взгляду.'],
  ['Рыбы', 'Рыбах', 'Дайте себе паузу, чтобы услышать тихую, но важную мысль.'],
];

const CARDS = [
  ['Шут', 'новое начинается с первого шага', 'Попробуйте небольшой новый маршрут.', 'Что я готова начать без гарантии идеального результата?'],
  ['Маг', 'ваши инструменты уже рядом', 'Выберите один доступный ресурс и примените его.', 'Что я могу сделать своими силами сегодня?'],
  ['Жрица', 'пауза помогает расслышать себя', 'Оставьте десять минут для тишины.', 'Какой ответ уже есть внутри меня?'],
  ['Императрица', 'забота поддерживает рост', 'Позаботьтесь о том, что давно требует внимания.', 'Что расцветёт, если я дам этому время?'],
  ['Император', 'ясные границы придают опору', 'Назовите одно правило, которое поможет вам.', 'Где мне нужна более ясная граница?'],
  ['Иерофант', 'опыт можно превратить в опору', 'Спросите совета у человека, которому доверяете.', 'Какой опыт стоит взять с собой?'],
  ['Влюблённые', 'выбор становится легче при честности с собой', 'Запишите, что для вас важно в решении.', 'Какой выбор совпадает с моими ценностями?'],
  ['Колесница', 'направление важнее скорости', 'Определите ближайшую конкретную цель.', 'Куда я направляю свои усилия?'],
  ['Сила', 'мягкость может быть проявлением силы', 'Начните сложный разговор спокойным тоном.', 'Где я могу быть мягкой и твёрдой одновременно?'],
  ['Отшельник', 'тишина проясняет главное', 'Уберите одно отвлечение на время.', 'Что становится яснее в тишине?'],
  ['Колесо Фортуны', 'перемены открывают варианты', 'Отметьте одну возможность в изменившемся плане.', 'Что нового предлагает мне этот поворот?'],
  ['Справедливость', 'факты помогают принять решение', 'Проверьте обстоятельства перед выводом.', 'На какие факты я могу опереться?'],
  ['Повешенный', 'другой угол зрения меняет картину', 'Отложите поспешный ответ и взгляните заново.', 'Что я увижу, если сделаю паузу?'],
  ['Смерть', 'завершение освобождает место', 'Закройте одно небольшое незавершённое дело.', 'Что пора оставить позади?'],
  ['Умеренность', 'устойчивость рождается из меры', 'Сделайте один шаг без спешки.', 'Где сегодня полезна умеренность?'],
  ['Дьявол', 'привычку можно заметить и пересмотреть', 'Отследите автоматическую реакцию.', 'Какой выбор я могу сделать осознанно?'],
  ['Башня', 'неожиданность помогает увидеть правду', 'Отделите реальные факты от первого впечатления.', 'Что остаётся важным после перемены?'],
  ['Звезда', 'надежда поддерживает путь', 'Запишите маленькую цель на ближайшее время.', 'Что возвращает мне надежду?'],
  ['Луна', 'неясность просит бережного внимания', 'Не торопитесь с выводом при нехватке сведений.', 'Что я знаю точно, а что пока предполагаю?'],
  ['Солнце', 'радостью можно поделиться', 'Заметьте удачный момент и расскажите о нём.', 'Что даёт мне ощущение ясности?'],
  ['Суд', 'прошлый опыт помогает выбрать дальше', 'Вспомните, чему научила похожая ситуация.', 'Какой урок я готова применить?'],
  ['Мир', 'результат заслуживает признания', 'Отметьте завершённое дело.', 'Что я уже довела до конца?'],
];

export function tarotForDate(day, userId = null) {
  const key = userId == null ? `anna-day:${day}` : `anna-personal:${userId}:${day}`;
  const number = createHash('sha256').update(key).digest().readUInt32BE(0) % CARDS.length;
  const [name, focus, action, question] = CARDS[number];
  return { number, name, focus, action, question, method: 'digital-deterministic' };
}

function signFor(longitude) {
  const [name, place, guidance] = SIGNS[Math.floor(longitude / 30)];
  return { name, place, guidance };
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
  };
}

export function forecastForDate(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || new Date(`${day}T09:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('invalid_forecast_date');
  const instant = new Date(`${day}T09:00:00Z`);
  const positions = planetPositionsAt(instant);
  const skyEvents = dailySkyEvents(day);
  const sun = signFor(positions.sun.longitude);
  const moon = signFor(positions.moon.longitude);
  const phase = positions.moonPhase;
  const card = tarotForDate(day);
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
      moonIngresses: skyEvents.moonIngresses,
      exactAspects: skyEvents.exactAspects,
    },
    tarot: { number: cardIndex, name, focus, method: card.method },
    generation: { kind: 'rules' },
    reading: {
      title: `${name}: тема дня`,
      body: `На 12:00 МСК Солнце в ${sun.place}, Луна в ${moon.place}; фаза — ${phase}. ${moon.guidance} Карта «${name}» напоминает: ${focus}.`,
      focus: `Луна в ${moon.place}`, action, question,
    },
  };
}
