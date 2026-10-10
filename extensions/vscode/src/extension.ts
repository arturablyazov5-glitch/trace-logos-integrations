import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { ATTRIBUTION, TraceLogos } from '@trace-logos-int/core';
import type { Catalog, Logo } from '@trace-logos-int/core';
import { createCatalogCache, createMemoryFs, thumbFileName } from './cache.js';
import type { MiniFs } from './cache.js';
import { debounce, latestGuard, mapLimit } from './debounce.js';
import {
  ACTION_IDS, buildActions, formatInsertion, formatsOf, friendlyError, logoKey, nextFreeName, planDownloadFolder,
  primaryUrl, resultDescription, resultLabel, selectionsOf, thumbKey,
} from './logic.js';
import type { ActionId, Selection } from './logic.js';
import { makeNonce, renderPreviewHtml, toDataUri } from './preview-html.js';

const SEARCH_LIMIT = 50;
const THUMB_COUNT = 20;
const THUMB_CONCURRENCY = 4;
const DEBOUNCE_MS = 150;

interface Ctx {
  /** Folder chosen in the explorer ("Download here"); overrides traceLogos.downloadFolder. */
  targetFolder?: vscode.Uri;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Every modal/user-facing call goes through `ui`, so integration tests (ExtensionMode.Test only)
 * can answer prompts deterministically and intercept env.openExternal. Production uses VS Code as is.
 */
const ui = {
  showQuickPick: ((...a: any[]) => (vscode.window.showQuickPick as any)(...a)) as typeof vscode.window.showQuickPick,
  showWarningMessage: ((...a: any[]) => (vscode.window.showWarningMessage as any)(...a)) as (...a: any[]) => Thenable<any>,
  showInformationMessage: ((...a: any[]) => (vscode.window.showInformationMessage as any)(...a)) as (...a: any[]) => Thenable<any>,
  showErrorMessage: ((...a: any[]) => (vscode.window.showErrorMessage as any)(...a)) as (...a: any[]) => Thenable<any>,
  showOpenDialog: (o: vscode.OpenDialogOptions) => vscode.window.showOpenDialog(o),
  openExternal: (u: vscode.Uri) => vscode.env.openExternal(u),
};
const productionUi = { ...ui };
let lastQuickPick: vscode.QuickPick<LogoItem> | undefined;
let lastPanel: vscode.WebviewPanel | undefined;

let ext: vscode.ExtensionContext;
let client: TraceLogos | undefined;
let lastTextEditor: vscode.TextEditor | undefined;
const thumbs = new Map<string, vscode.Uri | null>();

export function activate(context: vscode.ExtensionContext): unknown {
  ext = context;
  lastTextEditor = vscode.window.activeTextEditor;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e) lastTextEditor = e;
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('traceLogos.catalogUrl') || e.affectsConfiguration('traceLogos.cacheTtlMinutes')) client = undefined;
    }),
    vscode.commands.registerCommand('traceLogos.search', (uri?: unknown) =>
      runSearch({ targetFolder: uri instanceof vscode.Uri ? uri : undefined }),
    ),
    vscode.commands.registerCommand('traceLogos.downloadHere', (uri?: unknown) =>
      runSearch({ targetFolder: uri instanceof vscode.Uri ? uri : undefined }),
    ),
    vscode.commands.registerCommand('traceLogos.refreshCatalog', async () => {
      const cat = await loadCatalog(true);
      if (cat) ui.showInformationMessage(`Trace Logos: catalog updated — ${cat.logos.length} logos.`);
    }),
  );
  if (context.extensionMode !== vscode.ExtensionMode.Test) return undefined;
  // Test-only surface (never returned for installed VSIX in normal use).
  return {
    ui,
    resetUi: () => Object.assign(ui, productionUi),
    resetClient: () => {
      client = undefined;
      thumbs.clear();
    },
    getClient,
    loadCatalog,
    computeItems,
    runActions,
    performAction,
    selectionsOf,
    get lastQuickPick() {
      return lastQuickPick;
    },
    get lastPanel() {
      return lastPanel;
    },
    globalStorageUri: context.globalStorageUri,
  };
}

