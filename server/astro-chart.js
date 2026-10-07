// Natal chart the way professional programs show it (Sotis, Chronos): planets with retrograde flags,
// lunar nodes, Lilith, Placidus houses, natal aspects, transits and solar-arc / symbolic directions.
// Everything is calculated locally; the chat receives only the compact result.
import { SiderealTime, e_tilt, MakeTime } from 'astronomy-engine';
import { chartAt } from './astro-personal.js';

export const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
export const POINT_NAMES = { sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс', jupiter: 'Юпитер',
  saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон', node: 'Северный узел', lilith: 'Лилит',
  asc: 'Асцендент', mc: 'MC' };
export const ASPECT_NAMES = { conjunction: 'соединение', sextile: 'секстиль', square: 'квадрат', trine: 'трин', opposition: 'оппозиция' };
const ASPECTS = [['conjunction', 0], ['sextile', 60], ['square', 90], ['trine', 120], ['opposition', 180]];
const PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
// Natal orbs by the faster point of a pair; luminaries get the widest orb, as in most Russian schools.
const NATAL_ORB = { sun: 9, moon: 9, mercury: 7, venus: 7, mars: 7, jupiter: 6, saturn: 6, uranus: 5, neptune: 5, pluto: 5,
  node: 3, lilith: 2, asc: 5, mc: 5 };
const DIRECTION_ORB = 1;
const RAD = Math.PI / 180;
const YEAR_DAYS = 365.2422;

const normal = (angle) => ((angle % 360) + 360) % 360;
const separation = (a, b) => { const d = Math.abs(normal(a) - normal(b)); return Math.min(d, 360 - d); };

export function position(longitude) {
  const lon = normal(longitude);
  const inSign = lon % 30;
  const degree = Math.floor(inSign);
  const minute = Math.floor((inSign - degree) * 60);
  return { longitude: Number(lon.toFixed(4)), sign: SIGNS[Math.floor(lon / 30)], degree, minute };
}

// Mean lunar node with Meeus' main periodic terms (true node within ~0.05°) and mean Lilith (lunar apogee).
function lunarPoints(instant) {
  const T = MakeTime(instant).tt / 36525;
  const D = (297.8501921 + 445267.1114034 * T) * RAD;
  const M = (357.5291092 + 35999.0502909 * T) * RAD;
  const Mp = (134.9633964 + 477198.8675055 * T) * RAD;
  const F = (93.272095 + 483202.0175233 * T) * RAD;
  const meanNode = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T;
  const node = meanNode - 1.4979 * Math.sin(2 * (D - F)) - 0.15 * Math.sin(M) - 0.1226 * Math.sin(2 * D)
    + 0.1176 * Math.sin(2 * F) - 0.0801 * Math.sin(2 * (F - Mp));
  const perigee = 83.3532465 + 4069.0137287 * T - 0.01032 * T * T;
  return { node: normal(node), lilith: normal(perigee + 180) };
}

function longitudes(instant) {
  const chart = chartAt(instant);
  const result = Object.fromEntries(PLANETS.map((name) => [name, chart[name].longitude]));
  return { ...result, ...lunarPoints(instant) };
}

