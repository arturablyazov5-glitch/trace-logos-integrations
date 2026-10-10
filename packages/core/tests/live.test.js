// Optional: hits the real https://trace-logos.ru. Run with TRACE_LOGOS_LIVE=1 (npm run test:live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TraceLogos, createMemoryCache } from '../dist/index.js';

const live = process.env.TRACE_LOGOS_LIVE === '1';

test('live catalog: load, revalidate, search, download', { skip: !live && 'set TRACE_LOGOS_LIVE=1' }, async () => {
  const cache = createMemoryCache();
  const tl = new TraceLogos({ source: 'npm', cache, timeoutMs: 20_000 });
  const cat = await tl.load();
  assert.equal(cat.stale, false);
  assert.ok(cat.logos.length > 500, `got ${cat.logos.length}`);
  for (const [q, slug] of [
    ['телеграм', 'telegram'], ['telegram', 'telegram'], ['ntktuhfv', 'telegram'], ['сбербанк', 'sber'],
    ['вк', 'vk'], ['vk', 'vk'], ['вконтакте', 'vk'], ['макс', 'max'], ['max', 'max'], ['сбер', 'sber'],
  ]) {
    const top = tl.search(q, { limit: 3 });
    if (process.env.TRACE_LOGOS_LIVE_REPORT) console.log(`${q} -> ${top.map((l) => l.name).join(' | ')}`);
    assert.equal(top[0]?.slug, slug, q);
  }
  const again = await tl.load({ force: true }); // If-None-Match round trip (304 or 200)
  assert.equal(again.logos.length, cat.logos.length);

  const tg = tl.search('telegram')[0];
  const svg = await tl.fetchAsset(tg.svgUrl);
  assert.equal(svg.contentType, 'image/svg+xml');
  const app = cat.logos.find((l) => / /.test(decodeURI(l.svgUrl ?? l.pngUrl ?? '')));
  assert.ok(app, 'a logo with a space in its asset URL');
  const a = await tl.fetchAsset(app.svgUrl ?? app.pngUrl);
  assert.ok(a.bytes.byteLength > 0);
});
