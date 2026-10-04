import catalog from '../config/cities.json' with { type: 'json' };

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
}

const indexed = catalog.map((city) => ({ city, names: [city.name, ...city.aliases].map(normalize) }));
const byId = new Map(catalog.map((city) => [city.id, city]));

function publicCity(city) {
  return { id: city.id, name: city.name, aliases: city.aliases, country: city.country,
    regionCode: city.regionCode, latitude: city.latitude, longitude: city.longitude,
    timeZone: city.timeZone };
}

export function getCityById(id) {
  const city = Number.isSafeInteger(Number(id)) ? byId.get(Number(id)) : null;
  return city ? publicCity(city) : null;
}

export function searchCities(query, limit = 10) {
  if (typeof query !== 'string' || query.length > 60 || !/^[\p{L}\p{M}\s'.-]+$/u.test(query)) return [];
  const needle = normalize(query);
  if (needle.length < 2 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) return [];
  return indexed.flatMap(({ city, names }) => {
    const score = names.some((name) => name === needle) ? 0
      : names.some((name) => name.startsWith(needle)) ? 1 : Infinity;
    return Number.isFinite(score) ? [{ city, score }] : [];
  }).sort((a, b) => a.score - b.score || b.city.population - a.city.population || a.city.name.localeCompare(b.city.name))
    .slice(0, limit).map(({ city }) => publicCity(city));
}