// Placidus cusps. RAMC from apparent sidereal time; cusps 11, 12, 2, 3 by iterating on the cusp's own declination.
export function placidusHouses(instant, latitude, longitude) {
  if (!Number.isFinite(latitude) || Math.abs(latitude) >= 66) throw new Error('houses_unavailable_latitude');
  const time = MakeTime(instant);
  const eps = e_tilt(time).tobl * RAD;
  const ramc = normal(SiderealTime(time) * 15 + longitude);
  const phi = latitude * RAD;
  const lonFromRa = (ra) => normal(Math.atan2(Math.sin(ra * RAD), Math.cos(ra * RAD) * Math.cos(eps)) / RAD);
  const mc = lonFromRa(ramc);
  const r = ramc * RAD;
  const asc = normal(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / RAD);
  const semiArc = (lon) => {
    const declination = Math.asin(Math.sin(eps) * Math.sin(lon * RAD));
    return Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(declination)))) / RAD;
  };
  // fraction of the diurnal (above) or nocturnal (below) semi-arc from the meridian
  const cusp = (fraction, above) => {
    // start from equal division: 11th/12th at RAMC+30/60°, 2nd/3rd at RAMC+120/150°
    let lon = lonFromRa(above ? ramc + 90 * fraction : ramc + 180 - 90 * fraction);
    for (let i = 0; i < 50; i++) {
      const dsa = semiArc(lon);
      const ra = above ? ramc + fraction * dsa : ramc + 180 - fraction * (180 - dsa);
      const next = lonFromRa(ra);
      if (separation(next, lon) < 1e-7) { lon = next; break; }
      lon = next;
    }
    return lon;
  };
  const c11 = cusp(1 / 3, true), c12 = cusp(2 / 3, true), c2 = cusp(2 / 3, false), c3 = cusp(1 / 3, false);
  const cusps = [asc, c2, c3, normal(mc + 180), normal(c11 + 180), normal(c12 + 180),
    normal(asc + 180), normal(c2 + 180), normal(c3 + 180), mc, c11, c12];
  return { system: 'placidus', asc, mc, cusps };
}

export function houseOf(longitude, cusps) {
  const lon = normal(longitude);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i], end = cusps[(i + 1) % 12];
    const width = normal(end - start);
    if (normal(lon - start) < width) return i + 1;
  }
  return 12;
}

function aspectBetween(a, b, orbLimit) {
  const distance = separation(a, b);
  for (const [name, angle] of ASPECTS) {
    const orb = Math.abs(distance - angle);
    if (orb <= orbLimit) return { aspect: name, orb: Number(orb.toFixed(2)) };
  }
  return null;
}

export function natalAspects(points) {
  const names = Object.keys(points);
  const result = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [first, second] = [names[i], names[j]];
      if ((first === 'asc' && second === 'mc') || (first === 'node' && second === 'lilith')) continue;
      const found = aspectBetween(points[first], points[second], Math.min(NATAL_ORB[first], NATAL_ORB[second]));
      if (found) result.push({ first, second, ...found });
    }
  }
  return result.sort((a, b) => a.orb - b.orb);
}

function isRetrograde(name, instant) {
  if (['sun', 'moon', 'lilith'].includes(name)) return false;
  if (name === 'node') return true;
  const step = 6 * 3600000;
  const before = longitudes(new Date(instant.getTime() - step))[name];
  const after = longitudes(new Date(instant.getTime() + step))[name];
  return normal(after - before + 180) - 180 < 0;
}

// Full natal chart. Houses need a known birth time; without it the chart has planets and aspects only.
export function natalChart({ birthUtc, latitude, longitude, timeKnown = true }) {
  const instant = new Date(birthUtc);
  if (!Number.isFinite(instant.getTime())) throw new Error('invalid_birth_instant');
  const lons = longitudes(instant);
  const houses = timeKnown && Number.isFinite(latitude) && Number.isFinite(longitude) ? placidusHouses(instant, latitude, longitude) : null;
  const points = { ...lons, ...(houses ? { asc: houses.asc, mc: houses.mc } : {}) };
  const planets = Object.fromEntries(Object.entries(lons).map(([name, lon]) => [name, {
    ...position(lon), retrograde: isRetrograde(name, instant), ...(houses ? { house: houseOf(lon, houses.cusps) } : {}),
  }]));
  return {
    birthUtc: instant.toISOString(), zodiac: 'tropical', houseSystem: houses ? 'placidus' : null,
    planets,
    angles: houses ? { asc: position(houses.asc), mc: position(houses.mc) } : null,
    cusps: houses ? houses.cusps.map((lon, index) => ({ house: index + 1, ...position(lon) })) : null,
    aspects: natalAspects(points),
    points,
  };
}

// Transiting planets to natal points on a given instant (slow planets matter most for a period forecast).
export function transitsToNatal(natal, instant, orb = 2) {
  const now = longitudes(instant);
  const result = [];
  for (const moving of PLANETS) {
    for (const [target, lon] of Object.entries(natal.points)) {
      const found = aspectBetween(now[moving], lon, orb);
      if (found) result.push({ transit: moving, natal: target, ...found, transitPosition: position(now[moving]) });
    }
  }
  return result.sort((a, b) => a.orb - b.orb);
}

