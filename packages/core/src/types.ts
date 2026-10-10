/** Key-value storage for the catalog cache. Sync or async; implement for any host (fs, VS Code globalState, memory). */
export interface CacheStorage {
  get(key: string): Promise<CacheEntry | undefined> | CacheEntry | undefined;
  set(key: string, value: CacheEntry): Promise<void> | void;
}

/** What TraceLogos stores in CacheStorage: the raw catalog body plus revalidation metadata. */
export interface CacheEntry {
  body: string;
  etag?: string;
  /** Epoch ms of the last successful fetch or 304 revalidation. */
  fetchedAt: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TraceLogosOptions {
  /** UTM source: 'npm' | 'vscode' | any other integration id. */
  source: 'npm' | 'vscode' | (string & {});
  /** Default https://trace-logos.ru/logos.json */
  catalogUrl?: string;
  cache?: CacheStorage;
  /** Cache freshness, ms. Default 600000 (10 min, matches the site's max-age). */
  ttlMs?: number;
  fetch?: FetchLike;
  /** Per-request timeout, ms. Default 10000. */
  timeoutMs?: number;
}

export interface Variant {
  label: string;
  svgUrl?: string;
  pngUrl?: string;
  /** Horizontal (wide) lockup rather than a square icon. */
  wide: boolean;
}

export interface Logo {
  name: string;
  nameEn?: string;
  /** Other names the brand is searched by (catalog fields alt_name / alt_name_en / altName / altNames). */
  altNames?: string[];
  /** Last segment of pageUrl, e.g. "telegram". Not unique across categories (bank/alfa, insurance/alfa). */
  slug: string;
  /**
   * Set by normalizeCatalog when another logo in the same catalog has this slug;
   * suggestFilename then prefixes the category ("bank-alfa.svg").
   */
  ambiguousSlug?: boolean;
  category: { slug: string; name: string };
  tags: string[];
  /** Ecosystem keys (some logos belong to several, e.g. ["x5", "artlebedev"]). */
  ecosystem?: string[];
  /** Brand page without tracking params. */
  pageUrl: string;
  svgUrl?: string;
  pngUrl?: string;
  variants: Variant[];
  /** true if the logo or any variant has an SVG URL. */
  hasSvg: boolean;
  /** true if the logo or any variant has a PNG URL. */
  hasPng: boolean;
  dateAdded?: string;
}

export interface Catalog {
  logos: Logo[];
  /** Catalog build date from logos.json ("YYYY-MM-DD"), if present. */
  updated?: string;
  /** Epoch ms when this data was last confirmed by the server. */
  fetchedAt: number;
  /** true when the network failed and an expired cache was returned. */
  stale: boolean;
  /** Number of raw entries dropped as comingSoon or invalid. */
  skipped: number;
}

export interface SearchOptions {
  limit?: number;
  /** Category slug, e.g. "bank". */
  category?: string;
  hasSvg?: boolean;
  hasPng?: boolean;
}

export interface Asset {
  kind: 'svg' | 'png';
  /** 'original' or the variant label. */
  variant: string;
  url: string;
  filename: string;
}

export interface FetchedAsset {
  bytes: Uint8Array;
  contentType: string;
}
