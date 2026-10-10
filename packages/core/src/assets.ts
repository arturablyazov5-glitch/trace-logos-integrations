import { TraceLogosError } from './errors.js';
import { fetchWithTimeout, httpError, readBodyLimited } from './http.js';
import type { Asset, FetchLike, FetchedAsset, Logo } from './types.js';
import { ALLOWED_ASSET_HOST, safeEncodeUrl, suggestFilename } from './urls.js';

export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Flat list of downloadable files: original SVG/PNG first, then variants. Duplicate URLs are dropped. */
export function assetsOf(logo: Logo): Asset[] {
  const out: Asset[] = [];
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();
  const add = (kind: Asset['kind'], variant: string, url: string | undefined) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    const base = suggestFilename(logo, { kind, variant });
    let filename = base;
    for (let n = 2; seenNames.has(filename); n++) filename = base.replace(/\.(svg|png)$/, `-${n}.$1`);
    seenNames.add(filename);
    out.push({ kind, variant, url, filename });
  };
  add('svg', 'original', logo.svgUrl);
  add('png', 'original', logo.pngUrl);
  for (const v of logo.variants) {
    const label = v.label || 'variant';
    add('svg', label, v.svgUrl);
    add('png', label, v.pngUrl);
  }
  return out;
}

function checkHost(url: string): URL {
  const encoded = safeEncodeUrl(url);
  const u = encoded ? new URL(encoded) : undefined;
  if (!u || u.protocol !== 'https:' || u.hostname !== ALLOWED_ASSET_HOST || u.port !== '' || u.username || u.password) {
    throw new TraceLogosError('FORBIDDEN_HOST', `Only https://${ALLOWED_ASSET_HOST}/ assets can be downloaded: ${url}`);
  }
  return u;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function sniff(bytes: Uint8Array, url: URL, contentType: string): string {
  const isPng = PNG_MAGIC.every((b, i) => bytes[i] === b);
  if (isPng) return 'image/png';
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 64 * 1024)).replace(/^﻿/, '');
  const looksHtml = /^\s*<(!doctype\s+html|html[\s>])/i.test(head);
  if (!looksHtml && /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  const expected = /\.png$/i.test(url.pathname) ? 'PNG' : 'SVG';
  throw new TraceLogosError(
    'INVALID_ASSET',
    `Expected ${expected} from ${url.href}, got ${contentType || 'unknown content'}${looksHtml ? ' (HTML page)' : ''}`,
  );
}

/**
 * Download one asset. Only https://trace-logos.ru URLs (redirects are re-checked hop by hop),
 * 5 MB cap, timeout, content sniffing so an HTML error page is never returned as SVG/PNG.
 */
export async function fetchAsset(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<FetchedAsset> {
  let target = checkHost(url);
  for (let hop = 0; ; hop++) {
    const { res, done } = await fetchWithTimeout(fetchImpl, target.href, { redirect: 'manual' }, timeoutMs);
    try {
      if (res.type === 'opaqueredirect') {
        throw new TraceLogosError('FORBIDDEN_HOST', `Unverifiable redirect from ${target.href}`);
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel().catch(() => {});
        if (!loc) throw httpError(res, target.href);
        if (hop >= MAX_REDIRECTS) throw new TraceLogosError('HTTP', `Too many redirects from ${url}`, { status: res.status });
        target = checkHost(new URL(loc, target).href);
        continue;
      }
      if (res.url) checkHost(res.url);
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw httpError(res, target.href);
      }
      const bytes = await readBodyLimited(res, MAX_ASSET_BYTES, target.href);
      const contentType = sniff(bytes, target, res.headers.get('content-type') ?? '');
      return { bytes, contentType };
    } catch (e) {
      if (e instanceof TraceLogosError) throw e;
      throw new TraceLogosError('NETWORK', `Download of ${target.href} failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    } finally {
      done();
    }
  }
}