export function deactivate(): void {
  client = undefined;
}

// ---------- storage ----------

function storageFs(sub: string): MiniFs {
  const dir = vscode.Uri.joinPath(ext.globalStorageUri, sub);
  return {
    async read(name) {
      try {
        return await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, name));
      } catch {
        return undefined;
      }
    },
    async write(name, bytes) {
      await vscode.workspace.fs.createDirectory(dir);
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, name), bytes);
    },
  };
}

function getClient(): TraceLogos {
  if (client) return client;
  const cfg = vscode.workspace.getConfiguration('traceLogos');
  const ttlMin = Math.max(1, Number(cfg.get<number>('cacheTtlMinutes', 60)) || 60);
  const catalogUrl = cfg.get<string>('catalogUrl')?.trim() || undefined;
  let cacheFs: MiniFs;
  try {
    cacheFs = storageFs('catalog');
  } catch {
    cacheFs = createMemoryFs();
  }
  client = new TraceLogos({ source: 'vscode', catalogUrl, ttlMs: ttlMin * 60_000, cache: createCatalogCache(cacheFs) });
  return client;
}

/** Loads the catalog; on failure shows a friendly message with Retry. Returns undefined if the user gave up. */
async function loadCatalog(force = false): Promise<Catalog | undefined> {
  for (;;) {
    try {
      return await getClient().load({ force });
    } catch (err) {
      const fe = friendlyError(err, 'loading the logo catalog');
      const pick = await ui.showErrorMessage(fe.message, ...(fe.retry ? ['Retry'] : []));
      if (pick !== 'Retry') return undefined;
    }
  }
}

// ---------- thumbnails ----------

/**
 * QuickPick icons need a plain file: URI. On desktop globalStorageUri uses the virtual
 * "vscode-userdata" scheme (same on-disk path), which the QuickPick does not render as an icon.
 */
function iconUri(u: vscode.Uri): vscode.Uri {
  return u.scheme === 'vscode-userdata' ? vscode.Uri.file(u.fsPath) : u;
}

async function thumbFor(logo: Logo): Promise<vscode.Uri | undefined> {
  const sel = selectionsOf(logo)[0];
  const url = sel ? primaryUrl(sel) : undefined;
  if (!sel || !url) return undefined;
  const key = thumbKey(logo, url);
  if (thumbs.has(key)) return thumbs.get(key) ?? undefined;
  const dir = vscode.Uri.joinPath(ext.globalStorageUri, 'thumbs');
  const guess = vscode.Uri.joinPath(dir, thumbFileName(key, sel.svgUrl ? 'image/svg+xml' : 'image/png'));
  try {
    await vscode.workspace.fs.stat(guess);
    thumbs.set(key, iconUri(guess));
    return iconUri(guess);
  } catch {
    // not cached yet
  }
  try {
    const asset = await getClient().fetchAsset(url);
    const file = vscode.Uri.joinPath(dir, thumbFileName(key, asset.contentType));
    await vscode.workspace.fs.createDirectory(dir);
    await vscode.workspace.fs.writeFile(file, asset.bytes);
    thumbs.set(key, iconUri(file));
    return iconUri(file);
  } catch {
    thumbs.set(key, null); // no retry within this session; the list works without previews
    return undefined;
  }
}

// ---------- search ----------

interface LogoItem extends vscode.QuickPickItem {
  logo: Logo;
}

function toItem(logo: Logo): LogoItem {
  const item: LogoItem = { label: resultLabel(logo), description: resultDescription(logo), alwaysShow: true, logo };
  const sel = selectionsOf(logo)[0];
  const url = sel ? primaryUrl(sel) : undefined;
  const cached = url ? thumbs.get(thumbKey(logo, url)) : undefined;
  if (cached) item.iconPath = cached;
  return item;
}

