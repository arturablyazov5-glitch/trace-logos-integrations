// Interactive menu on node:readline. Lines are queued, so piped/scripted input is not lost between prompts.
import type { Asset, Logo, TraceLogos } from '@trace-logos-int/core';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { Writable } from 'node:stream';
import type { Deps } from './deps.js';
import { formatSize, writeAsset } from './download.js';
import { ATTRIBUTION_LINE, describeError } from './messages.js';

class Prompter {
  private readonly queue: string[] = [];
  private waiter: ((l: string | undefined) => void) | undefined;
  private closed = false;
  private readonly rl;
  private readonly terminal: boolean;

  constructor(private readonly deps: Deps) {
    this.terminal = !!(deps.stdin as { isTTY?: boolean }).isTTY;
    this.rl = createInterface({
      input: deps.stdin,
      output: deps.stdout as unknown as Writable,
      terminal: this.terminal,
    });
    this.rl.on('line', (l) => {
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = undefined;
        w(l);
      } else this.queue.push(l);
    });
    this.rl.on('close', () => {
      this.closed = true;
      this.waiter?.(undefined);
      this.waiter = undefined;
    });
  }

  /** Next line, or undefined on EOF / Ctrl-D / Ctrl-C. */
  ask(prompt: string): Promise<string | undefined> {
    if (this.terminal) {
      this.rl.setPrompt(prompt);
      this.rl.prompt();
    } else this.deps.stdout.write(prompt);
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  close(): void {
    this.rl.close();
  }
}

const isQuit = (a: string | undefined) => a === undefined || /^(q|quit|exit)$/i.test(a.trim());

function parseChoice(a: string, max: number): number | undefined {
  const n = Number(a.trim());
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
}

interface Ctx {
  client: TraceLogos;
  deps: Deps;
  results: readonly Logo[];
}

type Menu = { label: string; run: () => Promise<'back' | 'quit' | void> };

export async function runInteractive(ctx: Ctx): Promise<number> {
  const { deps, results, client } = ctx;
  const p = new Prompter(deps);
  const out = (s: string) => void deps.stdout.write(`${s}\n`);

  const copyLink = async (what: string, url: string) => {
    if (await deps.copy(url)) out(`Copied ${what} link to the clipboard.`);
    else out(`No clipboard utility found. ${what} link:\n${url}`);
  };

  const download = async (logo: Logo, asset: Asset) => {
    try {
      const { bytes } = await client.fetchAsset(asset.url);
      const target = join(deps.cwd, client.suggestFilename(logo, asset));
      let res = await writeAsset(target, bytes, false);
      if (res === 'exists') {
        const a = await p.ask(`${target} exists. Overwrite? [y/N] `);
        if (a && /^y(es)?$/i.test(a.trim())) res = await writeAsset(target, bytes, true);
        else return out('Skipped.');
      }
      out(`Saved ${target} (${formatSize(bytes.byteLength)})`);
    } catch (e) {
      out(describeError(e));
    }
  };

  const logoMenu = async (logo: Logo): Promise<'back' | 'quit'> => {
    const assets = client.assetsOf(logo);
    const variants = [...new Set(assets.map((a) => a.variant))];
    let variant = variants.includes('original') ? 'original' : (variants[0] ?? 'original');
    for (;;) {
      const cur = assets.filter((a) => a.variant === variant);
      const svg = cur.find((a) => a.kind === 'svg');
      const png = cur.find((a) => a.kind === 'png');
      const items: Menu[] = [];
      if (svg) items.push({ label: 'Copy SVG link', run: () => copyLink('SVG', svg.url) });
      if (png) items.push({ label: 'Copy PNG link', run: () => copyLink('PNG', png.url) });
      if (svg) items.push({ label: 'Download SVG', run: () => download(logo, svg) });
      if (png) items.push({ label: 'Download PNG', run: () => download(logo, png) });
      if (!svg && png) out(`(No SVG for "${variant}" — PNG only.)`);
      if (variants.length > 1) {
        items.push({
          label: 'Choose variant',
          run: async () => {
            out('Variants:');
            variants.forEach((v, i) => out(`  ${i + 1}. ${v}`));
            const a = await p.ask('Variant number (Enter to cancel): ');
            if (a === undefined) return 'quit';
            const n = parseChoice(a, variants.length);
            if (n) variant = variants[n - 1]!;
          },
        });
      }
      items.push({
        label: 'Open brand page in browser',
        run: async () => {
          const url = client.pageUrl(logo);
          if (await deps.open(url)) out(`Opened ${url}`);
          else out(`Could not open a browser. Page: ${url}`);
        },
      });
      items.push({ label: 'Back to results', run: async () => 'back' });
      items.push({ label: 'Quit', run: async () => 'quit' });

      out(`\n${logo.name}${variant !== 'original' ? ` — ${variant}` : ''}`);
      items.forEach((it, i) => out(`  ${i + 1}. ${it.label}`));
      const a = await p.ask(`Action [1-${items.length}]: `);
      if (isQuit(a)) return 'quit';
      const n = parseChoice(a!, items.length);
      if (!n) {
        out('Please enter a number from the list, or q to quit.');
        continue;
      }
      const r = await items[n - 1]!.run();
      if (r) return r;
    }
  };

  try {
    for (;;) {
      out('');
      results.forEach((l, i) => out(`  ${String(i + 1).padStart(String(results.length).length)}. ${l.name}  (${l.slug})  ${l.category.name}`));
      const a = await p.ask(`\nSelect a logo [1-${results.length}] or q to quit: `);
      if (isQuit(a)) break;
      const n = parseChoice(a!, results.length);
      if (!n) {
        out('Please enter a number from the list, or q to quit.');
        continue;
      }
      if ((await logoMenu(results[n - 1]!)) === 'quit') break;
    }
  } finally {
    p.close();
  }
  out(`\n${ATTRIBUTION_LINE}`);
  return 0;
}
