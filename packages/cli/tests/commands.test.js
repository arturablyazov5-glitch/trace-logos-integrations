import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_TEXT, PNG, SVG, fakeSite, makeEnv, run } from './helpers.js';

async function withEnv(opts, fn) {
  const env = makeEnv(opts);
  try { await fn(env); } finally { env.cleanup(); }
}

test('--help / --version / no command', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, '--help'), 0);
    assert.match(env.stdout, /Logos catalog: Trace Logo's — https:\/\/trace-logos\.ru\//);
    assert.equal(await run(env, '--version'), 0);
    assert.match(env.stdout, /\n\d+\.\d+\.\d+\n$/);
    assert.equal(await run(env), 2);
  });
});

test('search without TTY prints a list, hides comingSoon, never opens or copies', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'search', 'сбер'), 0);
    assert.match(env.stdout, /1\. Сбер {2}\(sber\)/);
    assert.doesNotMatch(env.stdout, /Сбер Бизнес/);
    assert.doesNotMatch(env.stdout, /Logos catalog/);
    assert.deepEqual(env.opened, []);
    assert.deepEqual(env.copied, []);
  });
});

test('search --json: shape, UTM page url, limit, category, layout fix', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'search', 'telegram', '--json', '--limit', '1'), 0);
    const [t, ...rest] = JSON.parse(env.stdout);
    assert.equal(rest.length, 0);
    assert.deepEqual(Object.keys(t).sort(), ['category', 'categoryName', 'hasPng', 'hasSvg', 'name', 'pageUrl', 'pngUrl', 'slug', 'svgUrl'].sort());
    assert.equal(t.slug, 'telegram');
    assert.equal(t.pageUrl, 'https://trace-logos.ru/logos/social/telegram/?utm_source=npm&utm_medium=integration&utm_campaign=telegram');
    assert.equal(t.hasSvg, true);
  });
  await withEnv({}, async (env) => {
    await run(env, 'search', 'ntktuhfv', '--json', '--limit', '1');
    assert.equal(JSON.parse(env.stdout)[0].slug, 'telegram');
  });
  await withEnv({}, async (env) => {
    await run(env, 'search', 'сбер', '--json', '--category', 'bank');
    const r = JSON.parse(env.stdout);
    assert.ok(r.length > 0 && r.every((x) => x.category === 'bank'));
  });
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'search', 'qqqqzzzz'), 0);
    assert.match(env.stderr, /No logos found/);
    await run(env, 'search', 'qqqqzzzz', '--json');
    assert.deepEqual(JSON.parse(env.stdout), []);
  });
});

test('get --out dir writes the safe filename; second run refuses to overwrite; --force overwrites', async () => {
  await withEnv({}, async (env) => {
    const out = join(env.root, 'logos', 'nested');
    assert.equal(await run(env, 'get', 'telegram', '--svg', '--out', out), 0);
    const file = join(out, 'telegram.svg');
    assert.equal(readFileSync(file, 'utf8'), SVG);
    assert.match(env.stdout, /Saved .*telegram\.svg/);

    writeFileSync(file, 'MINE');
    assert.equal(await run(env, 'get', 'telegram', '--svg', '--out', out), 1);
    assert.match(env.stderr, /already exists.*--force/s);
    assert.equal(readFileSync(file, 'utf8'), 'MINE');

    assert.equal(await run(env, 'get', 'telegram', '--svg', '--out', out, '--force'), 0);
    assert.equal(readFileSync(file, 'utf8'), SVG);
  });
});

test('get defaults to cwd; --out file path; extension mismatch is rejected', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get', 'telegram'), 0);
    assert.deepEqual(readdirSync(env.cwd), ['telegram.svg']);
    assert.equal(await run(env, 'get', 'telegram', '--png', '-o', join(env.root, 'x', 'tg.png')), 0);
    assert.deepEqual([...readFileSync(join(env.root, 'x', 'tg.png'))], [...PNG]);
    assert.equal(await run(env, 'get', 'telegram', '--svg', '-o', join(env.root, 'y', 'tg.png')), 1);
    assert.match(env.stderr, /extension/);
    assert.equal(existsSync(join(env.root, 'y')), false);
  });
});

