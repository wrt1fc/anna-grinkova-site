import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSotisVerifier } from '../server/sotis.js';

test('Sotis verifier reads Sun and Moon from a public chart response', async () => {
  let requested;
  const verifier = createSotisVerifier({ fetchImpl: async (url) => {
    requested = url;
    return { ok: true, async json() { return { cont: `
      <tr data-t='#PLANET-0-0'><th>n</th><td>10&deg;10&prime;28&Prime;</td><td>&#65;</td></tr>
      <tr data-t='#PLANET-0-1'><th>o</th><td>7&deg;45&prime;1&Prime;</td><td>&#62;</td></tr>` }; } };
  } });
  const result = await verifier.verify('2026-10-03', { sun: 190.174, moon: 97.749 });
  assert.match(requested, /sotis-online\.ru\/get\.php/);
  assert.match(requested, /20261003120000/);
  assert.ok(Math.abs(result.sun - 190.1744) < 0.01);
  assert.ok(Math.abs(result.moon - 97.7503) < 0.01);
});

test('Sotis verifier rejects missing or inconsistent positions', async () => {
  const verifier = createSotisVerifier({ fetchImpl: async () => ({ ok: true, async json() { return { cont: '' }; } }) });
  await assert.rejects(verifier.verify('2026-10-03', { sun: 190, moon: 97 }));
  const mismatch = createSotisVerifier({ fetchImpl: async () => ({ ok: true, async json() { return { cont: `
    <tr data-t='#PLANET-0-0'><td>10&deg;10&prime;28&Prime;</td><td>&#65;</td></tr>
    <tr data-t='#PLANET-0-1'><td>7&deg;45&prime;1&Prime;</td><td>&#62;</td></tr>` }; } }) });
  await assert.rejects(mismatch.verify('2026-10-03', { sun: 100, moon: 97 }));
});
