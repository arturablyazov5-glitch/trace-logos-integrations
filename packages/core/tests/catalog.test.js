import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TraceLogos, TraceLogosError, createMemoryCache, normalizeCatalog } from '../dist/index.js';
import { createFileCache } from '../dist/node.js';
import { FIXTURE, FIXTURE_TEXT, mockFetch, ok, status, fail } from './helpers.js';

const make = (fetch, extra = {}) => new TraceLogos({ source: 'npm', fetch, ...extra });

test('normalization: comingSoon dropped, URLs-only hasSvg/hasPng, slug from page URL', () => {
  const { logos, skipped, updated } = normalizeCatalog(FIXTURE);
  const csCount = FIXTURE.logos.filter((l) => l.comingSoon).length;
  assert.ok(csCount > 0);
  assert.equal(skipped, csCount);
  assert.equal(logos.length, FIXTURE.logos.length - csCount);
  assert.ok(updated);
  assert.ok(!logos.some((l) => /placeholder/.test(JSON.stringify(l))));

  const shein = logos.find((l) => l.slug === 'shein');
  assert.equal(shein.hasSvg, false); // only PNG, no SVG anywhere
  assert.equal(shein.hasPng, true);
  assert.equal(shein.svgUrl, undefined);

  // formats says ["svg","png"] but top-level pngUrl is null — hasPng follows actual URLs (incl. variants)
  const sber = logos.find((l) => l.slug === 'sber');
  assert.equal(sber.name, 'Сбер');
  assert.equal(sber.nameEn, 'Sber');
  assert.deepEqual(sber.category, { slug: 'bank', name: 'Банки' });
  assert.equal(sber.pngUrl, undefined);
  assert.equal(sber.hasPng, sber.variants.some((v) => v.pngUrl));
  assert.ok(sber.tags.includes('сбербанк'));
  assert.deepEqual(sber.ecosystem, ['sber']);
  assert.equal(sber.pageUrl, 'https://trace-logos.ru/logos/bank/sber/');

  const pyat = logos.find((l) => l.name === 'Пятёрочка');
  assert.ok(Array.isArray(pyat.ecosystem) && pyat.ecosystem.length === 2);
  const tg = logos.find((l) => l.slug === 'telegram');
  assert.equal(tg.ecosystem, undefined);
  assert.ok(tg.variants.length > 0 && tg.variants.every((v) => typeof v.wide === 'boolean' && typeof v.label === 'string'));
});

test('normalization: invalid records are skipped, not thrown', () => {
  const good = FIXTURE.logos.find((l) => l.name === 'Telegram');
  const { logos, skipped } = normalizeCatalog({
    logos: [null, 42, 'x', {}, { name: 'NoUrl', categorySlug: 'a', svgUrl: good.svgUrl },
      { ...good, url: 'not a url' }, { ...good, svgUrl: null, pngUrl: null, variants: [] },
      { ...good, variants: [null, { label: 'x' }, 7] }, good],
  });
  assert.equal(logos.length, 2);
  assert.equal(skipped, 7);
  assert.equal(logos[0].variants.length, 0);
  assert.throws(() => normalizeCatalog({ nope: 1 }), TypeError);
});

test('asset URLs: spaces and Cyrillic encoded once, existing escapes not double-encoded', () => {
  const { logos } = normalizeCatalog(FIXTURE);
  const app = logos.find((l) => l.name === 'App Store');
  assert.equal(app.svgUrl, 'https://trace-logos.ru/assets/logos/svgs/apple-App%20Store.svg');
  const cs = logos.find((l) => l.name === 'CleanShot X');
  assert.match(cs.pngUrl, /CleanShot%20X\.png$/);

  const base = FIXTURE.logos.find((l) => l.name === 'Telegram');
  const { logos: [x] } = normalizeCatalog({ logos: [{ ...base, variants: [],
    svgUrl: 'https://trace-logos.ru/assets/logos/svgs/Логотип%20уже закодирован 100%.svg',
    pngUrl: 'https://trace-logos.ru/assets/logos/pngs/a%2Fb%25c.png' }] });
  assert.equal(x.svgUrl,
    'https://trace-logos.ru/assets/logos/svgs/%D0%9B%D0%BE%D0%B3%D0%BE%D1%82%D0%B8%D0%BF%20%D1%83%D0%B6%D0%B5%20%D0%B7%D0%B0%D0%BA%D0%BE%D0%B4%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%20100%25.svg');
  assert.equal(x.pngUrl, 'https://trace-logos.ru/assets/logos/pngs/a%2Fb%25c.png');
  // idempotent
  const { logos: [y] } = normalizeCatalog({ logos: [{ ...base, variants: [], svgUrl: x.svgUrl, pngUrl: x.pngUrl }] });
  assert.equal(y.svgUrl, x.svgUrl);
  assert.equal(y.pngUrl, x.pngUrl);
});