test('get --variant picks a variant file; unknown variant lists the available ones', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get', 'telegram', '--variant', 'премиум'), 0);
    assert.ok(existsSync(join(env.cwd, 'telegram-premium.svg')));
    assert.equal(await run(env, 'get', 'telegram', '--variant', 'nonexistent'), 1);
    assert.match(env.stderr, /No variant "nonexistent"[\s\S]*Turbo/);
  });
});

test('get --stdout prints SVG only', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get', 'telegram', '--stdout'), 0);
    assert.equal(env.stdout, SVG);
    assert.deepEqual(readdirSync(env.cwd), []);
  });
});

test('logo without SVG: default falls back to PNG, explicit --svg suggests PNG', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get', 'shein'), 0);
    assert.match(env.stderr, /no SVG; downloading PNG instead/);
    assert.deepEqual(readdirSync(env.cwd), ['shein.png']);
  });
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get', 'shein', '--svg'), 1);
    assert.match(env.stderr, /no SVG\. A PNG is available: trace-logos get shein --png/);
    assert.doesNotMatch(env.stderr, /\n\s+at /);
  });
});

test('unknown logo and fuzzy query', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get', 'qqqqzzzz'), 1);
    assert.match(env.stderr, /No logo found/);
  });
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'info', 'телеграм', '--json'), 0);
    assert.match(env.stderr, /best match/);
    const j = JSON.parse(env.stdout);
    assert.equal(j.slug, 'telegram');
    assert.ok(j.assets.length > 3);
  });
});

test('info prints page with UTM, formats and files', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'info', 'sber'), 0);
    assert.match(env.stdout, /Page: +https:\/\/trace-logos\.ru\/logos\/bank\/sber\/\?utm_source=npm&utm_medium=integration&utm_campaign=sber/);
    assert.match(env.stdout, /Formats: +svg/);
    assert.match(env.stdout, /SVG {2}original {2}https:\/\/trace-logos\.ru\/assets\/logos\/svgs\/sber\.svg/);
  });
});

test('open uses the adapter only on the explicit command; failure prints the link', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'open', 'sber'), 0);
    assert.equal(env.opened.length, 1);
    assert.match(env.opened[0], /utm_source=npm/);
    env.openResult = false;
    assert.equal(await run(env, 'open', 'sber'), 1);
    assert.match(env.stderr, /Could not open a browser\. Page: https:\/\/trace-logos\.ru/);
  });
});

test('missing argument is a usage error', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'get'), 2);
    assert.match(env.stderr, /needs a logo slug/);
    assert.equal(await run(env, 'search', '--bogus'), 2);
  });
});

test('network errors: friendly message, exit 1, no stack', async () => {
  await withEnv({ fetch: fakeSite({ fail: true }) }, async (env) => {
    assert.equal(await run(env, 'search', 'telegram'), 1);
    assert.match(env.stderr, /Network problem/);
    assert.match(env.stderr, /--offline/);
    assert.doesNotMatch(env.stderr, /\n\s+at /);
  });
  await withEnv({ fetch: fakeSite({ catalogStatus: 503 }) }, async (env) => {
    assert.equal(await run(env, 'get', 'telegram'), 1);
    assert.match(env.stderr, /HTTP 503/);
  });
});

test('cache: second run is served from disk; --refresh and --no-cache hit the network', async () => {
  await withEnv({}, async (env) => {
    await run(env, 'search', 'sber');
    assert.equal(env.fetch.calls.length, 1);
    assert.ok(readdirSync(env.cacheDir).length === 1);
    await run(env, 'search', 'sber');
    assert.equal(env.fetch.calls.length, 1, 'fresh cache: no request');
    await run(env, 'search', 'sber', '--refresh');
    assert.equal(env.fetch.calls.length, 2);
    assert.equal(env.fetch.calls[1].endsWith('/logos.json'), true);
  });
  await withEnv({}, async (env) => {
    await run(env, 'search', 'sber', '--no-cache');
    assert.equal(existsSync(env.cacheDir), false);
    await run(env, 'search', 'sber', '--no-cache');
    assert.equal(env.fetch.calls.length, 2);
  });
});

