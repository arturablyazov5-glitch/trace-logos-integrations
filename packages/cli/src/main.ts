import { isTraceLogosError } from '@trace-logos-int/core';
import type { Asset, Catalog, Logo } from '@trace-logos-int/core';
import { TraceLogos } from './index.js';
import { UsageError, parseArgs } from './args.js';
import type { ParsedArgs } from './args.js';
import type { Deps } from './deps.js';
import { OutError, formatSize, resolveTarget, writeAsset } from './download.js';
import { runInteractive } from './interactive.js';
import { HELP, VERSION, describeError } from './messages.js';
import { LookupError, matchVariant, resolveLogo } from './resolve.js';

const DEFAULT_LIMIT = 20;

class OfflineError extends Error {}

function makeClient(args: ParsedArgs, deps: Deps): TraceLogos {
  const offlineFetch = async () => {
    throw new OfflineError('network access is disabled by --offline');
  };
  return new TraceLogos({
    fetch: args.offline ? offlineFetch : deps.fetch,
    cacheDir: deps.cacheDir,
    cache: args.noCache ? false : undefined,
    // --offline: any cached catalog counts as fresh, so no request is ever attempted.
    ...(args.offline ? { ttlMs: Number.POSITIVE_INFINITY } : {}),
  });
}

async function loadCatalog(client: TraceLogos, args: ParsedArgs, deps: Deps): Promise<Catalog> {
  const catalog = await client.load({ force: args.refresh });
  if (catalog.stale) {
    deps.stderr.write(
      `Warning: could not reach trace-logos.ru, using the cached catalog from ${new Date(catalog.fetchedAt).toISOString().slice(0, 10)}.\n`,
    );
  }
  return catalog;
}

function logoJson(client: TraceLogos, l: Logo) {
  return {
    name: l.name,
    ...(l.nameEn ? { nameEn: l.nameEn } : {}),
    slug: l.slug,
    category: l.category.slug,
    categoryName: l.category.name,
    pageUrl: client.pageUrl(l),
    svgUrl: l.svgUrl ?? null,
    pngUrl: l.pngUrl ?? null,
    hasSvg: l.hasSvg,
    hasPng: l.hasPng,
  };
}

const formats = (l: Logo) => [l.hasSvg ? 'svg' : '', l.hasPng ? 'png' : ''].filter(Boolean).join(' ');

export function formatList(logos: readonly Logo[]): string {
  const w = String(logos.length).length;
  return logos
    .map((l, i) => `${String(i + 1).padStart(w)}. ${l.name}  (${l.slug})  ${l.category.name}  [${formats(l)}]`)
    .join('\n');
}

async function cmdSearch(args: ParsedArgs, client: TraceLogos, deps: Deps): Promise<number> {
  await loadCatalog(client, args, deps);
  const query = args.positionals.join(' ');
  const results = client.search(query, {
    limit: args.limit ?? DEFAULT_LIMIT,
    ...(args.category ? { category: args.category } : {}),
  });
  if (args.json) {
    deps.stdout.write(`${JSON.stringify(results.map((l) => logoJson(client, l)), null, 2)}\n`);
    return 0;
  }
  if (results.length === 0) {
    deps.stderr.write(`No logos found${query ? ` for "${query}"` : ''}.\n`);
    return 0;
  }
  if (deps.isTTY) return runInteractive({ client, deps, results });
  deps.stdout.write(`${formatList(results)}\n`);
  return 0;
}

async function pick(args: ParsedArgs, client: TraceLogos, deps: Deps): Promise<Logo> {
  const catalog = await loadCatalog(client, args, deps);
  const { logo, note } = resolveLogo(client, catalog.logos, args.positionals.join(' '));
  if (note) deps.stderr.write(`${note}\n`);
  return logo;
}

