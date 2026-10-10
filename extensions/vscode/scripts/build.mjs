// Bundles the extension (and, with --test, the pure modules used by unit tests) with esbuild.
// @trace-logos-int/core is inlined; only `vscode` stays external, so the VSIX has no runtime dependencies.
import { build } from 'esbuild';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testMode = process.argv.includes('--test');

// The extension is NOT an npm workspace (its package name must be "trace-logos" for the Marketplace ID,
// which is taken by packages/cli). Core is bundled straight from source via an esbuild alias.
const coreSrc = join(root, '..', '..', 'packages', 'core', 'src', 'index.ts');
if (!existsSync(coreSrc)) {
  console.error(`vscode: core sources not found at ${coreSrc}`);
  process.exit(1);
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  logLevel: 'warning',
  alias: { '@trace-logos-int/core': coreSrc },
};

if (testMode) {
  const out = join(root, 'out-test');
  rmSync(out, { recursive: true, force: true });
  await build({
    ...common,
    entryPoints: [
      ...['logic', 'cache', 'debounce', 'preview-html'].map((n) => ({ in: join(root, 'src', `${n}.ts`), out: n })),
      // Core itself, for tests that drive the real client against the cache adapter.
      { in: coreSrc, out: 'core' },
    ],
    outdir: out,
    outExtension: { '.js': '.cjs' },
    external: ['vscode'],
  });
  console.log('vscode: built out-test/');
} else {
  const dist = join(root, 'dist');
  rmSync(dist, { recursive: true, force: true });
  await build({
    ...common,
    entryPoints: [join(root, 'src', 'extension.ts')],
    outfile: join(dist, 'extension.js'),
    external: ['vscode'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
  });
  if (!existsSync(join(dist, 'extension.js'))) process.exit(1);
  console.log('vscode: built dist/extension.js');
}
