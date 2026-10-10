import { TraceLogosError } from './errors.js';
import type { FetchLike } from './types.js';

/** fetch with a hard timeout; network failures and timeouts become TraceLogosError('NETWORK'). */
export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ res: Response; done: () => void }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    return { res, done: () => clearTimeout(timer) };
  } catch (e) {
    clearTimeout(timer);
    const msg = ctrl.signal.aborted ? `timed out after ${timeoutMs} ms` : e instanceof Error ? e.message : String(e);
    throw new TraceLogosError('NETWORK', `Request to ${url} failed: ${msg}`, { cause: e });
  }
}

/** Reads a body with a byte cap; stops (and cancels the stream) as soon as the cap is exceeded. */
export async function readBodyLimited(res: Response, maxBytes: number, url: string): Promise<Uint8Array> {
  const tooLarge = () =>
    new TraceLogosError('TOO_LARGE', `Response from ${url} exceeds ${Math.round(maxBytes / 1024 / 1024)} MB`);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw tooLarge();
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export function httpError(res: Response, url: string): TraceLogosError {
  return res.status === 404
    ? new TraceLogosError('NOT_FOUND', `Not found: ${url}`, { status: 404 })
    : new TraceLogosError('HTTP', `HTTP ${res.status} from ${url}`, { status: res.status });
}
