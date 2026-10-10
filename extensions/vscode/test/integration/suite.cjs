// Integration suite, runs inside the VS Code extension host (real API, real network to trace-logos.ru).
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');

const ID = 'trace-logos.trace-logos';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function test(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push(['FAIL', name]);
    console.log(`FAIL ${name}\n${e && e.stack ? e.stack : e}`);
  }
}

async function waitFor(fn, what, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await sleep(100);
  }
}

let api;
let opened = [];
let clipboardWrites = 0;

/** Restore real UI, keep openExternal intercepted (the site must never really open in tests). */
function freshUi() {
  api.resetUi();
  api.ui.openExternal = async (u) => {
    opened.push(u.toString(true));
    return true;
  };
}

/** Scripted QuickPick: answers each call with the item matched by the next matcher. */
function scriptQuickPick(matchers) {
  const calls = [];
  api.ui.showQuickPick = async (items, opts) => {
    const list = await items;
    calls.push({ titles: opts && opts.title, labels: list.map((i) => i.label), items: list });
    const m = matchers.shift();
    if (!m) return undefined;
    const hit = list.find(m);
    assert.ok(hit, `scripted pick not found among: ${list.map((i) => i.label).join(' | ')}`);
    return hit;
  };
  return calls;
}

async function openDoc(language, content = '') {
  const doc = await vscode.workspace.openTextDocument({ language, content });
  return vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
}

function findLogo(category, slug) {
  return api.getClient().search(slug, { limit: 50 }).find((l) => l.category.slug === category && l.slug === slug);
}

/** Optional visual check (macOS): full-screen capture into .vscode-test/screens (gitignored). */
async function shot(name) {
  if (!process.env.TL_SCREENSHOT || process.platform !== 'darwin') return;
  await sleep(1500);
  fs.mkdirSync(process.env.TL_SCREENSHOT, { recursive: true });
  const file = path.join(process.env.TL_SCREENSHOT, name);
  try {
    cp.execFileSync('screencapture', ['-x', file]);
    console.log(`  screenshot: ${file}`);
  } catch (e) {
    console.log(`  screenshot failed: ${e.message}`);
  }
}

const wsDir = () => process.env.TL_WS;
const logosDir = () => path.join(wsDir(), 'assets', 'logos');

