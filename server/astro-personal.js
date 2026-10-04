import { Body, Ecliptic, EclipticGeoMoon, GeoVector, MoonPhase, SunPosition } from 'astronomy-engine';

const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
const BODIES = { mercury: Body.Mercury, venus: Body.Venus, mars: Body.Mars, jupiter: Body.Jupiter,
  saturn: Body.Saturn, uranus: Body.Uranus, neptune: Body.Neptune, pluto: Body.Pluto };
const ASPECTS = [['conjunction', 0], ['sextile', 60], ['square', 90], ['trine', 120], ['opposition', 180]];

function normal(angle) { return ((angle % 360) + 360) % 360; }
function signed(angle) { return normal(angle + 180) - 180; }
function sign(longitude) { return SIGNS[Math.floor(normal(longitude) / 30)]; }
function entry(longitude) { return { longitude: Number(normal(longitude).toFixed(3)), sign: sign(longitude) }; }

export function chartAt(instant) {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw new Error('invalid_instant');
  const chart = { sun: entry(SunPosition(instant).elon), moon: entry(EclipticGeoMoon(instant).lon) };
  for (const [name, body] of Object.entries(BODIES)) chart[name] = entry(Ecliptic(GeoVector(body, instant, true)).elon);
  chart.moonPhaseDegrees = Number(MoonPhase(instant).toFixed(3));
  return chart;
}

export function dailySkyEvents(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('invalid_day');
  const startMs = Date.parse(`${day}T00:00:00+03:00`);
  if (!Number.isFinite(startMs) || new Date(startMs + 3 * 3600000).toISOString().slice(0, 10) !== day) throw new Error('invalid_day');
  const endMs = startMs + 24 * 3600000;
  const moonAt = (ms) => EclipticGeoMoon(new Date(ms)).lon;
  const moonSignAt = (ms) => Math.floor(normal(moonAt(ms)) / 30);
  const moonIngresses = [];
  let previous = startMs;
  for (let next = startMs + 3600000; next <= endMs; next += 3600000) {
    if (moonSignAt(previous) !== moonSignAt(next)) {
      let left = previous, right = next;
      const fromIndex = moonSignAt(left);
      while (right - left > 1000) {
        const middle = Math.floor((left + right) / 2);
        if (moonSignAt(middle) === fromIndex) left = middle; else right = middle;
      }
      if (right < endMs) moonIngresses.push({ at: new Date(right).toISOString(), from: SIGNS[fromIndex], to: SIGNS[moonSignAt(right)] });
    }
    previous = next;
  }
  const exactAspects = [];
  const pairs = [['moon', 'sun'], ['moon', 'mercury'], ['moon', 'venus'], ['moon', 'mars'],
    ['moon', 'jupiter'], ['moon', 'saturn'], ['sun', 'mars'], ['sun', 'jupiter'], ['sun', 'saturn']];
  const targets = [['conjunction', 0], ['sextile', 60], ['square', 90], ['trine', 120], ['opposition', 180],
    ['trine', 240], ['square', 270], ['sextile', 300]];
  const cache = new Map();
  const positionsAt = (ms) => {
    if (!cache.has(ms)) cache.set(ms, chartAt(new Date(ms)));
    return cache.get(ms);
  };
  for (const [first, second] of pairs) {
    for (const [aspect, target] of targets) {
      const distance = (ms) => signed(positionsAt(ms)[first].longitude - positionsAt(ms)[second].longitude - target);
      let previousMs = startMs, previousDistance = distance(previousMs);
      for (let nextMs = startMs + 30 * 60000; nextMs <= endMs; nextMs += 30 * 60000) {
        const nextDistance = distance(nextMs);
        if (previousDistance * nextDistance <= 0 && Math.abs(previousDistance - nextDistance) < 10) {
          let left = previousMs, right = nextMs;
          const leftSign = Math.sign(previousDistance);
          while (right - left > 1000) {
            const middle = Math.floor((left + right) / 2);
            if (Math.sign(distance(middle)) === leftSign) left = middle; else right = middle;
          }
          if (right < endMs && !exactAspects.some((item) => item.first === first && item.second === second
            && item.aspect === aspect && Math.abs(Date.parse(item.at) - right) < 60000)) {
            exactAspects.push({ at: new Date(right).toISOString(), first, second, aspect });
          }
        }
        previousMs = nextMs;
        previousDistance = nextDistance;
      }
    }
  }
  exactAspects.sort((a, b) => a.at.localeCompare(b.at));
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), moonIngresses, exactAspects };
}

export function natalTransitAspects(natal, transit, maxOrb = 3) {
  const aspects = [];
  for (const [moving, current] of Object.entries(transit)) {
    if (!current || typeof current.longitude !== 'number') continue;
    for (const [birth, original] of Object.entries(natal)) {
      if (!original || typeof original.longitude !== 'number') continue;
      const difference = Math.abs(current.longitude - original.longitude);
      const separation = Math.min(difference, 360 - difference);
      for (const [aspect, angle] of ASPECTS) {
        const orb = Math.abs(separation - angle);
        if (orb <= maxOrb) aspects.push({ transit: moving, natal: birth, aspect,
          orb: Number(orb.toFixed(3)), angle });
      }
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb || a.transit.localeCompare(b.transit) || a.natal.localeCompare(b.natal));
}
