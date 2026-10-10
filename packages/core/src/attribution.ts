import type { Logo } from './types.js';

export const ATTRIBUTION = Object.freeze({ name: "Trace Logo's", url: 'https://trace-logos.ru/' } as const);

/** Human-readable credit line. Never injected into downloaded files automatically. */
export function attributionText(logo?: Pick<Logo, 'name'>): string {
  return logo
    ? `${logo.name} logo via ${ATTRIBUTION.name} — ${ATTRIBUTION.url}`
    : `Logos via ${ATTRIBUTION.name} — ${ATTRIBUTION.url}`;
}
