import type { Asset, Logo } from './types.js';

export const SITE_ORIGIN = 'https://trace-logos.ru';
export const DEFAULT_CATALOG_URL = `${SITE_ORIGIN}/logos.json`;
export const ALLOWED_ASSET_HOST = 'trace-logos.ru';

/**
 * encodeURI that is safe to run on already-encoded input: valid %XX escapes are kept as is,
 * everything else (spaces, Cyrillic, stray '%') is encoded. Returns undefined if the result
 * is not an absolute http(s) URL.
 */
export function safeEncodeUrl(raw: string): string | undefined {
  try {
    const encoded = raw
      .trim()
      .split(/(%[0-9A-Fa-f]{2})/)
      .map((part, i) => (i % 2 === 1 ? part : encodeURI(part)))
      .join('');
    const u = new URL(encoded);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

/** Last non-empty path segment, decoded. */
export function slugFromUrl(url: string): string | undefined {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : undefined;
  } catch {
    return undefined;
  }
}

export function cleanPageUrl(logo: Pick<Logo, 'pageUrl'>): string {
  const u = new URL(logo.pageUrl);
  u.search = '';
  u.hash = '';
  return u.href;
}

/** Brand page link with UTM labels only — no user or device identifiers. */
export function pageUrlWithUtm(
  logo: Pick<Logo, 'pageUrl' | 'slug'>,
  source: string,
  opts: { content?: string } = {},
): string {
  const u = new URL(cleanPageUrl(logo));
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', 'integration');
  u.searchParams.set('utm_campaign', logo.slug);
  if (opts.content) u.searchParams.set('utm_content', opts.content);
  return u.href;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Lowercase ASCII slug: [a-z0-9-_] only, Cyrillic transliterated. */
export function toSafeSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

/**
 * Safe local filename for an asset: "<slug>[-<variant>].<svg|png>", characters [a-z0-9-_.] only,
 * never a path, never starting with a dot. When the slug is shared by several logos
 * (logo.ambiguousSlug, set by normalizeCatalog) the category is prefixed: "bank-alfa.svg".
 */
export function suggestFilename(
  logo: Pick<Logo, 'slug' | 'name'> & Partial<Pick<Logo, 'category' | 'ambiguousSlug'>>,
  asset: Pick<Asset, 'kind' | 'variant'>,
): string {
  const slug = toSafeSlug(logo.slug) || toSafeSlug(logo.name) || 'logo';
  const cat = logo.ambiguousSlug && logo.category ? toSafeSlug(logo.category.slug) : '';
  const base = cat ? `${cat}-${slug}` : slug;
  const variant = asset.variant && asset.variant !== 'original' ? toSafeSlug(asset.variant) : '';
  const ext = asset.kind === 'png' ? 'png' : 'svg';
  return `${variant ? `${base}-${variant}` : base}.${ext}`;
}
