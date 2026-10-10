const test = require('node:test');
const assert = require('node:assert/strict');
const { createCatalogCache, createMemoryFs, cacheFileName } = require('../out-test/cache.cjs');
const { TraceLogos } = require('../out-test/core.cjs');

test('catalog cache round-trip and corrupt file', async () => {
  const fs = createMemoryFs();
  const c = createCatalogCache(fs);
  assert.equal(await c.get('k'), undefined);
  await c.set('k', { body: '{}', etag: '"e"', fetchedAt: 5 });
  assert.deepEqual(await c.get('k'), { body: '{}', etag: '"e"', fetchedAt: 5 });
  fs.files.set(cacheFileName('k'), new TextEncoder().encode('not json'));
  assert.equal(await c.get('k'), undefined);
});

test('core client + adapter: stale-if-error', async () => {
  const fs = createMemoryFs();
  const body = JSON.stringify({ logos: [] });
  let fail = false;
  const fetch = async () => {
    if (fail) throw new TypeError('offline');
    return new Response(body, { status: 200, headers: { etag: '"v1"' } });
  };
  const mk = () => new TraceLogos({ source: 'vscode', cache: createCatalogCache(fs), ttlMs: 0, fetch });
  const first = await mk().load();
  assert.equal(first.stale, false);
  assert.equal(fs.files.size, 1);
  fail = true;
  const second = await mk().load();
  assert.equal(second.stale, true);
});
