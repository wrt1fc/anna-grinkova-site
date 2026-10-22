import { ASPECT_NAMES, POINT_NAMES, SIGNS, natalChart } from './astro-chart.js';
import { moneyForPrompt, moneyProfile } from './anna-method.js';
import texts from '../config/natal-texts.json' with { type: 'json' };

// Planets drawn on the wheel and listed in the table; the lunar node is kept, Lilith is left to the chat.
const WHEEL_POINTS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node'];
// Aspects shown: the tightest ones between planets and the angles, at most this many.
const MAX_ASPECTS = 10;
// Texts for the signs of these planets; the angles need a known birth time.
const SECTION_ORDER = [['sun', 'sun'], ['moon', 'moon'], ['asc', 'asc'], ['venus', 'venus'], ['mars', 'mars'], ['mc', 'mc']];

const signIndex = (sign) => SIGNS.indexOf(sign);

function pointOf(natal, key) {
  return key === 'asc' || key === 'mc' ? natal.angles?.[key] : natal.planets[key];
}

function section(natal, key) {
  const where = pointOf(natal, key);
  const entry = texts.sections[key];
  if (!where || !entry) return null;
  return { key, title: entry.title, lead: entry.lead, sign: where.sign, house: natal.planets[key]?.house ?? null,
    degree: where.degree, text: entry.signs[signIndex(where.sign)] };
}

// A public, anonymous reading of a calculated chart: nothing about the visitor is stored or sent to a model.
export function publicNatal({ birthUtc, latitude, longitude, timeKnown = true }) {
  const natal = natalChart({ birthUtc, latitude, longitude, timeKnown });
  const planets = WHEEL_POINTS.map((key) => {
    const planet = natal.planets[key];
    return { key, name: POINT_NAMES[key], sign: planet.sign, degree: planet.degree, minute: planet.minute, longitude: planet.longitude,
      house: planet.house ?? null, retrograde: key !== 'node' && planet.retrograde === true };
  });
  const shown = new Set([...WHEEL_POINTS, ...(natal.angles ? ['asc', 'mc'] : [])]);
  const aspects = natal.aspects.filter((item) => shown.has(item.first) && shown.has(item.second)).slice(0, MAX_ASPECTS)
    .map((item) => ({ first: item.first, second: item.second, firstName: POINT_NAMES[item.first], secondName: POINT_NAMES[item.second],
      type: item.aspect, typeName: ASPECT_NAMES[item.aspect], orb: item.orb, meaning: texts.aspects.kinds[item.aspect] }));
  const money = natal.houseSystem ? moneyForPrompt(moneyProfile(natal)) : null;
  return {
    timeKnown: Boolean(natal.houseSystem),
    planets,
    angles: natal.angles ? { asc: { sign: natal.angles.asc.sign, degree: natal.angles.asc.degree, minute: natal.angles.asc.minute, longitude: natal.angles.asc.longitude },
      mc: { sign: natal.angles.mc.sign, degree: natal.angles.mc.degree, minute: natal.angles.mc.minute, longitude: natal.angles.mc.longitude } } : null,
    cusps: natal.cusps ? natal.cusps.map((cusp) => cusp.longitude) : null,
    aspects,
    aspectsLead: texts.aspects.lead,
    sections: SECTION_ORDER.map(([, key]) => section(natal, key)).filter(Boolean),
    money: money ? { secondHouse: money.secondHouseCusp, rulers: money.rulers, mc: money.mc, elements: String(money.elements).replace(/\s*\(без сильных планет[^)]*\)/, ''), strategy: money.strategy } : null,
    note: texts.note,
  };
}
