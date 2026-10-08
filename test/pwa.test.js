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

test('the page carries an absolute link preview and robots.txt keeps crawlers off the API', async () => {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, codeSecret: 'test-secret-with-at-least-thirty-two-characters', publicUrl: 'https://anna.example/' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base)).text();
    assert.match(html, /<meta property="og:image" content="https:\/\/anna\.example\/assets\/app\/og-image\.jpg" \/>/);
    assert.equal(html.includes('__PUBLIC_URL__'), false);
    assert.equal((await fetch(`${base}/assets/app/og-image.jpg`)).status, 200);
    const robots = await fetch(`${base}/robots.txt`);
    assert.match(robots.headers.get('content-type'), /^text\/plain/);
    assert.match(await robots.text(), /Disallow: \/api\//);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
});

test('each section has its own indexable address with title, canonical and only its content visible', async () => {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, codeSecret: 'test-secret-with-at-least-thirty-two-characters', publicUrl: 'https://anna.example',
    searchVerification: { yandex: 'abc123', google: 'xyz789' } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const day = await (await fetch(`${base}/karta-dnya`)).text();
    assert.match(day, /<title>Карта дня таро онлайн бесплатно — Анна Гринькова<\/title>/);
    assert.match(day, /<link rel="canonical" href="https:\/\/anna\.example\/karta-dnya" \/>/);
    assert.match(day, /data-page="day">/);
    assert.match(day, /data-page="home" hidden>/);
    assert.match(day, /<meta name="yandex-verification" content="abc123" \/>/);
    assert.match(day, /"@type":"Person"/);
    assert.equal(day.includes('noindex'), false);
    assert.match(await (await fetch(`${base}/kabinet`)).text(), /<meta name="robots" content="noindex, nofollow" \/>/);

    const redirect = await fetch(`${base}/karta-dnya/`, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), '/karta-dnya');
    assert.equal((await fetch(`${base}/index.html`, { redirect: 'manual' })).status, 301);

    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemap, /<loc>https:\/\/anna\.example\/karta-dnya<\/loc>/);
    assert.equal(sitemap.includes('/kabinet'), false);
    const robots = await (await fetch(`${base}/robots.txt`)).text();
    assert.match(robots, /Sitemap: https:\/\/anna\.example\/sitemap\.xml/);
    assert.match(robots, /Clean-param: payment/);

    const missing = await fetch(`${base}/no-such-page`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Такой страницы нет/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
});
