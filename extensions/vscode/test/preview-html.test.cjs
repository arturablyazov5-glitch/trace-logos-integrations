const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPreviewHtml, toDataUri, escapeHtml } = require('../out-test/preview-html.cjs');

const base = {
  nonce: 'abc123', cspSource: 'vscode-resource:', name: 'Tg', category: 'Мессенджеры', variantLabel: 'Original', formats: 'SVG',
  actions: [{ id: 'downloadSvg', label: 'Download SVG' }], attribution: { name: "Trace Logo's", url: 'https://trace-logos.ru/' },
};

test('strict CSP with nonce, data: images only, no innerHTML', () => {
  const html = renderPreviewHtml({ ...base, imageDataUri: toDataUri(new TextEncoder().encode('<svg/>'), 'image/svg+xml') });
  assert.match(html, /default-src 'none'; img-src data:; style-src 'nonce-abc123'; script-src 'nonce-abc123'/);
  assert.match(html, /<img id="logo" src="data:image\/svg\+xml;base64,PHN2Zy8\+"/);
  assert.ok(!html.includes('innerHTML'));
  assert.match(html, /data-action="downloadSvg"/);
  assert.match(html, /Logos catalog: Trace Logo&#39;s — https:\/\/trace-logos.ru\//);
});

test('escapes text and rejects non-data image sources', () => {
  const html = renderPreviewHtml({ ...base, name: '<script>alert(1)</script>', imageDataUri: 'javascript:alert(1)' });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('javascript:alert'));
  assert.match(html, /class="error"/);
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});

test('toDataUri uses PNG mime for PNG', () => {
  assert.match(toDataUri(new Uint8Array([0x89, 0x50]), 'image/png'), /^data:image\/png;base64,/);
});
