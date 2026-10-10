// Node-only helpers. Kept out of the main entry so the core stays fs-free (browser / VS Code web safe).
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CacheEntry, CacheStorage } from './types.js';

/** CacheStorage backed by one JSON file per key in `dir` (created on first write; atomic replace). */
export function createFileCache(dir: string): CacheStorage {
  const file = (key: string) => join(dir, `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.json`);
  return {
    async get(key) {
      try {
        const v = JSON.parse(await readFile(file(key), 'utf8')) as CacheEntry;
        return v && typeof v === 'object' ? v : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      await mkdir(dir, { recursive: true });
      const target = file(key);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(value), 'utf8');
      await rename(tmp, target);
    },
  };
}

export type { CacheEntry, CacheStorage } from './types.js';
