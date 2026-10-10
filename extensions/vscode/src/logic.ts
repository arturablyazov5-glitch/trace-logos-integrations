// Pure logic: no `vscode` import, so it is unit-tested with node:test (see test/).
import { safeEncodeUrl } from '@trace-logos-int/core';
import type { TraceLogosErrorCode } from '@trace-logos-int/core';
import type { Logo } from '@trace-logos-int/core';

/** One concrete file set the user works with: the original logo or one of its variants. */
export interface Selection {
  /** 'original' or the variant label (same convention as core `Asset.variant`). */
  variant: string;
  label: string;
  svgUrl?: string;
  pngUrl?: string;
  wide: boolean;
}

export type ActionId =
  | 'insertUrl'
  | 'insertMarkup'
  | 'downloadSvg'
  | 'downloadPng'
  | 'variant'
  | 'preview'
  | 'openSite'
  | 'copyUrl';

export const ACTION_IDS: readonly ActionId[] = [
  'insertUrl', 'insertMarkup', 'downloadSvg', 'downloadPng', 'variant', 'preview', 'openSite', 'copyUrl',
];

export interface Action {
  id: ActionId;
  label: string;
  description?: string;
}

export interface ActionContext {
  /** languageId of the editor the insertion would go to; undefined = no editor (clipboard). */
  languageId?: string;
  /** Number of selectable file sets (original + variants). */
  selectionCount: number;
  /** Explicit download target (explorer "Download here"). */
  targetFolderName?: string;
  /** Actions rendered inside the preview panel (no "Preview" button there). */
  inPreview?: boolean;
}

export function formatsOf(sel: Pick<Selection, 'svgUrl' | 'pngUrl'>): string {
  return [sel.svgUrl ? 'SVG' : '', sel.pngUrl ? 'PNG' : ''].filter(Boolean).join(' · ');
}

/** Original first (if it has any file), then every variant with at least one file. */
export function selectionsOf(logo: Logo): Selection[] {
  const out: Selection[] = [];
  if (logo.svgUrl || logo.pngUrl) {
    out.push({ variant: 'original', label: 'Original', svgUrl: logo.svgUrl, pngUrl: logo.pngUrl, wide: false });
  }
  for (const v of logo.variants) {
    if (!v.svgUrl && !v.pngUrl) continue;
    out.push({ variant: v.label || 'variant', label: v.label || 'Variant', svgUrl: v.svgUrl, pngUrl: v.pngUrl, wide: v.wide });
  }
  return out;
}

/** Link to insert or copy: SVG when available, otherwise PNG. Always encoded (catalog has URLs with spaces). */
export function primaryUrl(sel: Pick<Selection, 'svgUrl' | 'pngUrl'>): string | undefined {
  const raw = sel.svgUrl ?? sel.pngUrl;
  return raw ? safeEncodeUrl(raw) ?? raw : undefined;
}

type MarkupKind = 'html' | 'jsx' | 'markdown' | 'css';

const MARKUP_BY_LANGUAGE: Record<string, MarkupKind> = {
  html: 'html', vue: 'html', svelte: 'html', php: 'html', astro: 'html', handlebars: 'html',
  'vue-html': 'html', erb: 'html', razor: 'html', twig: 'html', jinja: 'html', 'django-html': 'html',
  javascriptreact: 'jsx', typescriptreact: 'jsx', mdx: 'jsx',
  markdown: 'markdown',
  css: 'css', scss: 'css', sass: 'css', less: 'css', stylus: 'css', postcss: 'css',
};

export function markupKind(languageId: string | undefined): MarkupKind | undefined {
  return languageId ? MARKUP_BY_LANGUAGE[languageId] : undefined;
}