async function workspaceSuite() {
  const cfg = () => vscode.workspace.getConfiguration('traceLogos');
  await cfg().update('catalogUrl', undefined, vscode.ConfigurationTarget.Global);
  api.resetClient();
  const catalog = await api.loadCatalog();
  assert.ok(catalog && catalog.logos.length > 500, 'catalog loaded');
  const tg = findLogo('social', 'telegram');
  assert.ok(tg, 'telegram in catalog');
  const sels = api.selectionsOf(tg);

  await test('(a) search: first results', async () => {
    const expected = {
      'вк': 'social/vk', vk: 'social/vk', 'вконтакте': 'social/vk',
      'макс': 'social/max', max: 'social/max', 'сбер': 'bank/sber', ntktuhfv: 'social/telegram',
    };
    for (const [q, key] of Object.entries(expected)) {
      const items = await api.computeItems(q);
      const first = items[0] && `${items[0].logo.category.slug}/${items[0].logo.slug}`;
      assert.equal(first, key, `query "${q}" → ${first} (${items.slice(0, 3).map((i) => i.label).join(', ')})`);
      assert.ok(items.every((i) => i.alwaysShow), 'alwaysShow so VS Code does not re-filter');
    }
    const max = (await api.computeItems('max'))[0];
    assert.match(max.description, /SVG/);
  });

  await test('(b) thumbnails: local file icons for first results, cached in globalStorage', async () => {
    const items = await api.computeItems('сбер');
    const withIcon = items.slice(0, 20).filter((i) => i.iconPath);
    assert.ok(withIcon.length >= Math.min(5, items.length), `icons: ${withIcon.length}/${items.length}`);
    for (const i of withIcon) {
      assert.equal(i.iconPath.scheme, 'file');
      assert.ok(i.iconPath.fsPath.startsWith(api.globalStorageUri.fsPath), 'icon under globalStorage');
      assert.ok(fs.statSync(i.iconPath.fsPath).size > 0);
    }
    assert.ok(items.slice(20).every((i) => !i.iconPath || withIcon.includes(i)) || items.length <= 20);
  });

  await test('(a/b/d) real QuickPick UI: type, icons, accept, insert SVG link into html editor', async () => {
    freshUi();
    const ed = await openDoc('html');
    const run = vscode.commands.executeCommand('traceLogos.search');
    const qp = await waitFor(() => api.lastQuickPick && !api.lastQuickPick.busy && api.lastQuickPick, 'quick pick');
    qp.value = 'ntktuhfv';
    await waitFor(() => qp.items[0] && qp.items[0].logo.slug === 'telegram', 'telegram first in real QuickPick');
    await waitFor(() => qp.items[0].iconPath, 'thumbnail icon on first item');
    assert.equal(qp.items[0].iconPath.scheme, 'file');
    await shot('quickpick.png');
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await sleep(800); // second QuickPick (actions) opens; first entry is "Insert SVG link"
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await run;
    await waitFor(() => ed.document.getText().length > 0, 'inserted text');
    assert.equal(ed.document.getText(), 'https://trace-logos.ru/assets/logos/svgs/telegram.svg');
  });

  await test('(d) insert markup in html / tsx / md, link in plain text', async () => {
    freshUi();
    const url = 'https://trace-logos.ru/assets/logos/svgs/telegram.svg';
    const cases = [
      ['html', 'insertMarkup', `<img src="${url}" alt="Telegram logo">`],
      ['typescriptreact', 'insertMarkup', `<img src="${url}" alt="Telegram logo" />`],
      ['markdown', 'insertMarkup', `![Telegram logo](${url})`],
      ['plaintext', 'insertUrl', url],
    ];
    for (const [lang, action, want] of cases) {
      const ed = await openDoc(lang, 'A|B');
      ed.selection = new vscode.Selection(0, 1, 0, 2); // replace the "|"
      await api.performAction(action, tg, sels[0], {});
      assert.equal(ed.document.getText(), `A${want}B`, lang);
    }
  });

  await test('(c) choose variant, then (f) copy its link', async () => {
    freshUi();
    const target = sels.find((s) => s.label === 'Full');
    assert.ok(target, 'Full variant');
    const calls = scriptQuickPick([(i) => i.id === 'variant', (i) => i.label === 'Full', (i) => i.id === 'copyUrl']);
    await api.runActions(tg, {});
    assert.equal(calls.length, 3);
    assert.match(calls[2].titles, /Full/);
    assert.equal(await vscode.env.clipboard.readText(), target.svgUrl);
  });

  await test('(f) copy link + insert without editor goes to clipboard', async () => {
    freshUi();
    await api.performAction('copyUrl', tg, sels[0], {});
    assert.equal(await vscode.env.clipboard.readText(), 'https://trace-logos.ru/assets/logos/svgs/telegram.svg');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(300);
    const infos = [];
    api.ui.showInformationMessage = async (m) => void infos.push(m);
    await vscode.env.clipboard.writeText('');
    await api.performAction('insertUrl', findLogo('social', 'max'), api.selectionsOf(findLogo('social', 'max'))[0], {});
    assert.match(await vscode.env.clipboard.readText(), /^https:\/\/trace-logos\.ru\/.+\.svg$/);
    assert.match(infos[0], /copied to clipboard/);
  });

  await test('(e) download SVG and PNG into workspace (folder created after confirm)', async () => {
    freshUi();
    const prompts = [];
    api.ui.showInformationMessage = async (m, ...rest) => {
      prompts.push(m);
      return /does not exist/.test(m) ? 'Create' : undefined;
    };
    await api.performAction('downloadSvg', tg, sels[0], {});
    assert.match(prompts[0], /assets\/logos.*does not exist/);
    const svg = fs.readFileSync(path.join(logosDir(), 'telegram.svg'), 'utf8');
    assert.match(svg, /<svg[\s>]/);
    const pngSel = sels.find((s) => s.pngUrl);
    await api.performAction('downloadPng', tg, pngSel, {});
    const pngName = api.getClient().suggestFilename(tg, { kind: 'png', variant: pngSel.variant });
    const png = fs.readFileSync(path.join(logosDir(), pngName));
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${pngName} is PNG`);
    assert.ok(!fs.readdirSync(logosDir()).some((f) => f.includes('/') || f.startsWith('.')));
  });

  await test('(i) existing file: Cancel keeps, Overwrite replaces, Keep both adds -2', async () => {
    freshUi();
    const file = path.join(logosDir(), 'telegram.svg');
    api.ui.showInformationMessage = async () => undefined;
    const answer = (a) => {
      const seen = [];
      api.ui.showWarningMessage = async (m, opts, ...buttons) => {
        seen.push({ m, modal: opts && opts.modal, buttons });
        return a;
      };
      return seen;
    };
    fs.writeFileSync(file, 'OLD');
    let seen = answer(undefined); // Cancel / Esc
    await api.performAction('downloadSvg', tg, sels[0], {});
    assert.equal(fs.readFileSync(file, 'utf8'), 'OLD', 'cancel must not overwrite');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].modal, true);
    assert.deepEqual(seen[0].buttons, ['Overwrite', 'Keep both']);

    seen = answer('Keep both');
    await api.performAction('downloadSvg', tg, sels[0], {});
    assert.equal(fs.readFileSync(file, 'utf8'), 'OLD');
    assert.match(fs.readFileSync(path.join(logosDir(), 'telegram-2.svg'), 'utf8'), /<svg[\s>]/);

    seen = answer('Overwrite');
    await api.performAction('downloadSvg', tg, sels[0], {});
    assert.match(fs.readFileSync(file, 'utf8'), /<svg[\s>]/);
  });

  await test('(k) bank/alfa and insurance/alfa saved as different files', async () => {
    freshUi();
    api.ui.showInformationMessage = async () => undefined;
    api.ui.showWarningMessage = async () => undefined;
    const a = findLogo('bank', 'alfa');
    const b = findLogo('insurance', 'alfa');
    assert.ok(a && b, 'both alfa logos');
    await api.performAction('downloadSvg', a, api.selectionsOf(a)[0], {});
    await api.performAction('downloadSvg', b, api.selectionsOf(b)[0], {});
    const fa = api.getClient().suggestFilename(a, { kind: 'svg', variant: 'original' });
    const fb = api.getClient().suggestFilename(b, { kind: 'svg', variant: 'original' });
    assert.notEqual(fa, fb);
    const ca = fs.readFileSync(path.join(logosDir(), fa), 'utf8');
    const cb = fs.readFileSync(path.join(logosDir(), fb), 'utf8');
    assert.match(ca, /<svg/);
    assert.match(cb, /<svg/);
    console.log(`  alfa files: ${fa}, ${fb}`);
  });

  await test('(b) webview preview: strict CSP, data: image, attribution, actions', async () => {
    freshUi();
    await openDoc('markdown');
    await api.performAction('preview', tg, sels[0], {});
    const panel = api.lastPanel;
    assert.ok(panel, 'panel');
    const html = panel.webview.html;
    assert.match(html, /default-src 'none'; img-src data:; style-src 'nonce-[A-Za-z0-9]{32}'; script-src 'nonce-[A-Za-z0-9]{32}'/);
    assert.match(html, /<img id="logo" src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+"/);
    assert.ok(!/innerHTML/.test(html));
    assert.match(html, /Logos catalog: Trace Logo&#39;s — https:\/\/trace-logos\.ru\//);
    for (const id of ['insertUrl', 'insertMarkup', 'downloadSvg', 'downloadPng', 'variant', 'copyUrl', 'openSite']) {
      assert.match(html, new RegExp(`data-action="${id}"`), id);
    }
    assert.ok(!/data-action="preview"/.test(html));
    await shot('preview.png');
    panel.dispose();
  });

  await test('(g) open on site: only on explicit action, exact page + UTM', async () => {
    assert.deepEqual(opened, [], 'nothing opened by any other flow');
    freshUi();
    await api.performAction('openSite', tg, sels[0], {});
    assert.equal(opened.length, 1);
    const u = new URL(opened[0]);
    assert.equal(u.origin + u.pathname, 'https://trace-logos.ru/logos/social/telegram/');
    assert.equal(u.searchParams.get('utm_source'), 'vscode');
    assert.equal(u.searchParams.get('utm_medium'), 'integration');
    assert.equal(u.searchParams.get('utm_campaign'), 'telegram');
    assert.equal([...u.searchParams.keys()].length, 3);
  });

  await test('(h1) offline without cache: friendly error with Retry, retry works', async () => {
    freshUi();
    const errors = [];
    const answers = ['Retry', undefined];
    api.ui.showErrorMessage = async (m, ...buttons) => {
      errors.push({ m, buttons });
      return answers.shift();
    };
    await cfg().update('catalogUrl', 'http://127.0.0.1:9/logos.json', vscode.ConfigurationTarget.Global);
    api.resetClient();
    const res = await api.loadCatalog();
    assert.equal(res, undefined);
    assert.equal(errors.length, 2, 'Retry re-attempted once, then gave up');
    assert.match(errors[0].m, /could not reach trace-logos\.ru/);
    assert.deepEqual(errors[0].buttons, ['Retry']);
  });

  await test('(h2) stale-if-error: warm cache, server down → cached catalog (stale)', async () => {
    freshUi();
    const body = await (await fetch('https://trace-logos.ru/logos.json')).text();
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', etag: '"t1"' });
      res.end(body);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/logos.json`;
    await cfg().update('catalogUrl', url, vscode.ConfigurationTarget.Global);
    api.resetClient();
    const warm = await api.loadCatalog();
    assert.equal(warm.stale, false);
    await new Promise((r) => server.close(r));
    server.closeAllConnections && server.closeAllConnections();
    api.resetClient();
    const errors = [];
    api.ui.showErrorMessage = async (m) => void errors.push(m);
    const cold = await api.loadCatalog(true);
    assert.ok(cold, 'catalog from cache');
    assert.equal(cold.stale, true);
    assert.equal(cold.logos.length, warm.logos.length);
    assert.equal(errors.length, 0, 'no error when cache is usable');
    assert.equal((await api.computeItems('сбер'))[0].logo.slug, 'sber');
    await cfg().update('catalogUrl', undefined, vscode.ConfigurationTarget.Global);
    api.resetClient();
  });
}

