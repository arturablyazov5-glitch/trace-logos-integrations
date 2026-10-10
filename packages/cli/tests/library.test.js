import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeSite } from './helpers.js';

const lib = await import('../dist/index.js');
const cjs = createRequire(import.meta.url)('../dist/index.cjs');

test('ESM and CJS expose the core API with source npm', async () => {
  for (const m of [lib, cjs]) {
    for (const k of ['TraceLogos', 'TraceLogosError', 'searchLogos', 'suggestFilename', 'createFileCache', 'defaultCacheDir', 'ATTRIBUTION']) {
      assert.ok(k in m, k);
    }
    const dir = mkdtempSync(join(tmpdir(), 'tl-lib-'));
    try {
      const site = fakeSite();
      const t = new m.TraceLogos({ fetch: site, cacheDir: dir });
      assert.equal(t.source, 'npm');
      await t.load();
      const [logo] = t.search('telegram');
      assert.match(t.pageUrl(logo), /utm_source=npm/);
      assert.equal(readdirSync(dir).length, 1, 'file cache written');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('cache: false means no files; custom source is respected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-lib-'));
  try {
    const t = new lib.TraceLogos({ fetch: fakeSite(), cache: false, cacheDir: join(dir, 'c'), source: 'x' });
    await t.load();
    assert.equal(existsSync(join(dir, 'c')), false);
    assert.match(t.pageUrl(t.search('telegram')[0]), /utm_source=x/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bundle has no runtime requires of non-builtin modules', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['cli.js', 'index.js', 'index.cjs']) {
    const src = readFileSync(new URL(`../dist/${f}`, import.meta.url), 'utf8');
    const specs = [...src.matchAll(/(?:from|require\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    assert.ok(specs.every((s) => s.startsWith('node:')), `${f}: ${specs.filter((s) => !s.startsWith('node:'))}`);
    assert.doesNotMatch(src, /@trace-logos-int/);
  }
});
