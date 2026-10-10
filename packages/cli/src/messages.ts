import { ATTRIBUTION, isTraceLogosError } from '@trace-logos-int/core';

declare const __CLI_VERSION__: string;
export const VERSION: string = typeof __CLI_VERSION__ === 'string' ? __CLI_VERSION__ : '0.0.0-dev';

export const ATTRIBUTION_LINE = `Logos catalog: ${ATTRIBUTION.name} — ${ATTRIBUTION.url}`;

export const HELP = `trace-logos ${VERSION} — find and download brand logos (SVG/PNG)

Usage:
  trace-logos search <query> [--limit N] [--category slug] [--json]
  trace-logos get <slug|query> [--svg|--png] [--variant label] [--out dir|file] [--stdout] [--force]
  trace-logos info <slug|query>
  trace-logos open <slug|query>

Commands:
  search   Search the catalog (RU or EN, wrong keyboard layout is fixed automatically).
           In a terminal it opens an interactive menu; with --json or a pipe it prints a list.
  get      Download a logo into the current directory (or --out). Never overwrites without --force.
           --stdout prints an SVG to standard output.
  info     Show brand page, formats, variants and direct links.
  open     Open the brand page in your browser (only when you run this command).

Options:
  --limit, -n N       Max results for search (default 20)
  --category, -c S    Only this category slug
  --json              Machine-readable output
  --svg | --png       Pick the format (default: SVG, PNG if there is no SVG)
  --variant LABEL     Logo variant (see "info"), e.g. --variant "Premium"
  --out, -o PATH      Directory or file for "get"
  --force, -f         Overwrite an existing file
  --no-cache          Do not read or write the on-disk catalog cache
  --refresh           Ignore cache freshness and re-check the catalog now
  --offline           Use only the cached catalog, no network
  --help, -h          Show this help
  --version, -v       Show the version

The catalog is loaded from https://trace-logos.ru/logos.json and cached locally; no telemetry.
${ATTRIBUTION_LINE}
`;

/** One human-readable line for any error; never a stack trace (set TRACE_LOGOS_DEBUG=1 to see it). */
export function describeError(e: unknown): string {
  if (isTraceLogosError(e)) {
    switch (e.code) {
      case 'NETWORK':
        return `Network problem: ${e.message}\nCheck your connection, or run with --offline to use the cached catalog.`;
      case 'HTTP':
        return `The server answered with an error: ${e.message}\nTry again in a minute.`;
      case 'NOT_FOUND':
        return `Not found: ${e.message}`;
      case 'PARSE':
        return `The catalog could not be read: ${e.message}`;
      case 'TOO_LARGE':
        return `Download refused: ${e.message}`;
      case 'FORBIDDEN_HOST':
      case 'INVALID_ASSET':
        return `Download refused: ${e.message}`;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
