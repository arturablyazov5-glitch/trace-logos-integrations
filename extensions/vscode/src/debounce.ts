// Pure helpers for "search as you type": trailing debounce and a latest-request guard.

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  /** Runs a pending call right away (no-op if none). */
  flush(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const run = () => {
    timer = undefined;
    const args = pending;
    pending = undefined;
    if (args) fn(...args);
  };
  const d = ((...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  }) as Debounced<A>;
  d.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  d.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  return d;
}

/** Monotonic token: `const t = guard.next(); …await…; if (!guard.isLatest(t)) return;` */
export function latestGuard() {
  let seq = 0;
  return {
    next: () => ++seq,
    isLatest: (token: number) => token === seq,
  };
}

/** Runs async jobs with at most `limit` in flight. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
