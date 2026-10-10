// Tiny argument parser (no dependencies). Supports --flag, --opt value, --opt=value, -x, and "--" terminator.

export type Command = 'search' | 'get' | 'info' | 'open';

export interface ParsedArgs {
  command?: Command;
  positionals: string[];
  help: boolean;
  version: boolean;
  json: boolean;
  limit?: number;
  category?: string;
  svg: boolean;
  png: boolean;
  variant?: string;
  out?: string;
  stdout: boolean;
  force: boolean;
  noCache: boolean;
  refresh: boolean;
  offline: boolean;
}

export class UsageError extends Error {}

const COMMANDS: readonly string[] = ['search', 'get', 'info', 'open'];
const VALUE_OPTS: Record<string, 'limit' | 'category' | 'variant' | 'out'> = {
  '--limit': 'limit', '-n': 'limit',
  '--category': 'category', '-c': 'category',
  '--variant': 'variant',
  '--out': 'out', '-o': 'out',
};
const FLAG_OPTS: Record<string, 'help' | 'version' | 'json' | 'svg' | 'png' | 'stdout' | 'force' | 'noCache' | 'refresh' | 'offline'> = {
  '--help': 'help', '-h': 'help',
  '--version': 'version', '-v': 'version',
  '--json': 'json', '--svg': 'svg', '--png': 'png', '--stdout': 'stdout',
  '--force': 'force', '-f': 'force',
  '--no-cache': 'noCache', '--refresh': 'refresh', '--offline': 'offline',
};

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const r: ParsedArgs = {
    positionals: [], help: false, version: false, json: false, svg: false, png: false,
    stdout: false, force: false, noCache: false, refresh: false, offline: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (a.length > 1 && a.startsWith('-')) {
      const eq = a.startsWith('--') ? a.indexOf('=') : -1;
      const name = eq > 0 ? a.slice(0, eq) : a;
      const valueKey = VALUE_OPTS[name];
      const flagKey = FLAG_OPTS[name];
      if (valueKey) {
        let value: string | undefined;
        if (eq > 0) value = a.slice(eq + 1);
        else {
          value = argv[++i];
          if (value === undefined) throw new UsageError(`Option ${name} needs a value`);
        }
        if (valueKey === 'limit') {
          if (!/^\d+$/.test(value) || Number(value) < 1) throw new UsageError(`--limit must be a positive integer, got "${value}"`);
          r.limit = Number(value);
        } else r[valueKey] = value;
      } else if (flagKey) {
        if (eq > 0) throw new UsageError(`Option ${name} does not take a value`);
        r[flagKey] = true;
      } else {
        throw new UsageError(`Unknown option: ${name}`);
      }
    } else {
      rest.push(a);
    }
  }
  if (rest.length) {
    const first = rest[0]!;
    if (COMMANDS.includes(first)) {
      r.command = first as Command;
      r.positionals = rest.slice(1);
    } else {
      throw new UsageError(`Unknown command: ${first}`);
    }
  }
  if (r.svg && r.png) throw new UsageError('Use either --svg or --png, not both');
  return r;
}