/** Lazy previews: only for the first visible results, cached on disk. */
function loadThumbs(logos: Logo[]): Promise<unknown> {
  return mapLimit(logos.slice(0, THUMB_COUNT), THUMB_CONCURRENCY, (l) => thumbFor(l));
}

/** Search results as QuickPick items, with thumbnails for the first results (used by tests). */
async function computeItems(query: string): Promise<LogoItem[]> {
  const logos = getClient().search(query.trim(), { limit: SEARCH_LIMIT });
  await loadThumbs(logos);
  return logos.map(toItem);
}

async function runSearch(ctx: Ctx): Promise<void> {
  const qp = vscode.window.createQuickPick<LogoItem>();
  lastQuickPick = qp;
  qp.title = ctx.targetFolder ? `Trace Logos — download to ${vscode.workspace.asRelativePath(ctx.targetFolder)}` : 'Trace Logos';
  qp.placeholder = 'Search logos (RU/EN, wrong keyboard layout is fine): telegram, сбер, ntktuhfv…';
  qp.matchOnDescription = false;
  qp.busy = true;
  const guard = latestGuard();
  let catalog: Catalog | undefined;

  const render = (query: string) => {
    const token = guard.next();
    if (!catalog) return;
    const q = query.trim();
    const logos = q ? getClient().search(q, { limit: SEARCH_LIMIT }) : [];
    qp.items = logos.map(toItem);
    if (!q) return;
    if (!logos.length) {
      qp.placeholder = `Nothing found for “${q}”`;
      return;
    }
    void loadThumbs(logos).then(() => {
      if (!guard.isLatest(token)) return;
      const active = qp.activeItems[0] ? logoKey(qp.activeItems[0].logo) : undefined;
      const items = logos.map(toItem);
      qp.items = items;
      const again = active ? items.find((i) => logoKey(i.logo) === active) : undefined;
      if (again) qp.activeItems = [again];
    });
  };
  const debounced = debounce(render, DEBOUNCE_MS);

  const picked = new Promise<Logo | undefined>((resolve) => {
    qp.onDidChangeValue((v) => debounced(v));
    qp.onDidAccept(() => {
      const it = qp.selectedItems[0] ?? qp.activeItems[0];
      if (it) {
        resolve(it.logo);
        qp.hide();
      }
    });
    qp.onDidHide(() => {
      debounced.cancel();
      resolve(undefined);
      qp.dispose();
    });
  });
  qp.show();

  catalog = await loadCatalog();
  qp.busy = false;
  if (!catalog) {
    qp.hide();
    return;
  }
  if (catalog.stale) {
    qp.title = `${qp.title} — offline, using cached catalog`;
  }
  render(qp.value);

  const logo = await picked;
  if (logo) await runActions(logo, ctx);
}

// ---------- actions ----------

interface ActionItem extends vscode.QuickPickItem {
  id?: ActionId;
}

function targetEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (active) return active;
  // Webview focused: fall back to the last text editor if it is still visible.
  return lastTextEditor && vscode.window.visibleTextEditors.includes(lastTextEditor) ? lastTextEditor : undefined;
}

async function runActions(logo: Logo, ctx: Ctx): Promise<void> {
  const selections = selectionsOf(logo);
  let sel = selections[0];
  if (!sel) {
    ui.showWarningMessage(`Trace Logos: ${logo.name} has no downloadable files.`);
    return;
  }
  for (;;) {
    const editor = targetEditor();
    const { actions, note } = buildActions(sel, {
      languageId: editor?.document.languageId,
      selectionCount: selections.length,
      targetFolderName: ctx.targetFolder ? vscode.workspace.asRelativePath(ctx.targetFolder) : undefined,
    });
    const items: ActionItem[] = actions.map((a) => ({ label: a.label, description: a.description, id: a.id }));
    if (note) items.push({ label: note, kind: vscode.QuickPickItemKind.Separator });
    const choice = await ui.showQuickPick(items, {
      title: `${logo.name} — ${sel.label} (${formatsOf(sel)})`,
      placeHolder: 'What do you want to do with this logo?',
    });
    if (!choice?.id) return;
    if (choice.id === 'variant') {
      sel = (await pickVariant(logo, selections, sel)) ?? sel;
      continue;
    }
    await performAction(choice.id, logo, sel, ctx);
    return;
  }
}

