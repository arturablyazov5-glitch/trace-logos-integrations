// Library entry: the core with source 'npm' and a file cache in the user cache dir.
import { TraceLogos as CoreTraceLogos } from '@trace-logos-int/core';
import type { CacheStorage, TraceLogosOptions } from '@trace-logos-int/core';
import { createFileCache } from '@trace-logos-int/core/node';
import { defaultCacheDir } from './platform.js';

export * from '@trace-logos-int/core';
export { createFileCache, defaultCacheDir };

export interface NpmTraceLogosOptions extends Omit<TraceLogosOptions, 'source' | 'cache'> {
  source?: TraceLogosOptions['source'];
  /** Custom storage, or `false` for no persistence. Default: files in `defaultCacheDir()`. */
  cache?: CacheStorage | false;
  cacheDir?: string;
}

export class TraceLogos extends CoreTraceLogos {
  constructor(opts: NpmTraceLogosOptions = {}) {
    const { source, cache, cacheDir, ...rest } = opts;
    const storage = cache === false ? undefined : (cache ?? createFileCache(cacheDir ?? defaultCacheDir()));
    super({ ...rest, source: source ?? 'npm', ...(storage ? { cache: storage } : {}) });
  }
}
