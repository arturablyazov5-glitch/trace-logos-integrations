// dist/cli.js (bin, ESM), dist/index.{js,cjs} (library), dist/index.d.{ts,cts} + dist/core-types.d.{ts,cts};
// .build/main.mjs is a test-only bundle (not published). The core is bundled in: zero runtime dependencies.
import { build } from 'esbuild';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const tmp = join(root, '.build');
rmSync(dist, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  external: ['node:*'],
  logLevel: 'warning',
  define: { __CLI_VERSION__: JSON.stringify(pkg.version) },
};
await build({
  ...common,
  entryPoints: [join(root, 'src/bin.ts')],
  outfile: join(dist, 'cli.js'),
  format: 'esm',
  banner: { js: '#!/usr/bin/env node' },
});
chmodSync(join(dist, 'cli.js'), 0o755);
await build({ ...common, entryPoints: [join(root, 'src/index.ts')], outfile: join(dist, 'index.js'), format: 'esm' });
await build({ ...common, entryPoints: [join(root, 'src/index.ts')], outfile: join(dist, 'index.cjs'), format: 'cjs' });
for (const name of ['main', 'args', 'platform']) {
  await build({ ...common, entryPoints: [join(root, `src/${name}.ts`)], outfile: join(tmp, `${name}.mjs`), format: 'esm' });
}

// Type declarations: the core is not published, so its declarations are flattened into core-types.d.ts.
const coreDist = join(dirname(createRequire(import.meta.url).resolve('@trace-logos-int/core')), '.');
const parts = ['types', 'errors', 'urls', 'attribution', 'assets', 'search', 'normalize', 'memory-cache', 'client'];
const flat = parts
  .map((p) => readFileSync(join(coreDist, `${p}.d.ts`), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((l) => !/^import .* from '\.\/.*';$/.test(l) && !/^\/\/# sourceMappingURL/.test(l))
  .join('\n')
  .replace(/^export (declare |interface |type |class )/gm, (_m, k) => (k === 'declare ' ? 'declare ' : k));
const exported = `export { TraceLogos, TraceLogosError, isTraceLogosError, searchLogos, switchLayout, tokenizeQuery, fuzzyMatchToken, STOP_WORDS,
  normalizeCatalog, normalizeLogo, assetsOf, MAX_ASSET_BYTES, suggestFilename, safeEncodeUrl, cleanPageUrl, DEFAULT_CATALOG_URL,
  ATTRIBUTION, attributionText, createMemoryCache };
export type { TraceLogosErrorCode, Asset, CacheEntry, CacheStorage, Catalog, FetchLike, FetchedAsset, Logo, SearchOptions, TraceLogosOptions, Variant };
`;
writeFileSync(join(dist, 'core-types.d.ts'), `${flat}\n${exported}`);
const indexDts = (ext) => `import { TraceLogos as CoreTraceLogos } from './core-types.${ext}';
import type { CacheStorage, TraceLogosOptions } from './core-types.${ext}';
export * from './core-types.${ext}';

/** Options for the npm flavour: \`source\` defaults to 'npm' and the catalog cache lives in the user cache dir. */
export interface NpmTraceLogosOptions extends Omit<TraceLogosOptions, 'source' | 'cache'> {
  source?: TraceLogosOptions['source'];
  /** Custom storage, or \`false\` for no persistence. Default: files in \`defaultCacheDir()\`. */
  cache?: CacheStorage | false;
  /** Directory for the default file cache. */
  cacheDir?: string;
}
export declare class TraceLogos extends CoreTraceLogos {
  constructor(opts?: NpmTraceLogosOptions);
}
/** CacheStorage backed by one JSON file per key in \`dir\`. */
export declare function createFileCache(dir: string): CacheStorage;
/** Per-user cache directory: ~/Library/Caches/trace-logos, %LOCALAPPDATA%\\\\trace-logos\\\\Cache or $XDG_CACHE_HOME/trace-logos. */
export declare function defaultCacheDir(env?: Record<string, string | undefined>, platform?: string, home?: string): string;
`;
writeFileSync(join(dist, 'index.d.ts'), indexDts('js'));
writeFileSync(join(dist, 'core-types.d.cts'), `${flat}\n${exported}`);
writeFileSync(join(dist, 'index.d.cts'), indexDts('cjs').replaceAll(/core-types\.cjs/g, 'core-types.cjs'));

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')], { stdio: 'inherit' });
console.log('cli: built dist/ (cli.js, index.js, index.cjs, d.ts)');
