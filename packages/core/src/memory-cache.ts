import type { CacheEntry, CacheStorage } from './types.js';

/** In-process CacheStorage (no persistence). */
export function createMemoryCache(): CacheStorage {
  const map = new Map<string, CacheEntry>();
  return { get: (k) => map.get(k), set: (k, v) => void map.set(k, v) };
}