test('--offline: uses the cache without any request, even an expired one', async () => {
  await withEnv({}, async (env) => {
    await run(env, 'search', 'sber');
    const f = join(env.cacheDir, readdirSync(env.cacheDir)[0]);
    const entry = JSON.parse(readFileSync(f, 'utf8'));
    writeFileSync(f, JSON.stringify({ ...entry, fetchedAt: 1000 }));
    const before = env.fetch.calls.length;
    env.reset();
    assert.equal(await run(env, 'search', 'sber', '--offline', '--json'), 0);
    assert.equal(env.fetch.calls.length, before, 'no network in offline mode');
    assert.equal(JSON.parse(env.stdout)[0].slug, 'sber');
  });
});

test('--offline without a cache: clear error; downloading offline is refused too', async () => {
  await withEnv({}, async (env) => {
    assert.equal(await run(env, 'search', 'sber', '--offline'), 1);
    assert.match(env.stderr, /Offline mode/);
    assert.equal(env.fetch.calls.length, 0);
    assert.doesNotMatch(env.stderr, /\n\s+at /);
  });
  await withEnv({}, async (env) => {
    await run(env, 'search', 'sber');
    assert.equal(await run(env, 'get', 'sber', '--offline'), 1);
    assert.match(env.stderr, /Offline mode/);
    assert.deepEqual(readdirSync(env.cwd), []);
  });
});

test('stale cache when the network dies: results plus a warning', async () => {
  const env = makeEnv();
  try {
    await run(env, 'search', 'sber');
    const f = join(env.cacheDir, readdirSync(env.cacheDir)[0]);
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), fetchedAt: 1000 }));
    env.deps.fetch = fakeSite({ fail: true });
    env.reset();
    assert.equal(await run(env, 'search', 'sber', '--json'), 0);
    assert.match(env.stderr, /could not reach trace-logos\.ru, using the cached catalog/);
    assert.equal(JSON.parse(env.stdout)[0].slug, 'sber');
  } finally { env.cleanup(); }
});

test('catalog text is the fixture (sanity)', () => {
  assert.ok(FIXTURE_TEXT.includes('Telegram'));
});

function dupCatalog() {
  const base = JSON.parse(FIXTURE_TEXT);
  const alfa = base.logos.find((l) => l.url.endsWith('/bank/alfa/'));
  const twin = { ...alfa, name: 'Alfa Twin', url: 'https://trace-logos.ru/logos/other/alfa/', categorySlug: 'other', categoryName: 'Other' };
  base.logos.push(twin);
  const site = fakeSite();
  const fn = async (url, init) => (new URL(url).pathname === '/logos.json' ? new Response(JSON.stringify(base), { status: 200 }) : site(url, init));
  fn.calls = site.calls;
  return fn;
}

test('duplicate slug: bare slug is ambiguous (candidates listed, exit 1, nothing downloaded); category/slug resolves', async () => {
  for (const cmd of ['get', 'info', 'open']) {
    await withEnv({ fetch: dupCatalog() }, async (env) => {
      assert.equal(await run(env, cmd, 'alfa'), 1, cmd);
      assert.match(env.stderr, /ambiguous/);
      assert.match(env.stderr, /bank\/alfa/);
      assert.match(env.stderr, /other\/alfa/);
      assert.deepEqual(readdirSync(env.cwd), []);
      assert.deepEqual(env.opened, []);
    });
  }
  await withEnv({ fetch: dupCatalog() }, async (env) => {
    assert.equal(await run(env, 'info', 'other/alfa', '--json'), 0);
    assert.equal(JSON.parse(env.stdout).name, 'Alfa Twin');
    env.reset();
    assert.equal(await run(env, 'get', 'bank/alfa'), 0);
    assert.equal(readdirSync(env.cwd).length, 1);
  });
});
