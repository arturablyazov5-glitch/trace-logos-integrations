const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../out-test/logic.cjs');
const { hashKey, thumbFileName } = require('../out-test/cache.cjs');
const { logo } = require('./helpers.cjs');

test('formatInsertion by language', () => {
  const url = 'https://trace-logos.ru/a.svg';
  assert.equal(L.formatInsertion('html', url, 'Tg'), '<img src="https://trace-logos.ru/a.svg" alt="Tg logo">');
  assert.equal(L.formatInsertion('typescriptreact', url, 'Tg'), '<img src="https://trace-logos.ru/a.svg" alt="Tg logo" />');
  assert.equal(L.formatInsertion('markdown', url, 'Tg'), '![Tg logo](https://trace-logos.ru/a.svg)');
  assert.equal(L.formatInsertion('css', url, 'Tg'), 'url("https://trace-logos.ru/a.svg")');
  assert.equal(L.formatInsertion('python', url, 'Tg'), url);
  assert.equal(L.formatInsertion(undefined, url, 'Tg'), url);
});

test('formatInsertion escapes names and URLs', () => {
  assert.equal(L.formatInsertion('html', 'https://x/a.svg', 'A "B" <C> & D'), '<img src="https://x/a.svg" alt="A &quot;B&quot; &lt;C&gt; &amp; D logo">');
  assert.equal(L.formatInsertion('markdown', 'https://x/a (1).svg', 'A [b]'), '![A \\[b\\] logo](https://x/a%20%281%29.svg)');
  assert.equal(L.formatInsertion('css', 'https://x/a".svg', 'A'), 'url("https://x/a%22.svg")');
});

test('primaryUrl prefers SVG and encodes spaces', () => {
  assert.equal(L.primaryUrl({ svgUrl: 'https://trace-logos.ru/a b.svg', pngUrl: 'https://trace-logos.ru/a.png' }), 'https://trace-logos.ru/a%20b.svg');
  assert.equal(L.primaryUrl({ pngUrl: 'https://trace-logos.ru/a.png' }), 'https://trace-logos.ru/a.png');
  assert.equal(L.primaryUrl({}), undefined);
});

test('selectionsOf: original + variants with files', () => {
  const l = logo({
    pngUrl: 'https://trace-logos.ru/t.png',
    variants: [
      { label: 'Full', svgUrl: 'https://trace-logos.ru/t-full.svg', wide: true },
      { label: 'Empty', wide: false },
    ],
  });
  const s = L.selectionsOf(l);
  assert.deepEqual(s.map((x) => x.variant), ['original', 'Full']);
  assert.equal(s[1].wide, true);
  // No original file: first variant becomes the default selection.
  assert.deepEqual(L.selectionsOf(logo({ svgUrl: undefined, variants: [{ label: 'V', pngUrl: 'https://trace-logos.ru/v.png', wide: false }] })).map((x) => x.variant), ['V']);
});

const ids = (r) => r.actions.map((a) => a.id);

test('buildActions: SVG+PNG in an html editor', () => {
  const r = L.buildActions({ variant: 'original', label: 'Original', svgUrl: 'u.svg', pngUrl: 'u.png', wide: false }, { languageId: 'html', selectionCount: 1 });
  assert.deepEqual(ids(r), ['insertUrl', 'insertMarkup', 'downloadSvg', 'downloadPng', 'preview', 'copyUrl', 'openSite']);
  assert.equal(r.note, undefined);
  assert.match(r.actions[0].label, /SVG/);
  assert.match(r.actions[0].description, /cursor/);
});

test('buildActions: PNG-only hides SVG actions and explains', () => {
  const r = L.buildActions({ variant: 'original', label: 'Original', pngUrl: 'u.png', wide: false }, { selectionCount: 1 });
  assert.ok(!ids(r).includes('downloadSvg'));
  assert.ok(!ids(r).includes('insertMarkup'), 'no markup without a markup language');
  assert.match(r.actions[0].label, /PNG/);
  assert.match(r.actions[0].description, /clipboard/);
  assert.match(r.note, /PNG only/);
});

