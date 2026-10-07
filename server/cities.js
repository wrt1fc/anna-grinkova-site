import catalog from '../config/cities.json' with { type: 'json' };

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
}

const latinKeys = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,./';
const russianKeys = 'йцукенгшщзхъфывапролджэячсмитьбю.';
const keyboardToRussian = new Map([...latinKeys].map((key, index) => [key, russianKeys[index]]));

function russianLayout(value) {
  return /^[a-z\s'.-]+$/u.test(value)
    ? [...value].map((character) => keyboardToRussian.get(character) || character).join('')
    : null;
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
  const alternate = russianLayout(needle);
  return indexed.flatMap(({ city, names }) => {
    const score = normalize(city.name) === needle ? 0
      : names.some((name) => name.startsWith(needle)) ? 1
        : alternate && names.some((name) => name.startsWith(alternate)) ? 2 : Infinity;
    return Number.isFinite(score) ? [{ city, score }] : [];
  }).sort((a, b) => a.score - b.score || b.city.population - a.city.population || a.city.name.localeCompare(b.city.name))
    .slice(0, limit).map(({ city }) => {
      const target = alternate || needle;
      const localized = city.country === 'RU'
        ? city.aliases.filter((alias) => /[А-Яа-яЁё]/u.test(alias) && normalize(alias).startsWith(target))
          .sort((a, b) => a.length - b.length)[0]
        : null;
      return { ...publicCity(city), displayName: localized || city.name };
    });
}
