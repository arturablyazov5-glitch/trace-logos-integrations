import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

export type WriteResult = 'written' | 'exists';

/** Writes bytes, creating parent directories. Without `force` an existing file is never touched (exclusive create). */
export async function writeAsset(path: string, bytes: Uint8Array, force: boolean): Promise<WriteResult> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: force ? 'w' : 'wx' });
    return 'written';
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return 'exists';
    throw e;
  }
}

export class OutError extends Error {}

/**
 * --out semantics: an existing directory or a path ending in a separator or without .svg/.png extension is a
 * directory (the safe filename is appended); a path ending in .svg/.png is the exact file.
 */
export async function resolveTarget(out: string | undefined, cwd: string, filename: string, kind: 'svg' | 'png'): Promise<string> {
  if (!out) return resolve(cwd, filename);
  const p = resolve(cwd, out);
  const isDir = await stat(p).then((s) => s.isDirectory(), () => false);
  const ext = extname(p).toLowerCase();
  if (isDir || /[\\/]$/.test(out) || (ext !== '.svg' && ext !== '.png')) return resolve(p, filename);
  if (ext.slice(1) !== kind) throw new OutError(`--out ${out} has a ${ext} extension but the file is ${kind.toUpperCase()}`);
  return p;
}

export function formatSize(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}