async function noWorkspaceSuite() {
  await test('(j) no workspace: folder picked via open dialog', async () => {
    freshUi();
    assert.equal(vscode.workspace.workspaceFolders, undefined);
    await api.loadCatalog();
    const tg = findLogo('social', 'telegram');
    const dialogs = [];
    api.ui.showOpenDialog = async (o) => {
      dialogs.push(o);
      return [vscode.Uri.file(process.env.TL_PICK_DIR)];
    };
    api.ui.showInformationMessage = async () => undefined;
    await api.performAction('downloadSvg', tg, api.selectionsOf(tg)[0], {});
    assert.equal(dialogs.length, 1);
    assert.equal(dialogs[0].canSelectFolders, true);
    assert.match(fs.readFileSync(path.join(process.env.TL_PICK_DIR, 'telegram.svg'), 'utf8'), /<svg/);

    // Dialog cancelled → nothing written, no error.
    api.ui.showOpenDialog = async () => undefined;
    fs.rmSync(path.join(process.env.TL_PICK_DIR, 'telegram.svg'));
    await api.performAction('downloadSvg', tg, api.selectionsOf(tg)[0], {});
    assert.equal(fs.existsSync(path.join(process.env.TL_PICK_DIR, 'telegram.svg')), false);
  });
}

exports.run = async () => {
  const ext = vscode.extensions.getExtension(ID);
  assert.ok(ext, `${ID} not found`);
  api = await ext.activate();
  assert.ok(api && api.ui, 'test API (ExtensionMode.Test)');
  const cmds = await vscode.commands.getCommands(true);
  await test('activation: commands registered', async () => {
    for (const c of ['traceLogos.search', 'traceLogos.downloadHere', 'traceLogos.refreshCatalog']) assert.ok(cmds.includes(c), c);
  });
  if (process.env.TL_SUITE === 'noworkspace') await noWorkspaceSuite();
  else await workspaceSuite();
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${process.env.TL_SUITE}: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) throw new Error(`${failed.length} integration test(s) failed`);
};
