// What search engines and link previews see: one real address per section with its own title, description,
// canonical link and visible content, plus sitemap.xml, robots.txt and Schema.org markup.
import seo from '../config/seo.json' with { type: 'json' };

const routeByPath = new Map(seo.routes.map((route) => [route.path, route]));
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Inside <script type="application/ld+json"> only "<" can end the element early.
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function seoRoute(path) { return routeByPath.get(path) ?? null; }

function structuredData(origin) {
  const person = { '@type': 'Person', '@id': `${origin}/#anna`, name: seo.person.name, jobTitle: seo.person.jobTitle,
    image: `${origin}/assets/app/og-image.jpg`, url: `${origin}/`, sameAs: seo.person.sameAs,
    affiliation: { '@type': 'Organization', name: seo.person.affiliation } };
  const website = { '@type': 'WebSite', '@id': `${origin}/#site`, name: seo.siteName, url: `${origin}/`, inLanguage: 'ru',
    publisher: { '@id': `${origin}/#anna` } };
  return { '@context': 'https://schema.org', '@graph': [person, website] };
}

// Search-console ownership tags; the codes come from the server settings, never from the request.
function verificationTags({ yandex, google }) {
  return [yandex && `<meta name="yandex-verification" content="${escapeHtml(yandex)}" />`,
    google && `<meta name="google-site-verification" content="${escapeHtml(google)}" />`].filter(Boolean).join('\n    ');
}

// The page shell carries all sections; for an address only its own section is visible in the HTML itself.
export function renderPage(html, route, origin, verification = {}) {
  const url = `${origin}${route.path === '/' ? '/' : route.path}`;
  const title = escapeHtml(route.title), description = escapeHtml(route.description);
  let page = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/(data-page="(\w+)")( hidden)?>/g, (match, attribute, page) => `${attribute}${page === route.page ? '' : ' hidden'}>`);
  const extra = [route.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '', verificationTags(verification),
    `<script type="application/ld+json">${safeJson(structuredData(origin))}</script>`].filter(Boolean).join('\n    ');
  return page.replace('</head>', `    ${extra}\n  </head>`);
}

export function sitemapXml(origin, today = new Date().toISOString().slice(0, 10)) {
  const urls = seo.routes.filter((route) => !route.noindex).map((route) => `  <url>
    <loc>${origin}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// Clean-param tells Yandex that ?payment=… (return from a payment page) does not make a new page.
export function robotsTxt(origin) {
  return ['User-agent: *', 'Disallow: /api/', 'Disallow: /kabinet', 'Allow: /', '', 'User-agent: Yandex', 'Disallow: /api/',
    'Disallow: /kabinet', 'Clean-param: payment&test_payment', 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

export function notFoundPage() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Страница не найдена — ${escapeHtml(seo.siteName)}</title>
<link rel="stylesheet" href="/assets/fonts/fonts.css"></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#130d0b;color:#f6eee3;font:16px/1.6 Roboto,Arial,sans-serif;text-align:center;padding:24px">
<main><p style="color:#f5d985;font:italic 28px 'Playfair Display',Georgia,serif;margin:0 0 8px">Такой страницы нет</p>
<p style="margin:0 0 20px;color:#cbbcaf">Возможно, ссылка устарела.</p>
<a href="/" style="color:#f5d985">Вернуться на главную</a></main></body></html>`;
}