async function pickVariant(logo: Logo, selections: Selection[], current: Selection): Promise<Selection | undefined> {
  const items = selections.map((s) => ({
    label: s.label,
    description: [formatsOf(s), s.wide ? 'horizontal' : 'square'].join(' · '),
    picked: s === current,
    sel: s,
  }));
  const pick = await ui.showQuickPick(items, { title: `${logo.name} — variants`, placeHolder: 'Choose a variant' });
  return pick?.sel;
}

async function performAction(id: ActionId, logo: Logo, sel: Selection, ctx: Ctx): Promise<void> {
  try {
    switch (id) {
      case 'insertUrl':
      case 'insertMarkup': {
        const url = primaryUrl(sel);
        if (!url) return;
        const editor = targetEditor();
        const text = id === 'insertMarkup' ? formatInsertion(editor?.document.languageId, url, logo.name) : url;
        await insertText(text);
        return;
      }
      case 'copyUrl': {
        const url = primaryUrl(sel);
        if (!url) return;
        await vscode.env.clipboard.writeText(url);
        vscode.window.setStatusBarMessage('Trace Logos: link copied', 3000);
        return;
      }
      case 'downloadSvg':
      case 'downloadPng':
        await download(logo, sel, id === 'downloadSvg' ? 'svg' : 'png', ctx);
        return;
      case 'preview':
        await openPreview(logo, sel, ctx);
        return;
      case 'openSite':
        // Only on explicit user choice.
        await ui.openExternal(vscode.Uri.parse(getClient().pageUrl(logo), true));
        return;
      case 'variant':
        return;
    }
  } catch (err) {
    const fe = friendlyError(err, `${id} for ${logo.name}`);
    const pick = await ui.showErrorMessage(fe.message, ...(fe.retry ? ['Retry'] : []));
    if (pick === 'Retry') await performAction(id, logo, sel, ctx);
  }
}

async function insertText(text: string): Promise<void> {
  const editor = targetEditor();
  if (!editor) {
    await vscode.env.clipboard.writeText(text);
    ui.showInformationMessage('Trace Logos: no open editor — copied to clipboard.');
    return;
  }
  const ok = await editor.edit((b) => {
    for (const s of editor.selections) b.replace(s, text);
  });
  if (!ok) {
    await vscode.env.clipboard.writeText(text);
    ui.showWarningMessage('Trace Logos: could not edit the document — copied to clipboard instead.');
  }
}

// ---------- download ----------

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function resolveFolder(ctx: Ctx): Promise<vscode.Uri | undefined> {
  if (ctx.targetFolder) return ctx.targetFolder;
  const setting = vscode.workspace.getConfiguration('traceLogos').get<string>('downloadFolder');
  const ws = vscode.workspace.workspaceFolders?.[0];
  const plan = planDownloadFolder(setting, !!ws);
  let folder: vscode.Uri;
  if (plan.kind === 'absolute') {
    folder = vscode.Uri.file(plan.path.replace(/^~(?=[\\/])/, homedir()));
  } else if (plan.kind === 'relative' && ws) {
    folder = vscode.Uri.joinPath(ws.uri, ...plan.segments);
  } else {
    const picked = await ui.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Save logo here',
      title: 'Trace Logos: choose a folder for the logo',
    });
    return picked?.[0];
  }
  if (!(await exists(folder))) {
    const label = ws ? vscode.workspace.asRelativePath(folder) : folder.fsPath;
    const ok = await ui.showInformationMessage(`Folder “${label}” does not exist. Create it?`, { modal: true }, 'Create');
    if (ok !== 'Create') return undefined;
    await vscode.workspace.fs.createDirectory(folder);
  }
  return folder;
}