function ageYears(natal, instant) { return (instant.getTime() - Date.parse(natal.birthUtc)) / (YEAR_DAYS * 86400000); }

// Directions: every natal point is moved by one arc. Solar arc = secondary-progressed Sun minus natal Sun
// (a day after birth for each year of life); symbolic = 1° per year. Hits within 1° of a natal point are active.
export function directions(natal, instant, method = 'solar-arc') {
  const age = ageYears(natal, instant);
  if (age < 0) throw new Error('instant_before_birth');
  const arc = method === 'symbolic' ? age
    : normal(longitudes(new Date(Date.parse(natal.birthUtc) + age * 86400000)).sun - natal.points.sun);
  const result = [];
  for (const [moving, lon] of Object.entries(natal.points)) {
    if (moving === 'lilith') continue;
    const directed = lon + arc;
    for (const [target, natalLon] of Object.entries(natal.points)) {
      if (target === moving || target === 'lilith') continue;
      const found = aspectBetween(directed, natalLon, DIRECTION_ORB);
      if (found) result.push({ directed: moving, natal: target, ...found });
    }
  }
  return { method, ageYears: Number(age.toFixed(2)), arc: Number(arc.toFixed(3)), hits: result.sort((a, b) => a.orb - b.orb) };
}

const fmt = (p) => `${p.degree}°${String(p.minute).padStart(2, '0')}′ ${p.sign}`;

// Short Russian summary for the chat prompt: only what the model needs to explain, no birth data or email.
export function chartForPrompt(natal, instant = new Date(), { include = ['natal'] } = {}) {
  const out = {
    houseSystem: natal.houseSystem ? 'Плацидус' : 'время рождения неизвестно — дома и асцендент не рассчитаны',
    planets: Object.entries(natal.planets).map(([name, p]) =>
      `${POINT_NAMES[name]} ${fmt(p)}${p.house ? `, ${p.house} дом` : ''}${p.retrograde && name !== 'node' ? ', ретроградный' : ''}`),
  };
  if (natal.angles) out.angles = [`Асцендент ${fmt(natal.angles.asc)}`, `MC ${fmt(natal.angles.mc)}`];
  out.aspects = natal.aspects.slice(0, 12).map((a) => `${POINT_NAMES[a.first]} — ${POINT_NAMES[a.second]}: ${ASPECT_NAMES[a.aspect]} (орб ${a.orb}°)`);
  if (include.includes('transits')) {
    out.transits = transitsToNatal(natal, instant).filter((t) => !['moon', 'sun', 'mercury', 'venus'].includes(t.transit)).slice(0, 8)
      .map((t) => `${POINT_NAMES[t.transit]} (транзит) — натальный ${POINT_NAMES[t.natal]}: ${ASPECT_NAMES[t.aspect]} (орб ${t.orb}°)`);
  }
  if (include.includes('directions')) {
    const solar = directions(natal, instant, 'solar-arc');
    // The arc itself is left out: it is about one degree per year of life and would reveal the age.
    out.directions = { method: 'солнечная дуга', hits: solar.hits.slice(0, 8)
      .map((d) => `дирекционный ${POINT_NAMES[d.directed]} — натальный ${POINT_NAMES[d.natal]}: ${ASPECT_NAMES[d.aspect]} (орб ${d.orb}°)`) };
  }
  return out;
}

const CHART_TOPIC = /натал|карт[аеуы] рождени|гороскоп|асцендент|\bасц|\bmc\b|середин[аеу] неба|дом[аеу]?\b|\d+\s*дом|куспид|аспект|ретроград|транзит|дирекци|прогресси|солнечн(ая|ой) дуг|узл|лилит|(солнц|лун|меркури|венер|марс|юпитер|сатурн|уран|нептун|плутон)\S* в /i;
export function asksAboutChart(message) { return CHART_TOPIC.test(message); }
export function chartSectionsFor(message) {
  const include = ['natal'];
  if (/транзит|сейчас|в этом году|период|ближайш/i.test(message)) include.push('transits');
  if (/дирекци|прогресси|дуг|в этом году|ближайш|год[ау]? жизни/i.test(message)) include.push('directions');
  return include;
}
