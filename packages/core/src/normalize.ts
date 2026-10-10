import type { Logo, Variant } from './types.js';
import { safeEncodeUrl, slugFromUrl } from './urls.js';

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Asset URL from the API, encoded; the comingSoon placeholder counts as "no asset". */
function assetUrl(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const url = safeEncodeUrl(s);
  if (!url || /\/placeholder\.svg$/i.test(new URL(url).pathname)) return undefined;
  return url;
}

function normalizeVariant(v: unknown): Variant | undefined {
  if (!isObj(v)) return undefined;
  const svgUrl = assetUrl(v.svgUrl);
  const pngUrl = assetUrl(v.pngUrl);
  if (!svgUrl && !pngUrl) return undefined;
  const out: Variant = { label: str(v.label) ?? '', wide: v.wide === true };
  if (svgUrl) out.svgUrl = svgUrl;
  if (pngUrl) out.pngUrl = pngUrl;
  return out;
}

/**
 * One raw logos.json entry -> Logo, or undefined for comingSoon / invalid entries.
 * hasSvg/hasPng are derived from actual URLs only: the API's `formats` field is not reliable.
 */
export function normalizeLogo(raw: unknown): Logo | undefined {
  if (!isObj(raw) || raw.comingSoon === true) return undefined;
  const name = str(raw.name);
  const pageUrlRaw = str(raw.url);
  const catSlug = str(raw.categorySlug);
  if (!name || !pageUrlRaw || !catSlug) return undefined;
  const pageUrl = safeEncodeUrl(pageUrlRaw);
  if (!pageUrl) return undefined;
  const u = new URL(pageUrl);
  u.search = '';
  u.hash = '';
  const slug = slugFromUrl(u.href);
  if (!slug) return undefined;

  const svgUrl = assetUrl(raw.svgUrl);
  const pngUrl = assetUrl(raw.pngUrl);
  const variants = Array.isArray(raw.variants)
    ? raw.variants.map(normalizeVariant).filter((v): v is Variant => v !== undefined)
    : [];
  if (!svgUrl && !pngUrl && variants.length === 0) return undefined;

  const tags = typeof raw.tags === 'string'
    ? [...new Set(raw.tags.split(/\s+/).filter(Boolean))]
    : Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string' && t !== '') : [];
  const eco = typeof raw.ecosystem === 'string'
    ? [raw.ecosystem]
    : Array.isArray(raw.ecosystem) ? raw.ecosystem.filter((e): e is string => typeof e === 'string' && e !== '') : [];

  const logo: Logo = {
    name,
    slug,
    category: { slug: catSlug, name: str(raw.categoryName) ?? catSlug },
    tags,
    pageUrl: u.href,
    variants,
    hasSvg: !!svgUrl || variants.some((v) => v.svgUrl),
    hasPng: !!pngUrl || variants.some((v) => v.pngUrl),
  };
  const nameEn = str(raw.name_en);
  if (nameEn) logo.nameEn = nameEn;
  const altNames = [
    ...new Set(
      [raw.alt_name, raw.alt_name_en, raw.altName, raw.altNames]
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .map(str)
        .filter((v): v is string => v !== undefined && v !== name && v !== nameEn),
    ),
  ];
  if (altNames.length) logo.altNames = altNames;
  if (eco.length) logo.ecosystem = eco;
  if (svgUrl) logo.svgUrl = svgUrl;
  if (pngUrl) logo.pngUrl = pngUrl;
  const dateAdded = str(raw.dateAdded);
  if (dateAdded) logo.dateAdded = dateAdded;
  return logo;
}

export function normalizeCatalog(json: unknown): { logos: Logo[]; updated?: string; skipped: number } {
  const list = Array.isArray(json) ? json : isObj(json) && Array.isArray(json.logos) ? json.logos : undefined;
  if (!list) throw new TypeError('logos.json: expected { logos: [...] }');
  const logos: Logo[] = [];
  for (const raw of list) {
    const logo = normalizeLogo(raw);
    if (logo) logos.push(logo);
  }
  // Slugs are unique only within a category; mark collisions so filenames can be disambiguated.
  // Depends only on the set of slugs, not on entry order.
  const slugCount = new Map<string, number>();
  for (const l of logos) slugCount.set(l.slug, (slugCount.get(l.slug) ?? 0) + 1);
  for (const l of logos) if ((slugCount.get(l.slug) ?? 0) > 1) l.ambiguousSlug = true;
  const out: { logos: Logo[]; updated?: string; skipped: number } = { logos, skipped: list.length - logos.length };
  const updated = isObj(json) ? str(json.updated) : undefined;
  if (updated) out.updated = updated;
  return out;
}
