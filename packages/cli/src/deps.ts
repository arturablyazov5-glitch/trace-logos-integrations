// Everything the CLI touches in the outside world, so tests can replace it.
import type { FetchLike } from '@trace-logos-int/core';
import { copyToClipboard, defaultCacheDir, openInBrowser } from './platform.js';

export interface Deps {
  fetch: FetchLike;
  stdout: { write(chunk: string | Uint8Array): unknown; isTTY?: boolean };
  stderr: { write(chunk: string): unknown };
  stdin: NodeJS.ReadableStream;
  /** Interactive menu is allowed only when both stdin and stdout are terminals. */
  isTTY: boolean;
  cwd: string;
  cacheDir: string;
  /** Copies text to the clipboard; resolves false if no utility is available. */
  copy(text: string): Promise<boolean>;
  /** Opens a URL in the default browser; resolves false on failure. */
  open(url: string): Promise<boolean>;
}

export function realDeps(): Deps {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    isTTY: !!process.stdin.isTTY && !!process.stdout.isTTY,
    cwd: process.cwd(),
    cacheDir: defaultCacheDir(),
    copy: (t) => copyToClipboard(t),
    open: (u) => openInBrowser(u),
  };
}
