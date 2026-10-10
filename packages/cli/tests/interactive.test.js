import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SVG, makeEnv, run } from './helpers.js';

async function session(input, tweak) {
  const env = makeEnv({ isTTY: true, input });
  tweak?.(env);
  try {
    const code = await run(env, 'search', 'telegram', '--limit', '3');
    return { env, code, snapshot: { out: env.stdout, err: env.stderr, copied: [...env.copied], opened: [...env.opened], files: existsSync(env.cwd) ? readdirSync(env.cwd) : [] } };
  } finally { env.cleanup(); }
}

test('menu: pick a logo, copy SVG and PNG links, quit; attribution at the end', async () => {
  const { code, snapshot: s } = await session('1\n1\n2\nq\n');
  assert.equal(code, 0);
  assert.deepEqual(s.copied, [
    'https://trace-logos.ru/assets/logos/svgs/telegram.svg',
    'https://trace-logos.ru/assets/logos/pngs/apple/26/color/telegram.png',
  ]);
  assert.match(s.out, /Select a logo \[1-3\]/);
  assert.match(s.out, /Copied SVG link/);
  assert.match(s.out.trimEnd(), /Logos catalog: Trace Logo's — https:\/\/trace-logos\.ru\/$/);
  assert.deepEqual(s.opened, [], 'browser is never opened unless asked');
});

test('menu: download SVG into cwd, then refuse silent overwrite', async () => {
  const { snapshot: s } = await session('1\n3\n3\nn\nq\n');
  assert.deepEqual(s.files, ['telegram.svg']);
  assert.match(s.out, /Saved .*telegram\.svg/);
  assert.match(s.out, /exists\. Overwrite\? \[y\/N\]/);
  assert.match(s.out, /Skipped\./);
});

test('menu: choose variant then download it', async () => {
  // 1 logo, 5 choose variant, 3 = 3D variant ("3D"), then 2 = download SVG, q
  const { snapshot: s } = await session('1\n5\n3\n2\nq\n');
  assert.match(s.out, /Variants:\n {2}1\. original/);
  assert.match(s.out, /Telegram — 3D/);
  assert.equal(s.files.length, 1);
  assert.match(s.files[0], /^telegram-3d.*\.svg$/);
});

test('menu: open page uses UTM link; failed clipboard prints the link', async () => {
  const a = await session('1\n6\nq\n');
  assert.equal(a.snapshot.opened.length, 1);
  assert.match(a.snapshot.opened[0], /^https:\/\/trace-logos\.ru\/logos\/social\/telegram\/\?utm_source=npm/);
  const b = await session('1\n1\nq\n', (env) => { env.copyResult = false; });
  assert.match(b.snapshot.out, /No clipboard utility found\. SVG link:\nhttps:\/\/trace-logos\.ru\/assets\/logos\/svgs\/telegram\.svg/);
});

test('menu: invalid input is tolerated, EOF quits cleanly', async () => {
  const { code, snapshot: s } = await session('abc\n99\n');
  assert.equal(code, 0);
  assert.match(s.out, /Please enter a number/);
  assert.match(s.out, /Logos catalog/);
});

test('--json in a TTY skips the menu', async () => {
  const env = makeEnv({ isTTY: true, input: '' });
  try {
    await run(env, 'search', 'telegram', '--json', '--limit', '1');
    assert.equal(JSON.parse(env.stdout)[0].slug, 'telegram');
    assert.doesNotMatch(env.stdout, /Select a logo/);
  } finally { env.cleanup(); }
});