const MARKUP_LABEL: Record<MarkupKind, string> = {
  html: 'Insert as <img>',
  jsx: 'Insert as JSX <img />',
  markdown: 'Insert as Markdown image',
  css: 'Insert as CSS url()',
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** %XX for one character (encodeURIComponent leaves ( ) untouched). */
function pctEncode(c: string): string {
  return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

function escapeMarkdownAlt(s: string): string {
  return s.replace(/[\\[\]]/g, (c) => `\\${c}`);
}

/** Text inserted for the given language; plain URL when the language has no markup form. */
export function formatInsertion(languageId: string | undefined, url: string, logoName: string): string {
  const alt = `${logoName} logo`;
  switch (markupKind(languageId)) {
    case 'html':
      return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}">`;
    case 'jsx':
      return `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />`;
    case 'markdown':
      return `![${escapeMarkdownAlt(alt)}](${url.replace(/[()\s]/g, pctEncode)})`;
    case 'css':
      return `url("${url.replace(/["\\\s()]/g, pctEncode)}")`;
    default:
      return url;
  }
}

export interface ActionList {
  actions: Action[];
  /** Explanation shown instead of the hidden SVG actions. */
  note?: string;
}

/** Which actions to offer for the current selection. SVG actions are hidden (and explained) for PNG-only logos. */
export function buildActions(sel: Selection, ctx: ActionContext): ActionList {
  const hasSvg = !!sel.svgUrl;
  const hasPng = !!sel.pngUrl;
  const fmt = hasSvg ? 'SVG' : 'PNG';
  const where = ctx.languageId !== undefined ? 'at cursor' : 'to clipboard (no active editor)';
  const folder = ctx.targetFolderName ? `to ${ctx.targetFolderName}` : 'to project folder';
  const actions: Action[] = [];
  if (hasSvg || hasPng) {
    actions.push({ id: 'insertUrl', label: `Insert ${fmt} link`, description: where });
    const kind = markupKind(ctx.languageId);
    if (kind) actions.push({ id: 'insertMarkup', label: MARKUP_LABEL[kind], description: `${fmt}, ${where}` });
  }
  if (hasSvg) actions.push({ id: 'downloadSvg', label: 'Download SVG', description: folder });
  if (hasPng) actions.push({ id: 'downloadPng', label: 'Download PNG', description: folder });
  if (!ctx.inPreview && (hasSvg || hasPng)) actions.push({ id: 'preview', label: 'Preview', description: 'large preview in a panel' });
  if (ctx.selectionCount > 1) {
    actions.push({ id: 'variant', label: 'Choose variant…', description: `current: ${sel.label} (${ctx.selectionCount} total)` });
  }
  if (hasSvg || hasPng) actions.push({ id: 'copyUrl', label: `Copy ${fmt} link` });
  actions.push({ id: 'openSite', label: "Open on Trace Logo's", description: 'brand page in browser' });
  const note = !hasSvg && hasPng ? 'SVG is not available for this logo — PNG only' : undefined;
  return note ? { actions, note } : { actions };
}

/**
 * Unique identity of a logo. `slug` alone is NOT unique in the catalog (e.g. "alfa", "google"
 * exist in two categories), so every cache key / map key uses "<category.slug>/<slug>".
 */
export function logoKey(logo: Pick<Logo, 'slug' | 'category'>): string {
  return `${logo.category.slug}/${logo.slug}`;
}

/** Cache key of a thumbnail: logo identity + exact file URL. */
export function thumbKey(logo: Pick<Logo, 'slug' | 'category'>, url: string): string {
  return `${logoKey(logo)}|${url}`;
}

/** Description line for a search result: "Category · SVG · PNG · also: alt names". */
export function resultDescription(logo: Pick<Logo, 'category' | 'hasSvg' | 'hasPng' | 'altNames'>): string {
  const formats = [logo.hasSvg ? 'SVG' : '', logo.hasPng ? 'PNG' : ''].filter(Boolean).join(' · ');
  const alt = logo.altNames?.filter(Boolean).slice(0, 3).join(', ');
  return [logo.category.name, formats || undefined, logo.hasSvg ? undefined : '(PNG only)', alt ? `also: ${alt}` : undefined]
    .filter(Boolean)
    .join(' · ');
}

/** Result label: name plus the English name when it differs. */
export function resultLabel(logo: Pick<Logo, 'name' | 'nameEn'>): string {
  return logo.nameEn && logo.nameEn.toLowerCase() !== logo.name.toLowerCase() ? `${logo.name} (${logo.nameEn})` : logo.name;
}

/** "name.svg" -> "name-2.svg", "name-3.svg"… first one for which `exists` is false. */
export async function nextFreeName(filename: string, exists: (name: string) => Promise<boolean> | boolean): Promise<string> {
  if (!(await exists(filename))) return filename;
  const m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(filename);
  const stem = m?.[1] ?? filename;
  const ext = m?.[2] ?? '';
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`No free file name for ${filename}`);
}

export type FolderPlan =
  | { kind: 'absolute'; path: string }
  | { kind: 'relative'; segments: string[] }
  | { kind: 'ask' };

/**
 * How to resolve `traceLogos.downloadFolder`. Relative paths may not escape the workspace folder
 * ("..", empty → default). Absolute paths are taken as is.
 */
export function planDownloadFolder(setting: string | undefined, hasWorkspace: boolean): FolderPlan {
  const value = (setting ?? '').trim() || 'assets/logos';
  if (/^([a-zA-Z]:[\\/]|[\\/]|~[\\/])/.test(value)) {
    return { kind: 'absolute', path: value };
  }
  if (!hasWorkspace) return { kind: 'ask' };
  const segments = value.split(/[\\/]+/).filter((s) => s && s !== '.');
  if (segments.some((s) => s === '..')) return { kind: 'relative', segments: ['assets', 'logos'] };
  return { kind: 'relative', segments: segments.length ? segments : ['assets', 'logos'] };
}

export interface FriendlyError {
  message: string;
  /** Offer a Retry button (network-ish failures). */
  retry: boolean;
}

/** Duck-typed (not instanceof) so it also works across bundled copies of core. */
function coreError(err: unknown): { code: TraceLogosErrorCode; status?: number } | undefined {
  const e = err as { name?: unknown; code?: unknown; status?: unknown } | null;
  return e && e.name === 'TraceLogosError' && typeof e.code === 'string'
    ? { code: e.code as TraceLogosErrorCode, status: typeof e.status === 'number' ? e.status : undefined }
    : undefined;
}

export function friendlyError(err: unknown, what: string): FriendlyError {
  const ce = coreError(err);
  if (ce) {
    const status = ce.status;
    switch (ce.code) {
      case 'NETWORK':
        return { message: `Trace Logos: could not reach trace-logos.ru while ${what}. Check your internet connection or proxy.`, retry: true };
      case 'HTTP':
        return { message: `Trace Logos: the server answered ${status ?? 'with an error'} while ${what}. Try again later.`, retry: true };
      case 'PARSE':
        return { message: `Trace Logos: the catalog could not be read while ${what}. Try again later.`, retry: true };
      case 'TOO_LARGE':
        return { message: `Trace Logos: the file is too large (${what}).`, retry: false };
      case 'FORBIDDEN_HOST':
        return { message: `Trace Logos: refused to download from a host other than trace-logos.ru (${what}).`, retry: false };
      case 'INVALID_ASSET':
        return { message: `Trace Logos: the server returned something that is not an image (${what}). Try again later.`, retry: true };
      case 'NOT_FOUND':
        return { message: `Trace Logos: not found (${what}).`, retry: false };
    }
  }
  const detail = err instanceof Error ? err.message : String(err);
  return { message: `Trace Logos: ${what} failed — ${detail}`, retry: false };
}
