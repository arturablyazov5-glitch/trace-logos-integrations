import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  ATTRIBUTION, TraceLogos, TraceLogosError, attributionText, normalizeCatalog, suggestFilename, MAX_ASSET_BYTES,
} from '../dist/index.js';
import { FIXTURE, mockFetch, ok } from './helpers.js';

const { logos } = normalizeCatalog(FIXTURE);
const bySlug = (s) => logos.find((l) => l.slug === s);
const SVG = '<?xml version="1.0"?>\n<!-- c --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

test('pageUrl adds only UTM labels; cleanPageUrl has none', () => {
  const tl = new TraceLogos({ source: 'vscode', fetch: mockFetch() });
  const tg = bySlug('telegram');
  assert.equal(tl.pageUrl(tg),
    'https://trace-logos.ru/logos/social/telegram/?utm_source=vscode&utm_medium=integration&utm_campaign=telegram');
  const u = new URL(tl.pageUrl(tg, { content: 'copy link & more' }));
  assert.equal(u.searchParams.get('utm_content'), 'copy link & more');
  assert.deepEqual([...u.searchParams.keys()], ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']);
  assert.equal(tl.cleanPageUrl(tg), 'https://trace-logos.ru/logos/social/telegram/');
  const custom = new TraceLogos({ source: 'my tool/1', fetch: mockFetch() });
  assert.match(custom.pageUrl(tg), /utm_source=my\+tool%2F1&/);
});

test('assetsOf: original first, variants labelled, duplicate URLs dropped, unique safe filenames', () => {
  const tl = new TraceLogos({ source: 'npm', fetch: mockFetch() });
  const tg = bySlug('telegram');
  const assets = tl.assetsOf(tg);
  assert.deepEqual(assets[0], { kind: 'svg', variant: 'original', url: tg.svgUrl, filename: 'telegram.svg' });
  assert.equal(assets[1].filename, 'telegram.png');
  assert.equal(new Set(assets.map((a) => a.url)).size, assets.length);
  assert.equal(new Set(assets.map((a) => a.filename)).size, assets.length);
  for (const l of logos) for (const a of tl.assetsOf(l)) assert.match(a.filename, /^[a-z0-9][a-z0-9\-_.]*\.(svg|png)$/);
  assert.equal(tl.assetsOf(bySlug('shein')).every((a) => a.kind === 'png'), true);
});

test('suggestFilename: translit, no traversal', () => {
  const logo = { slug: 'sber', name: 'Сбер' };
  assert.equal(suggestFilename(logo, { kind: 'svg', variant: '185 лет' }), 'sber-185-let.svg');
  assert.equal(suggestFilename(logo, { kind: 'png', variant: '2021‑2024' }), 'sber-2021-2024.png');
  assert.equal(suggestFilename({ slug: '../../etc/passwd', name: 'x' }, { kind: 'svg', variant: 'original' }), 'etc-passwd.svg');
  assert.equal(suggestFilename({ slug: '..', name: 'Пятёрочка' }, { kind: 'svg', variant: '../..' }), 'pyaterochka.svg');
  assert.equal(suggestFilename({ slug: '', name: '' }, { kind: 'png', variant: 'original' }), 'logo.png');
});

test('fetchAsset: SVG and PNG ok, content sniffed', async () => {
  const f = mockFetch(ok(SVG, { 'content-type': 'image/svg+xml' }), ok(PNG, { 'content-type': 'application/octet-stream' }));
  const tl = new TraceLogos({ source: 'npm', fetch: f });
  const svg = await tl.fetchAsset('https://trace-logos.ru/assets/logos/svgs/apple-App Store.svg');
  assert.equal(svg.contentType, 'image/svg+xml');
  assert.equal(new TextDecoder().decode(svg.bytes), SVG);
  assert.equal(f.calls[0].url, 'https://trace-logos.ru/assets/logos/svgs/apple-App%20Store.svg');
  assert.equal(f.calls[0].init.redirect, 'manual');
  const png = await tl.fetchAsset('https://trace-logos.ru/a.png');
  assert.equal(png.contentType, 'image/png');
});

test('fetchAsset: foreign hosts, http, credentials and ports are refused without a request', async () => {
  const f = mockFetch();
  const tl = new TraceLogos({ source: 'npm', fetch: f });
  for (const url of ['https://evil.example/x.svg', 'http://trace-logos.ru/x.svg', 'https://trace-logos.ru.evil.com/x.svg',
    'https://user:pw@trace-logos.ru/x.svg', 'https://trace-logos.ru:8443/x.svg', 'file:///etc/passwd', 'not a url']) {
    await assert.rejects(tl.fetchAsset(url), (e) => e instanceof TraceLogosError && e.code === 'FORBIDDEN_HOST', url);
  }
  assert.equal(f.calls.length, 0);
});

test('fetchAsset: redirect to a foreign host is refused, same-host redirect followed', async () => {
  const redirect = (to) => () => new Response(null, { status: 302, headers: { location: to } });
  const evil = mockFetch(redirect('https://evil.example/x.svg'));
  await assert.rejects(new TraceLogos({ source: 'npm', fetch: evil }).fetchAsset('https://trace-logos.ru/x.svg'),
    (e) => e.code === 'FORBIDDEN_HOST');
  assert.equal(evil.calls.length, 1);

  const same = mockFetch(redirect('/assets/y.svg'), ok(SVG));
  await new TraceLogos({ source: 'npm', fetch: same }).fetchAsset('https://trace-logos.ru/x.svg');
  assert.equal(same.calls[1].url, 'https://trace-logos.ru/assets/y.svg');
});

test('fetchAsset: HTML error page, 404, oversize', async () => {
  const html = mockFetch(ok('<!DOCTYPE html><html><body><svg></svg>404</body></html>', { 'content-type': 'text/html' }));
  await assert.rejects(new TraceLogos({ source: 'npm', fetch: html }).fetchAsset('https://trace-logos.ru/x.svg'),
    (e) => e.code === 'INVALID_ASSET');
  const nf = mockFetch(() => new Response('nope', { status: 404 }));
  await assert.rejects(new TraceLogos({ source: 'npm', fetch: nf }).fetchAsset('https://trace-logos.ru/x.svg'),
    (e) => e.code === 'NOT_FOUND');
  const declared = mockFetch(() => new Response('x', { headers: { 'content-length': String(MAX_ASSET_BYTES + 1) } }));
  await assert.rejects(new TraceLogos({ source: 'npm', fetch: declared }).fetchAsset('https://trace-logos.ru/x.svg'),
    (e) => e.code === 'TOO_LARGE');
  const big = mockFetch(() => new Response(new ReadableStream({
    start(c) { for (let i = 0; i < 6; i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); },
  })));
  await assert.rejects(new TraceLogos({ source: 'npm', fetch: big }).fetchAsset('https://trace-logos.ru/x.svg'),
    (e) => e.code === 'TOO_LARGE');
});

test('attribution', () => {
  assert.deepEqual({ ...ATTRIBUTION }, { name: "Trace Logo's", url: 'https://trace-logos.ru/' });
  assert.match(attributionText(bySlug('telegram')), /^Telegram .*Trace Logo's.*https:\/\/trace-logos\.ru\/$/);
});

test('packaging: CJS entry works; core bundle has no Node built-ins', () => {
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.equal(typeof cjs.TraceLogos, 'function');
  assert.equal(typeof require('../dist/node.cjs').createFileCache, 'function');
  for (const f of ['../dist/index.js', '../dist/index.cjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /require\(|from\s*["']node:|import\(["']node:/, f);
  }
});

test('filenames: duplicate slugs get a category prefix, unique slugs unchanged, order-independent', () => {
  const names = (list) => {
    const { logos: ls } = normalizeCatalog({ logos: list });
    const tl = new TraceLogos({ source: 'npm', fetch: mockFetch() });
    return Object.fromEntries(ls.map((l) => [`${l.category.slug}/${l.slug}`, tl.assetsOf(l).map((a) => a.filename)]));
  };
  const a = names(FIXTURE.logos);
  const b = names([...FIXTURE.logos].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(a['bank/alfa'].slice(0, 3), ['bank-alfa.svg', 'bank-alfa-full.svg', 'bank-alfa-full-en.svg']);
  assert.equal(a['insurance/alfa'][0], 'insurance-alfa.svg');
  assert.equal(a['search/google'][0], 'search-google.svg');
  assert.equal(a['map/google'][0], 'map-google.svg');
  assert.ok(a['map/google'].includes('map-google-full.svg'));
  assert.equal(a['games/monopoly'][0], 'games-monopoly.svg');
  assert.equal(a['developers/monopoly'][0], 'developers-monopoly.svg');
  assert.equal(a['social/telegram'][0], 'telegram.svg');
  // all filenames across the catalog are distinct and safe
  const all = Object.values(a).flat();
  assert.equal(new Set(all).size, all.length);
  for (const f of all) assert.match(f, /^[a-z0-9][a-z0-9\-_.]*\.(svg|png)$/);

  const { logos: ls } = normalizeCatalog(FIXTURE);
  assert.equal(ls.find((l) => l.slug === 'telegram').ambiguousSlug, undefined);
  // A lone entry is not ambiguous; the flag is a catalog-level fact.
  const lone = normalizeCatalog({ logos: [FIXTURE.logos.find((l) => l.url.endsWith('/insurance/alfa/'))] }).logos[0];
  assert.equal(suggestFilename(lone, { kind: 'svg', variant: 'original' }), 'alfa.svg');
  // Hostile category slug cannot escape.
  assert.equal(suggestFilename({ slug: 'x', name: 'x', ambiguousSlug: true, category: { slug: '../../etc', name: '' } },
    { kind: 'svg', variant: 'original' }), 'etc-x.svg');
});
