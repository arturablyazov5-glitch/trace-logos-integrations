import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

export const { main } = await import('../.build/main.mjs');
export const FIXTURE_TEXT = readFileSync(new URL('../../core/tests/fixtures/logos.json', import.meta.url), 'utf8');

export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>';
export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Fake trace-logos.ru: catalog + assets. `fail` makes every request reject like a dead network. */
export function fakeSite({ fail = false, catalogStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push(String(url));
    if (fail) throw new TypeError('fetch failed: ENOTFOUND');
    const u = new URL(url);
    if (u.pathname === '/logos.json') {
      return new Response(catalogStatus === 200 ? FIXTURE_TEXT : 'err', { status: catalogStatus, headers: { etag: '"v1"' } });
    }
    if (u.pathname.endsWith('.svg')) return new Response(SVG, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
    if (u.pathname.endsWith('.png')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('nope', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

export function makeEnv({ fetch = fakeSite(), isTTY = false, input = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tl-cli-'));
  const out = [];
  const err = [];
  const outStream = new Writable({ write(c, _e, cb) { out.push(Buffer.from(c)); cb(); } });
  const stdin = new PassThrough();
  if (input) stdin.end(input);
  const copied = [];
  const opened = [];
  const env = {
    root,
    cwd: join(root, 'cwd'),
    cacheDir: join(root, 'cache'),
    fetch,
    copied,
    opened,
    copyResult: true,
    openResult: true,
    get stdout() { return Buffer.concat(out).toString('utf8'); },
    get stderr() { return err.join(''); },
    stdoutBytes: () => Buffer.concat(out),
    reset() { out.length = 0; err.length = 0; },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
  env.deps = {
    fetch,
    stdout: Object.assign(outStream, { isTTY: false }),
    stderr: { write: (s) => void err.push(s) },
    stdin,
    isTTY,
    cwd: env.cwd,
    cacheDir: env.cacheDir,
    copy: async (t) => { copied.push(t); return env.copyResult; },
    open: async (u) => { opened.push(u); return env.openResult; },
  };
  return env;
}

export async function run(env, ...argv) {
  await import('node:fs').then((fs) => fs.mkdirSync(env.cwd, { recursive: true }));
  const code = await main(argv, env.deps);
  await new Promise((r) => setImmediate(r));
  return code;
}
