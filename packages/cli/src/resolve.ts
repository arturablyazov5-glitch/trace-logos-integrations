import type { Asset, Logo, TraceLogos } from '@trace-logos-int/core';

export class LookupError extends Error {}

/** `slug`, `category/slug`, or a free-text query (best match). `note` is set when the match was fuzzy. */
export function resolveLogo(client: TraceLogos, logos: readonly Logo[], input: string): { logo: Logo; note?: string } {
  const q = input.trim();
  if (!q) throw new LookupError('Specify a logo slug or a search query');
  const lower = q.toLowerCase();
  // The page URL path segment can differ from the catalog category slug (".../logos/finance/walt/" vs "pay"): accept both.
  const pathCat = (l: Logo) => new URL(l.pageUrl).pathname.split('/').filter(Boolean).slice(-2, -1)[0] ?? '';
  const exact = logos.filter(
    (l) =>
      l.slug.toLowerCase() === lower ||
      `${l.category.slug}/${l.slug}`.toLowerCase() === lower ||
      `${pathCat(l)}/${l.slug}`.toLowerCase() === lower,
  );
  if (exact.length === 1) return { logo: exact[0]! };
  if (exact.length > 1) {
    throw new LookupError(
      `"${q}" is ambiguous; use category/slug:\n${exact.map((l) => `  ${pathCat(l)}/${l.slug}  (${l.name}, ${l.category.name})`).join('\n')}`,
    );
  }
  const found = client.search(q, { limit: 5 });
  if (found.length === 0) throw new LookupError(`No logo found for "${q}". Try: trace-logos search ${JSON.stringify(q)}`);
  const logo = found[0]!;
  return { logo, note: `Using best match for "${q}": ${logo.name} (${logo.slug})` };
}

/** Variant label -> asset variant name: exact (case-insensitive), then unique substring. */
export function matchVariant(assets: readonly Asset[], wanted: string): string {
  const names = [...new Set(assets.map((a) => a.variant))];
  const w = wanted.trim().toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === w);
  if (exact) return exact;
  const part = names.filter((n) => n.toLowerCase().includes(w));
  if (part.length === 1) return part[0]!;
  const list = names.map((n) => `  ${n}`).join('\n');
  throw new LookupError(
    part.length > 1 ? `Variant "${wanted}" is ambiguous. Matches:\n${part.map((n) => `  ${n}`).join('\n')}` : `No variant "${wanted}". Available:\n${list}`,
  );
}
