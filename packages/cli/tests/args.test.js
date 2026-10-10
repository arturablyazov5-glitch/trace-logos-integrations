import test from 'node:test';
import assert from 'node:assert/strict';
const { parseArgs, UsageError } = await import('../.build/args.mjs');

test('command and query words', () => {
  const a = parseArgs(['search', 'sber', 'bank', '--limit', '5', '--category=bank', '--json']);
  assert.equal(a.command, 'search');
  assert.deepEqual(a.positionals, ['sber', 'bank']);
  assert.equal(a.limit, 5);
  assert.equal(a.category, 'bank');
  assert.equal(a.json, true);
});

test('get flags, short options and cache switches', () => {
  const a = parseArgs(['get', 'telegram', '--png', '-o', 'out', '--variant', 'Lite', '--force', '--stdout', '--no-cache', '--refresh', '--offline']);
  assert.deepEqual([a.png, a.svg, a.out, a.variant, a.force, a.stdout, a.noCache, a.refresh, a.offline], [true, false, 'out', 'Lite', true, true, true, true, true]);
});

test('flags may come before the command; -- ends options', () => {
  const a = parseArgs(['--offline', 'search', '--', '--weird']);
  assert.equal(a.offline, true);
  assert.deepEqual(a.positionals, ['--weird']);
});

test('help and version without a command', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
  assert.equal(parseArgs([]).command, undefined);
});

test('usage errors', () => {
  for (const bad of [['search', '--limit'], ['search', '--limit', 'x'], ['search', '--limit=0'], ['search', '--nope'], ['nope'], ['get', 'x', '--svg', '--png'], ['get', '--json=1']]) {
    assert.throws(() => parseArgs(bad), UsageError, bad.join(' '));
  }
});
