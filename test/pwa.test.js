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
    assert.match(day, /<title>Карта дня онлайн бесплатно — Анна Гринькова<\/title>/);
    assert.match(day, /<link rel="canonical" href="https:\/\/anna\.example\/karta-dnya" \/>/);
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
    assert.equal(sitemap.includes('/podpiska'), false);
    const subscriptionResponse = await fetch(`${base}/podpiska`);
    assert.equal(subscriptionResponse.status, 200);
    const subscription = await subscriptionResponse.text();
    assert.match(subscription, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(subscription, /<title>Подписка и оплата — Анна Гринькова<\/title>/);
    // A public page must not contain anyone's checkout link or email.
    assert.equal(subscription.includes('customer_email='), false);
    for (const resource of ['/subscription.css?v=1', '/subscription.js?v=1']) {
      const asset = await fetch(`${base}${resource}`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('content-type'), /css|javascript/);
    }
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

test('every file the service worker stores for offline use is served directly, not through a redirect', async () => {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, codeSecret: 'test-secret-with-at-least-thirty-two-characters' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const worker = await (await fetch(`${base}/sw.js`)).text();
    const shell = JSON.parse(worker.match(/const SHELL = (\[[^\]]*\]);/)[1].replaceAll("'", '"'));
    // A redirected copy cannot answer a page load offline, so the browser would show its own error page.
    for (const entry of shell) assert.equal((await fetch(new URL(entry, `${base}/`), { redirect: 'manual' })).status, 200, entry);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
});

test('the app is the site: it opens at the root and at the old addresses, /miniapp/ stays as a duplicate kept out of robots.txt', async () => {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, publicUrl: 'https://anna.example', codeSecret: 'test-secret-with-at-least-thirty-two-characters' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bare = await fetch(`${base}/miniapp`, { redirect: 'manual' });
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/miniapp/');
    const page = await fetch(`${base}/miniapp/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /data-screen="login"/);
    const root = await (await fetch(`${base}/`)).text();
    assert.match(root, /data-screen="home"/);
    assert.match(root, /<link rel="canonical" href="https:\/\/anna\.example\/" \/>/);
    assert.equal(root.includes('noindex'), false);
    assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \/miniapp\//);
  } finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
});