test('load: 200 + ETag fills cache; fresh cache within TTL makes no request', async () => {
  const cache = createMemoryCache();
  const f1 = mockFetch(ok(FIXTURE_TEXT, { etag: '"v1"' }));
  const c1 = await make(f1, { cache }).load();
  assert.equal(c1.stale, false);
  assert.ok(c1.logos.length > 20);
  assert.equal(f1.calls.length, 1);
  assert.equal(f1.calls[0].url, 'https://trace-logos.ru/logos.json');
  assert.equal(f1.calls[0].headers.get('if-none-match'), null);
  assert.equal((await cache.get('catalog:https://trace-logos.ru/logos.json')).etag, '"v1"');

  const f2 = mockFetch();
  const tl2 = make(f2, { cache });
  const c2 = await tl2.load();
  assert.equal(f2.calls.length, 0);
  assert.equal(c2.logos.length, c1.logos.length);
  assert.equal(tl2.search('telegram')[0].slug, 'telegram');
});

test('load: expired cache revalidates with If-None-Match; 304 reuses body and refreshes fetchedAt', async () => {
  const cache = createMemoryCache();
  const key = 'catalog:https://trace-logos.ru/logos.json';
  await cache.set(key, { body: FIXTURE_TEXT, etag: '"v1"', fetchedAt: Date.now() - 3_600_000 });
  const f = mockFetch(status(304));
  const cat = await make(f, { cache }).load();
  assert.equal(f.calls[0].headers.get('if-none-match'), '"v1"');
  assert.equal(cat.stale, false);
  assert.ok(cat.logos.length > 20);
  assert.ok(Date.now() - (await cache.get(key)).fetchedAt < 5000);
});

test('load: force bypasses fresh cache; concurrent loads share one request', async () => {
  const cache = createMemoryCache();
  await cache.set('catalog:https://trace-logos.ru/logos.json', { body: FIXTURE_TEXT, etag: '"v1"', fetchedAt: Date.now() });
  const f = mockFetch(ok(FIXTURE_TEXT, { etag: '"v2"' }));
  const tl = make(f, { cache });
  const [a, b] = await Promise.all([tl.load({ force: true }), tl.load({ force: true })]);
  assert.equal(a, b);
  assert.equal(f.calls.length, 1);
});

test('load: network error with expired cache -> stale catalog', async () => {
  const cache = createMemoryCache();
  await cache.set('catalog:https://trace-logos.ru/logos.json', { body: FIXTURE_TEXT, fetchedAt: 1 });
  for (const h of [fail(), status(500), ok('{broken')]) {
    const cat = await make(mockFetch(h), { cache }).load();
    assert.equal(cat.stale, true);
    assert.equal(cat.fetchedAt, 1);
    assert.ok(cat.logos.length > 20);
  }
});

test('load: errors without cache carry a code', async () => {
  const cases = [
    [fail(), 'NETWORK'],
    [status(503), 'HTTP'],
    [status(404), 'NOT_FOUND'],
    [ok('{broken json'), 'PARSE'],
    [ok('{"hello":"world"}'), 'PARSE'],
  ];
  for (const [h, code] of cases) {
    await assert.rejects(make(mockFetch(h)).load(), (e) => e instanceof TraceLogosError && e.code === code);
  }
});

test('load: timeout -> NETWORK', async () => {
  const hang = (_url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(make(mockFetch(hang), { timeoutMs: 30 }).load(), (e) => e.code === 'NETWORK' && /timed out/.test(e.message));
});

test('createFileCache: persists entries across instances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-cache-'));
  try {
    const f1 = mockFetch(ok(FIXTURE_TEXT, { etag: '"x"' }));
    await make(f1, { cache: createFileCache(join(dir, 'nested')) }).load();
    const f2 = mockFetch();
    const cat = await make(f2, { cache: createFileCache(join(dir, 'nested')) }).load();
    assert.equal(f2.calls.length, 0);
    assert.ok(cat.logos.length > 20);
    assert.equal(await createFileCache(dir).get('missing'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('constructor requires source', () => {
  assert.throws(() => new TraceLogos({}), TypeError);
});
