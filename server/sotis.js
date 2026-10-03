const MOSCOW_CITY_ID = 2729045;

function longitudeFromRow(content, planetId) {
  const marker = `<tr data-t='#PLANET-0-${planetId}'>`;
  const start = content.indexOf(marker);
  if (start < 0) throw new Error('Sotis chart has no planet row');
  const end = content.indexOf('</tr>', start);
  if (end < 0) throw new Error('Sotis planet row is incomplete');
  const row = content.slice(start, end);
  const position = row.match(/(\d+)&deg;\s*(\d+)&prime;\s*(\d+)&Prime;/);
  const sign = row.match(/<td>\s*&#(\d+);\s*<\/td>/);
  if (!position || !sign) throw new Error('Sotis planet position is unreadable');
  const [, degree, minute, second] = position.map(Number);
  const signIndex = Number(sign[1]) - 59;
  if (signIndex < 0 || signIndex > 11 || degree >= 30 || minute >= 60 || second >= 60) {
    throw new Error('Sotis planet position is invalid');
  }
  return signIndex * 30 + degree + minute / 60 + second / 3600;
}

function angularDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

export function createSotisVerifier({ fetchImpl = fetch } = {}) {
  return {
    async verify(day, local) {
      if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid Sotis date');
      const url = new URL('https://sotis-online.ru/get.php');
      url.searchParams.set('chr', `dt:${day.replaceAll('-', '')}120000;sx:m;cid:${MOSCOW_CITY_ID};name:Daily chart`);
      url.searchParams.set('opt', '');
      url.searchParams.set('adm', '');
      url.searchParams.set('ajax', '1');
      const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`Sotis HTTP ${response.status}`);
      const data = await response.json();
      if (typeof data.cont !== 'string') throw new Error('Sotis returned no chart');
      const positions = { sun: longitudeFromRow(data.cont, 0), moon: longitudeFromRow(data.cont, 1) };
      if (angularDifference(positions.sun, local.sun) > 0.2 || angularDifference(positions.moon, local.moon) > 0.2) {
        throw new Error('Sotis positions disagree with local calculation');
      }
      return positions;
    },
  };
}
