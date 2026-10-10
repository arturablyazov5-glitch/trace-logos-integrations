// ESM + CJS bundles via esbuild, declarations via tsc (strict).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });

const entries = [
  { name: 'index', platform: 'neutral' },
  { name: 'node', platform: 'node' },
];
for (const { name, platform } of entries) {
  for (const format of ['esm', 'cjs']) {
    await build({
      entryPoints: [join(root, 'src', `${name}.ts`)],
      outfile: join(dist, `${name}.${format === 'esm' ? 'js' : 'cjs'}`),
      bundle: true,
      format,
      platform,
      target: 'es2022',
      // node.ts must not inline a second copy of core state; it only needs node: builtins.
      external: ['node:*'],
      logLevel: 'warning',
    });
  }
}

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')], { stdio: 'inherit' });
for (const { name } of entries) copyFileSync(join(dist, `${name}.d.ts`), join(dist, `${name}.d.cts`));
console.log('core: built dist/ (esm, cjs, d.ts)');
