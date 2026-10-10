import { readFileSync } from 'node:fs';

export const FIXTURE_TEXT = readFileSync(new URL('./fixtures/logos.json', import.meta.url), 'utf8');
export const FIXTURE = JSON.parse(FIXTURE_TEXT);

/** Scripted fetch: each call shifts the next handler; records requests. */
export function mockFetch(...handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init, headers: new Headers(init.headers) });
    const h = handlers.shift();
    if (!h) throw new Error(`unexpected fetch ${url}`);
    return h(url, init);
  };
  fn.calls = calls;
  return fn;
}

export const ok = (body, headers = {}) => () => new Response(body, { status: 200, headers });
export const status = (code, headers = {}) => () => new Response(code === 304 ? null : 'err', { status: code, headers });
export const fail = (msg = 'ECONNRESET') => () => { throw new TypeError(`fetch failed: ${msg}`); };
