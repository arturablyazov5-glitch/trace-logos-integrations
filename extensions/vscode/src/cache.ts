// Storage adapters on top of a tiny file API, so the logic is testable without VS Code.
// In the extension MiniFs is backed by vscode.workspace.fs under context.globalStorageUri.
import type { CacheEntry, CacheStorage } from '@trace-logos-int/core';

export interface MiniFs {
  /** undefined when the file does not exist. */
  read(name: string): Promise<Uint8Array | undefined>;
  write(name: string, bytes: Uint8Array): Promise<void>;
}

/** FNV-1a 32-bit ×2 (different seeds) → 16 hex chars. Stable file names for arbitrary keys/URLs. */
export function hashKey(s: string): string {
  const h = (seed: number) => {
    let x = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, '0');
  };
  return h(0x811c9dc5) + h(0x01000193 ^ 0x5bd1e995);
}

export function cacheFileName(key: string): string {
  return `catalog-${hashKey(key)}.json`;
}

/** File name for a cached thumbnail; extension decides how VS Code renders the icon. */
export function thumbFileName(url: string, contentType: string): string {
  return `${hashKey(url)}.${contentType === 'image/png' ? 'png' : 'svg'}`;
}

/** core CacheStorage over MiniFs. Corrupt or missing files read as "no cache"; errors never escape get(). */
export function createCatalogCache(fs: MiniFs): CacheStorage {
  return {
    async get(key) {
      try {
        const bytes = await fs.read(cacheFileName(key));
        if (!bytes) return undefined;
        const v = JSON.parse(new TextDecoder().decode(bytes)) as CacheEntry;
        return v && typeof v.body === 'string' && typeof v.fetchedAt === 'number' ? v : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      await fs.write(cacheFileName(key), new TextEncoder().encode(JSON.stringify(value)));
    },
  };
}

/** In-memory MiniFs (tests, and a fallback if globalStorage is unavailable). */
export function createMemoryFs(): MiniFs & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    read: async (name) => files.get(name),
    write: async (name, bytes) => void files.set(name, bytes),
  };
}
