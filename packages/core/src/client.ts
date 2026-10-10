import { assetsOf, fetchAsset } from './assets.js';
import { TraceLogosError } from './errors.js';
import { fetchWithTimeout, httpError, readBodyLimited } from './http.js';
import { normalizeCatalog } from './normalize.js';
import { searchLogos } from './search.js';
import type {
  Asset, CacheEntry, CacheStorage, Catalog, FetchLike, FetchedAsset, Logo, SearchOptions, TraceLogosOptions,
} from './types.js';
import { DEFAULT_CATALOG_URL, cleanPageUrl, pageUrlWithUtm, suggestFilename } from './urls.js';

const MAX_CATALOG_BYTES = 50 * 1024 * 1024;

export class TraceLogos {
  readonly source: string;
  readonly catalogUrl: string;
  readonly ttlMs: number;
  readonly timeoutMs: number;
  private readonly cache: CacheStorage | undefined;
  private readonly fetchImpl: FetchLike;
  private catalog: Catalog | undefined;
  private inflight: Promise<Catalog> | undefined;

  constructor(opts: TraceLogosOptions) {
    if (!opts || typeof opts.source !== 'string' || !opts.source.trim()) {
      throw new TypeError('TraceLogos: options.source is required (e.g. "npm" or "vscode")');
    }
    this.source = opts.source.trim();
    this.catalogUrl = opts.catalogUrl ?? DEFAULT_CATALOG_URL;
    this.ttlMs = opts.ttlMs ?? 600_000;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.cache = opts.cache;
    const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (typeof f !== 'function') throw new TypeError('TraceLogos: no fetch available; pass options.fetch');
    this.fetchImpl = (input, init) => f(input, init);
  }

  private get cacheKey(): string {
    return `catalog:${this.catalogUrl}`;
  }

  /**
   * Fresh cache (within ttlMs) is returned without a request; otherwise revalidates with
   * If-None-Match. On any network/HTTP/parse failure an expired cache is returned with stale: true;
   * without a cache the TraceLogosError is thrown.
   */
  load(opts: { force?: boolean } = {}): Promise<Catalog> {
    if (!opts.force && this.catalog && !this.catalog.stale && Date.now() - this.catalog.fetchedAt < this.ttlMs) {
      return Promise.resolve(this.catalog);
    }
    if (!this.inflight) {
      this.inflight = this.doLoad(!!opts.force).finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  private async readCache(): Promise<CacheEntry | undefined> {
    if (!this.cache) return undefined;
    try {
      const e = await this.cache.get(this.cacheKey);
      return e && typeof e.body === 'string' && typeof e.fetchedAt === 'number' ? e : undefined;
    } catch {
      return undefined;
    }
  }

  private async writeCache(entry: CacheEntry): Promise<void> {
    try {
      await this.cache?.set(this.cacheKey, entry);
    } catch {
      // A broken cache must never break catalog loading.
    }
  }

  private fromBody(body: string, fetchedAt: number, stale: boolean): Catalog {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (e) {
      throw new TraceLogosError('PARSE', `Catalog at ${this.catalogUrl} is not valid JSON`, { cause: e });
    }
    try {
      return { ...normalizeCatalog(json), fetchedAt, stale };
    } catch (e) {
      throw new TraceLogosError('PARSE', `Unexpected catalog format at ${this.catalogUrl}`, { cause: e });
    }
  }

  private async doLoad(force: boolean): Promise<Catalog> {
    const cached = await this.readCache();
    if (!force && cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      try {
        return (this.catalog = this.fromBody(cached.body, cached.fetchedAt, false));
      } catch {
        // Corrupt cache: fall through to the network.
      }
    }
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (cached?.etag) headers['if-none-match'] = cached.etag;
      const { res, done } = await fetchWithTimeout(this.fetchImpl, this.catalogUrl, { headers }, this.timeoutMs);
      let entry: CacheEntry;
      try {
        if (res.status === 304 && cached) {
          entry = { ...cached, fetchedAt: Date.now() };
        } else if (res.ok) {
          const bytes = await readBodyLimited(res, MAX_CATALOG_BYTES, this.catalogUrl);
          entry = { body: new TextDecoder().decode(bytes), fetchedAt: Date.now() };
          const etag = res.headers.get('etag');
          if (etag) entry.etag = etag;
        } else {
          throw httpError(res, this.catalogUrl);
        }
      } catch (e) {
        if (e instanceof TraceLogosError) throw e;
        throw new TraceLogosError('NETWORK', `Reading ${this.catalogUrl} failed`, { cause: e });
      } finally {
        done();
      }
      const catalog = this.fromBody(entry.body, entry.fetchedAt, false);
      await this.writeCache(entry);
      return (this.catalog = catalog);
    } catch (err) {
      if (cached) {
        try {
          return (this.catalog = this.fromBody(cached.body, cached.fetchedAt, true));
        } catch {
          // cache unusable too — report the original error
        }
      }
      throw err;
    }
  }

  /** Searches the loaded catalog (call load() first; returns [] before that). */
  search(query: string, opts?: SearchOptions): Logo[] {
    return searchLogos(this.catalog?.logos ?? [], query, opts);
  }

  /** Brand page with utm_source=<source>&utm_medium=integration&utm_campaign=<slug>[&utm_content]. */
  pageUrl(logo: Logo, opts?: { content?: string }): string {
    return pageUrlWithUtm(logo, this.source, opts);
  }

  cleanPageUrl(logo: Logo): string {
    return cleanPageUrl(logo);
  }

  assetsOf(logo: Logo): Asset[] {
    return assetsOf(logo);
  }

  suggestFilename(logo: Logo, asset: Pick<Asset, 'kind' | 'variant'>): string {
    return suggestFilename(logo, asset);
  }

  fetchAsset(url: string): Promise<FetchedAsset> {
    return fetchAsset(url, this.fetchImpl, this.timeoutMs);
  }
}
