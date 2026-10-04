import { chartAt, natalTransitAspects } from './astro-personal.js';
import { forecastForDate, tarotForDate } from './daily-forecast.js';

const PLANETS = { sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс',
  jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон' };
const ASPECTS = { conjunction: 'соединение', sextile: 'секстиль', square: 'квадрат',
  trine: 'трин', opposition: 'оппозиция' };

export function personalForecastForDate(day, profile, userId, generalForecast = null) {
  if (!profile?.birthUtc || !Number.isFinite(profile.birthLatitude) || !Number.isFinite(profile.birthLongitude)) {
    throw new Error('unresolved_birth_profile');
  }
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('invalid_user');
  const general = generalForecast || forecastForDate(day);
  if (general.date !== day || general.scope !== 'general') throw new Error('invalid_general_forecast');
  const natal = chartAt(new Date(profile.birthUtc));
  const transit = chartAt(new Date(`${day}T09:00:00Z`));
  const { moonIngresses, exactAspects } = general.astronomy;
  const transitAspects = natalTransitAspects(natal, transit).filter((item) =>
    ['sun', 'moon', 'mercury', 'venus', 'mars'].includes(item.transit)).slice(0, 8);
  const card = tarotForDate(day, userId);
  const mainAspect = transitAspects[0];
  const aspectFact = mainAspect ? `В вашей карте рождения: текущая планета ${PLANETS[mainAspect.transit]}, натальная ${PLANETS[mainAspect.natal]}, аспект — ${ASPECTS[mainAspect.aspect]} (орб ${mainAspect.orb.toFixed(1)}°).`
    : 'В выбранном диапазоне точности основных дневных аспектов к вашей карте не найдено.';
  const moonChange = moonIngresses[0] ? `Луна перейдёт из знака ${moonIngresses[0].from} в ${moonIngresses[0].to} в ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(moonIngresses[0].at))} МСК.` : '';
  const exact = exactAspects[0];
  const exactFact = exact ? `В ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(exact.at))} МСК точный аспект: ${PLANETS[exact.first]} и ${PLANETS[exact.second]} — ${ASPECTS[exact.aspect]}.` : '';
  return {
    date: day, scope: 'personal', calculatedFor: general.calculatedFor,
    astronomy: { source: 'Astronomy Engine 2.1.19', zodiac: 'tropical', frame: 'geocentric',
      natal, transit, transitAspects, moonIngresses, exactAspects, moonPhase: general.astronomy.moonPhase },
    tarot: { number: card.number, name: card.name, focus: card.focus, method: card.method },
    generation: { kind: 'rules' },
    reading: {
      title: `${card.name}: ваш фокус дня`,
      body: `На 12:00 МСК Солнце в знаке ${transit.sun.sign}, Луна в знаке ${transit.moon.sign}; фаза — ${general.astronomy.moonPhase}. ${aspectFact} ${moonChange ? `${moonChange} ` : ''}${exactFact ? `${exactFact} ` : ''}Это повод присмотреться к своему ритму и решениям сегодня. Карта «${card.name}» предлагает тему: ${card.focus}.`,
      focus: mainAspect ? `${PLANETS[mainAspect.transit]} — ${PLANETS[mainAspect.natal]}` : `Луна в знаке ${transit.moon.sign}`,
      action: card.action, question: card.question,
    },
  };
}
