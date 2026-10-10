import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, searchLogos, switchLayout } from '../dist/index.js';
import { FIXTURE } from './helpers.js';

const { logos } = normalizeCatalog(FIXTURE);
const first = (q, opts) => searchLogos(logos, q, opts)[0]?.slug;
const reversed = [...logos].reverse();
// Deterministic shuffles: ranking must not depend on catalog order.
const shuffled = (seed) => {
  const a = [...logos];
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const orders = [logos, reversed, shuffled(1), shuffled(42), shuffled(2026)];

test('switchLayout both ways', () => {
  assert.equal(switchLayout('ntktuhfv'), 'телеграм');
  assert.equal(switchLayout('сбер'), 'c,th');
});

for (const [q, slug] of [
  ['телеграм', 'telegram'],
  ['telegram', 'telegram'],
  ['Telegram', 'telegram'],
  ['ntktuhfv', 'telegram'], // телеграм typed in EN layout
  ['телеграмм', 'telegram'], // double letter
  ['телегарм', 'telegram'], // typo (fuzzy)
  ['сбербанк', 'sber'],
  ['логотип сбербанка', 'sber'], // stop word + inflection
  ['sber', 'sber'],
  ['пятерочка', 'pyaterochka'], // ё folding
  ['тбанк', 'tbank'],
  ['т-банк', 'tbank'],
  ['jpjy', 'ozon'],
  // Main brand above its sub-brands ("ВК Дом", "VK ID" …) — via the tag alias "вк"/"vk", no brand list.
  ['вк', 'vk'],
  ['vk', 'vk'],
  ['dr', 'vk'], // вк typed in EN layout
  ['вконтакте', 'vk'],
  ['вк дом', 'vkhome'],
  ['vk видео', 'vkvideo'],
  ['макс', 'max'],
  ['max', 'max'],
  ['максим', 'maximtaxi'],
  ['сбер', 'sber'],
  ['сбер id', 'sberid'],
  ['яндекс', 'yandex'],
  ['альфа', 'alfa'],
]) {
  test(`search "${q}" -> ${slug} first (independent of catalog order)`, () => {
    for (const list of orders) assert.equal(searchLogos(list, q)[0]?.slug, slug);
  });
}

test('top-3 for the control queries', () => {
  const top = (q) => searchLogos(shuffled(7), q, { limit: 3 }).map((l) => l.name);
  assert.deepEqual(top('вк').slice(0, 1), ['ВКонтакте']);
  assert.ok(top('вк').every((n) => /^(ВК|VK)/.test(n)));
  assert.deepEqual(top('макс').slice(0, 2), ['Max', 'Максим']);
  assert.deepEqual(top('сбербанк').slice(0, 2), ['Сбер', 'СберТех']);
});

test('altNames: normalized from alt fields and ranked almost like the name', () => {
  const base = FIXTURE.logos.find((l) => l.name === 'Telegram');
  const raw = (over) => ({ ...base, variants: [], name: 'Зелёный', name_en: 'Green', tags: 'зеленый банк', url: 'https://trace-logos.ru/logos/bank/green/', ...over });
  const { logos: [a, b, c] } = normalizeCatalog({ logos: [
    raw({ alt_name: 'Сбербанк', alt_name_en: ['Sberbank', ' '], altNames: ['Сбербанк', 'Зелёный'] }),
    raw({ altName: 'Old Name', url: 'https://trace-logos.ru/logos/bank/green2/' }),
    raw({ url: 'https://trace-logos.ru/logos/bank/green3/' }),
  ] });
  assert.deepEqual(a.altNames, ['Сбербанк', 'Sberbank']); // deduped, blanks and the name itself dropped
  assert.deepEqual(b.altNames, ['Old Name']);
  assert.equal(c.altNames, undefined);
  assert.equal('title_head' in a, false);

  // Exact alt-name match beats tag matches of every real Sber logo.
  const withAlt = [...logos, a];
  for (const list of [withAlt, [...withAlt].reverse()]) {
    assert.equal(searchLogos(list, 'сбербанк')[0].slug, 'green');
    assert.equal(searchLogos(list, 'sberbank')[0].slug, 'green');
  }
  assert.equal(searchLogos([...logos, b], 'old name')[0].slug, 'green2');
  // …but stays below an exact official name.
  const named = { ...a, name: 'Other', nameEn: undefined, altNames: ['Telegram'] };
  assert.equal(searchLogos([named, ...logos], 'telegram')[0].slug, 'telegram');
  assert.equal(searchLogos([named, ...logos], 'telegram')[1], named);
});

test('search finds by nameEn and tags', () => {
  assert.equal(first('sbertech'), 'sbertech');
  assert.ok(searchLogos(logos, 'fast fashion').some((l) => l.slug === 'shein'));
});

test('filters, limit, empty query', () => {
  assert.equal(searchLogos(logos, 'сбер', { limit: 2 }).length, 2);
  assert.ok(searchLogos(logos, '', { category: 'bank' }).every((l) => l.category.slug === 'bank'));
  assert.equal(searchLogos(logos, '').length, logos.length);
  assert.equal(searchLogos(logos, 'логотип').length, logos.length); // only stop words
  assert.ok(!searchLogos(logos, 'shein', { hasSvg: true }).some((l) => l.slug === 'shein'));
  assert.equal(first('shein', { hasPng: true }), 'shein');
  assert.deepEqual(searchLogos(logos, 'zzqqxx'), []);
});
