import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';

test('the web app manifest, service worker and icons are served with the right types', async () => {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, codeSecret: 'test-secret-with-at-least-thirty-two-characters' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const manifest = await fetch(`${base}/manifest.webmanifest`);
    assert.match(manifest.headers.get('content-type'), /^application\/manifest\+json/);
    const data = await manifest.json();
    assert.equal(data.display, 'standalone');
    assert.ok(data.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'));
    for (const icon of data.icons) assert.equal((await fetch(`${base}/${icon.src}`)).headers.get('content-type'), 'image/png');
    const worker = await fetch(`${base}/sw.js`);
    assert.match(worker.headers.get('content-type'), /javascript/);
    assert.equal(worker.headers.get('cache-control'), 'no-cache');
    // The worker must leave the API alone: auth, chat streaming and payments are never cached.
    assert.match(await worker.text(), /pathname\.startsWith\('\/api\/'\)\) return/);
    const page = await fetch(base);
    const csp = page.headers.get('content-security-policy');
    assert.match(csp, /manifest-src 'self'/);
    assert.match(csp, /worker-src 'self'/);
    const html = await page.text();
    assert.match(html, /rel="manifest"/);
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /viewport-fit=cover/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
});