async function download(logo: Logo, sel: Selection, kind: 'svg' | 'png', ctx: Ctx): Promise<void> {
  const url = kind === 'svg' ? sel.svgUrl : sel.pngUrl;
  if (!url) {
    ui.showWarningMessage(`Trace Logos: ${kind.toUpperCase()} is not available for ${logo.name}.`);
    return;
  }
  const folder = await resolveFolder(ctx);
  if (!folder) return;
  let filename = getClient().suggestFilename(logo, { kind, variant: sel.variant });
  let target = vscode.Uri.joinPath(folder, filename);
  if (await exists(target)) {
    const pick = await ui.showWarningMessage(
      `“${filename}” already exists in ${vscode.workspace.asRelativePath(folder)}.`,
      { modal: true },
      'Overwrite',
      'Keep both',
    );
    if (pick === 'Keep both') {
      filename = await nextFreeName(filename, (n) => exists(vscode.Uri.joinPath(folder, n)));
      target = vscode.Uri.joinPath(folder, filename);
    } else if (pick !== 'Overwrite') {
      return;
    }
  }
  const asset = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Trace Logos: downloading ${filename}…` },
    () => getClient().fetchAsset(url),
  );
  await vscode.workspace.fs.writeFile(target, asset.bytes);
  const open = await ui.showInformationMessage(`Trace Logos: saved ${vscode.workspace.asRelativePath(target)}`, 'Open', 'Reveal in Explorer');
  if (open === 'Open') await vscode.commands.executeCommand('vscode.open', target);
  if (open === 'Reveal in Explorer') await vscode.commands.executeCommand('revealInExplorer', target);
}

// ---------- preview ----------

async function openPreview(logo: Logo, initial: Selection, ctx: Ctx): Promise<void> {
  const selections = selectionsOf(logo);
  let sel = initial;
  const panel = vscode.window.createWebviewPanel(
    'traceLogos.preview',
    `${logo.name} — Trace Logos`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { enableScripts: true, localResourceRoots: [], retainContextWhenHidden: false },
  );
  panel.iconPath = vscode.Uri.joinPath(ext.extensionUri, 'media', 'icon.png');
  lastPanel = panel;

  const render = async () => {
    let imageDataUri: string | undefined;
    let imageError: string | undefined;
    const url = primaryUrl(sel);
    try {
      if (url) {
        const asset = await getClient().fetchAsset(url);
        imageDataUri = toDataUri(asset.bytes, asset.contentType);
      }
    } catch (err) {
      imageError = friendlyError(err, 'loading the preview').message;
    }
    const { actions, note } = buildActions(sel, {
      languageId: targetEditor()?.document.languageId,
      selectionCount: selections.length,
      targetFolderName: ctx.targetFolder ? vscode.workspace.asRelativePath(ctx.targetFolder) : undefined,
      inPreview: true,
    });
    panel.webview.html = renderPreviewHtml({
      nonce: makeNonce(),
      cspSource: panel.webview.cspSource,
      name: logo.name,
      category: logo.category.name,
      variantLabel: sel.label,
      formats: formatsOf(sel),
      imageDataUri,
      imageError,
      actions,
      note,
      attribution: { name: ATTRIBUTION.name, url: ATTRIBUTION.url },
    });
  };

  panel.webview.onDidReceiveMessage(async (msg: unknown) => {
    const id = (msg as { type?: unknown; id?: unknown } | null)?.id;
    if ((msg as { type?: unknown } | null)?.type !== 'action' || typeof id !== 'string' || !(ACTION_IDS as readonly string[]).includes(id)) return;
    if (id === 'variant') {
      const next = await pickVariant(logo, selections, sel);
      if (next && next !== sel) {
        sel = next;
        await render();
      }
      return;
    }
    await performAction(id as ActionId, logo, sel, ctx);
  });
  await render();
}

