// Webview HTML for the large preview. Pure string building (unit-tested).
// Security: strict CSP with a per-render nonce; the image is an <img src="data:…"> so SVG scripts
// never run; all text is HTML-escaped; the page script never uses innerHTML.
import type { Action } from './logic.js';

export interface PreviewModel {
  nonce: string;
  /** webview.cspSource (unused for images — data: only — but kept for future local resources). */
  cspSource: string;
  name: string;
  category: string;
  variantLabel: string;
  formats: string;
  /** data:image/svg+xml;base64,… or data:image/png;base64,… ; undefined if the download failed. */
  imageDataUri?: string;
  imageError?: string;
  actions: Action[];
  note?: string;
  attribution: { name: string; url: string };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DATA_URI_RE = /^data:image\/(svg\+xml|png);base64,[A-Za-z0-9+/=]+$/;

export function toDataUri(bytes: Uint8Array, contentType: string): string {
  const mime = contentType === 'image/png' ? 'image/png' : 'image/svg+xml';
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

export function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function renderPreviewHtml(m: PreviewModel): string {
  const nonce = escapeHtml(m.nonce);
  const csp = [
    "default-src 'none'",
    'img-src data:',
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const img =
    m.imageDataUri && DATA_URI_RE.test(m.imageDataUri)
      ? `<img id="logo" src="${m.imageDataUri}" alt="${escapeHtml(`${m.name} logo`)}">`
      : `<p class="error">${escapeHtml(m.imageError ?? 'Preview is not available.')}</p>`;
  const buttons = m.actions
    .map(
      (a) =>
        `<button type="button" data-action="${escapeHtml(a.id)}"${a.description ? ` title="${escapeHtml(a.description)}"` : ''}>${escapeHtml(a.label)}</button>`,
    )
    .join('\n      ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(m.name)}</title>
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px 20px; }
  h1 { font-size: 1.4em; margin: 0 0 4px; }
  .meta { color: var(--vscode-descriptionForeground); margin: 0 0 12px; }
  .stage { display: flex; align-items: center; justify-content: center; min-height: 280px; max-height: 60vh; border-radius: 6px; border: 1px solid var(--vscode-panel-border, transparent); padding: 24px; box-sizing: border-box; }
  .stage img { max-width: 100%; max-height: calc(60vh - 48px); object-fit: contain; }
  .bg-light { background: #ffffff; }
  .bg-dark { background: #1e1e1e; }
  .bg-checker { background-color: #fff; background-image: linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
  .bgs { margin: 8px 0 16px; display: flex; gap: 6px; align-items: center; color: var(--vscode-descriptionForeground); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  button { font: inherit; padding: 6px 12px; border: none; border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .bgs button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); padding: 2px 8px; }
  .note, .error { color: var(--vscode-descriptionForeground); }
  .error { color: var(--vscode-errorForeground); }
  footer { margin-top: 24px; font-size: 0.9em; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h1>${escapeHtml(m.name)}</h1>
  <p class="meta">${escapeHtml([m.category, m.variantLabel, m.formats].filter(Boolean).join(' · '))}</p>
  <div id="stage" class="stage bg-checker">
    ${img}
  </div>
  <div class="bgs">Background:
    <button type="button" data-bg="bg-checker">Checker</button>
    <button type="button" data-bg="bg-light">Light</button>
    <button type="button" data-bg="bg-dark">Dark</button>
  </div>
  ${m.note ? `<p class="note">${escapeHtml(m.note)}</p>` : ''}
  <div class="actions">
      ${buttons}
  </div>
  <footer>Logos catalog: ${escapeHtml(m.attribution.name)} — ${escapeHtml(m.attribution.url)}</footer>
<script nonce="${nonce}">
  (function () {
    const vscode = acquireVsCodeApi();
    const stage = document.getElementById('stage');
    document.querySelectorAll('button[data-action]').forEach(function (b) {
      b.addEventListener('click', function () { vscode.postMessage({ type: 'action', id: b.getAttribute('data-action') }); });
    });
    document.querySelectorAll('button[data-bg]').forEach(function (b) {
      b.addEventListener('click', function () {
        stage.classList.remove('bg-checker', 'bg-light', 'bg-dark');
        stage.classList.add(b.getAttribute('data-bg'));
      });
    });
  })();
</script>
</body>
</html>`;
}