async function cmdInfo(args: ParsedArgs, client: TraceLogos, deps: Deps): Promise<number> {
  const logo = await pick(args, client, deps);
  const assets = client.assetsOf(logo);
  if (args.json) {
    deps.stdout.write(`${JSON.stringify({ ...logoJson(client, logo), tags: logo.tags, ecosystem: logo.ecosystem ?? [], assets }, null, 2)}\n`);
    return 0;
  }
  const lines = [
    logo.nameEn && logo.nameEn !== logo.name ? `${logo.name} (${logo.nameEn})` : logo.name,
    `Category:  ${logo.category.name} (${logo.category.slug})`,
    ...(logo.ecosystem?.length ? [`Ecosystem: ${logo.ecosystem.join(', ')}`] : []),
    `Page:      ${client.pageUrl(logo)}`,
    `Formats:   ${formats(logo) || 'none'}`,
    '',
    'Files:',
    ...assets.map((a) => `  ${a.kind.toUpperCase()}  ${a.variant}  ${a.url}`),
  ];
  if (!logo.svgUrl && logo.hasSvg) lines.push('', 'No original SVG; SVG exists only as a variant (use --variant).');
  if (!logo.hasSvg) lines.push('', `No SVG for this logo. PNG: trace-logos get ${logo.slug} --png`);
  deps.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

async function cmdOpen(args: ParsedArgs, client: TraceLogos, deps: Deps): Promise<number> {
  const logo = await pick(args, client, deps);
  const url = client.pageUrl(logo);
  if (await deps.open(url)) {
    deps.stdout.write(`Opened ${url}\n`);
    return 0;
  }
  deps.stderr.write(`Could not open a browser. Page: ${url}\n`);
  return 1;
}

function chooseAsset(args: ParsedArgs, logo: Logo, assets: Asset[]): { asset: Asset; note?: string } {
  const variant = args.variant ? matchVariant(assets, args.variant) : undefined;
  const candidates = variant ? assets.filter((a) => a.variant === variant) : assets.filter((a) => a.variant === 'original');
  const find = (k: 'svg' | 'png') => candidates.find((a) => a.kind === k);
  const want = args.png ? 'png' : 'svg';
  const hit = find(want);
  if (hit) return { asset: hit };
  const other = find(want === 'svg' ? 'png' : 'svg');
  const what = variant ? `variant "${variant}" of ${logo.name}` : logo.name;
  if (other && !args.svg && !args.png) {
    return { asset: other, note: `${what} has no SVG; downloading PNG instead.` };
  }
  if (other) {
    throw new LookupError(
      `${what} has no ${want.toUpperCase()}. A ${other.kind.toUpperCase()} is available: trace-logos get ${logo.slug} --${other.kind}${variant ? ` --variant ${JSON.stringify(variant)}` : ''}`,
    );
  }
  const variants = [...new Set(assets.map((a) => a.variant))].filter((v) => v !== 'original');
  throw new LookupError(
    `${logo.name} has no original file.${variants.length ? ` Pick a variant with --variant: ${variants.join(', ')}` : ''}`,
  );
}

async function cmdGet(args: ParsedArgs, client: TraceLogos, deps: Deps): Promise<number> {
  const logo = await pick(args, client, deps);
  const { asset, note } = chooseAsset(args, logo, client.assetsOf(logo));
  if (note) deps.stderr.write(`${note}\n`);
  if (args.stdout && asset.kind === 'png' && deps.stdout.isTTY) {
    throw new LookupError('Refusing to print binary PNG data to a terminal. Redirect it (> file.png) or use --out.');
  }
  const { bytes } = await client.fetchAsset(asset.url);
  if (args.stdout) {
    deps.stdout.write(asset.kind === 'svg' ? new TextDecoder().decode(bytes) : bytes);
    return 0;
  }
  const filename = client.suggestFilename(logo, asset);
  const target = await resolveTarget(args.out, deps.cwd, asset.filename || filename, asset.kind);
  if ((await writeAsset(target, bytes, args.force)) === 'exists') {
    deps.stderr.write(`File already exists: ${target}\nUse --force to overwrite or --out to choose another location.\n`);
    return 1;
  }
  if (args.json) deps.stdout.write(`${JSON.stringify({ file: target, bytes: bytes.byteLength, url: asset.url })}\n`);
  else deps.stdout.write(`Saved ${target} (${formatSize(bytes.byteLength)})\n`);
  return 0;
}

export async function main(argv: readonly string[], deps: Deps): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.version) {
      deps.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (args.help || !args.command) {
      deps.stdout.write(HELP);
      return args.help ? 0 : 2;
    }
    if (args.command !== 'search' && args.positionals.length === 0) {
      throw new UsageError(`"${args.command}" needs a logo slug or query. Example: trace-logos ${args.command} telegram`);
    }
    const client = makeClient(args, deps);
    switch (args.command) {
      case 'search': return await cmdSearch(args, client, deps);
      case 'get': return await cmdGet(args, client, deps);
      case 'info': return await cmdInfo(args, client, deps);
      case 'open': return await cmdOpen(args, client, deps);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      deps.stderr.write(`${e.message}\nRun "trace-logos --help" for usage.\n`);
      return 2;
    }
    if (e instanceof LookupError || e instanceof OutError) {
      deps.stderr.write(`${e.message}\n`);
      return 1;
    }
    if (isTraceLogosError(e) && e.code === 'NETWORK' && argv.includes('--offline')) {
      deps.stderr.write('Offline mode (--offline): this needs the network, either because no catalog is cached yet or because a file must be downloaded. Run without --offline.\n');
      return 1;
    }
    deps.stderr.write(`${describeError(e)}\n`);
    if (process.env.TRACE_LOGOS_DEBUG && e instanceof Error) deps.stderr.write(`${e.stack ?? ''}\n`);
    return 1;
  }
}