test('buildActions: variants and preview context', () => {
  const sel = { variant: 'original', label: 'Original', svgUrl: 'u.svg', wide: false };
  assert.ok(ids(L.buildActions(sel, { selectionCount: 3 })).includes('variant'));
  assert.ok(!ids(L.buildActions(sel, { selectionCount: 1 })).includes('variant'));
  assert.ok(!ids(L.buildActions(sel, { selectionCount: 1, inPreview: true })).includes('preview'));
  const dl = L.buildActions(sel, { selectionCount: 1, targetFolderName: 'src/img' }).actions.find((a) => a.id === 'downloadSvg');
  assert.equal(dl.description, 'to src/img');
});

test('slug is not unique: identity is category/slug (keys, thumb files)', () => {
  const a = logo({ slug: 'alfa', category: { slug: 'banks', name: 'Банки' } });
  const b = logo({ slug: 'alfa', category: { slug: 'payments', name: 'Платежи' } });
  assert.equal(L.logoKey(a), 'banks/alfa');
  assert.notEqual(L.logoKey(a), L.logoKey(b));
  const url = 'https://trace-logos.ru/assets/logos/svgs/alfa.svg';
  assert.notEqual(L.thumbKey(a, url), L.thumbKey(b, url));
  assert.notEqual(thumbFileName(L.thumbKey(a, url), 'image/svg+xml'), thumbFileName(L.thumbKey(b, url), 'image/svg+xml'));
  assert.equal(hashKey('x'), hashKey('x'));
  assert.match(thumbFileName('k', 'image/png'), /^[0-9a-f]{16}\.png$/);
});

test('resultLabel / resultDescription', () => {
  assert.equal(L.resultLabel({ name: 'Сбер', nameEn: 'Sber' }), 'Сбер (Sber)');
  assert.equal(L.resultLabel({ name: 'Telegram', nameEn: 'telegram' }), 'Telegram');
  assert.equal(L.resultDescription({ category: { name: 'Банки' }, hasSvg: true, hasPng: true, altNames: ['Сбербанк'] }), 'Банки · SVG · PNG · also: Сбербанк');
  assert.equal(L.resultDescription({ category: { name: 'X' }, hasSvg: false, hasPng: true }), 'X · PNG · (PNG only)');
});

test('nextFreeName', async () => {
  const taken = new Set(['a.svg', 'a-2.svg']);
  assert.equal(await L.nextFreeName('b.svg', (n) => taken.has(n)), 'b.svg');
  assert.equal(await L.nextFreeName('a.svg', async (n) => taken.has(n)), 'a-3.svg');
});

test('planDownloadFolder', () => {
  assert.deepEqual(L.planDownloadFolder(undefined, true), { kind: 'relative', segments: ['assets', 'logos'] });
  assert.deepEqual(L.planDownloadFolder('./public/img/', true), { kind: 'relative', segments: ['public', 'img'] });
  assert.deepEqual(L.planDownloadFolder('../outside', true), { kind: 'relative', segments: ['assets', 'logos'] });
  assert.deepEqual(L.planDownloadFolder('assets/logos', false), { kind: 'ask' });
  assert.deepEqual(L.planDownloadFolder('/tmp/logos', false), { kind: 'absolute', path: '/tmp/logos' });
  assert.deepEqual(L.planDownloadFolder('C:\\logos', true), { kind: 'absolute', path: 'C:\\logos' });
});

test('friendlyError', () => {
  const { TraceLogosError } = require('../out-test/core.cjs');
  const net = L.friendlyError(new TraceLogosError('NETWORK', 'x'), 'loading the logo catalog');
  assert.equal(net.retry, true);
  assert.match(net.message, /could not reach trace-logos.ru while loading the logo catalog/);
  const http = L.friendlyError(new TraceLogosError('HTTP', 'x', { status: 503 }), 'y');
  assert.match(http.message, /503/);
  assert.equal(L.friendlyError(new TraceLogosError('FORBIDDEN_HOST', 'x'), 'z').retry, false);
  const plain = L.friendlyError(new Error('boom'), 'x');
  assert.equal(plain.retry, false);
  assert.match(plain.message, /boom/);
});
