// OS adapters: cache directory, clipboard, browser. No shell is ever involved (spawn with an argv array).
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Env = Record<string, string | undefined>;

/** Per-user cache dir. TRACE_LOGOS_CACHE_DIR overrides everything. */
export function defaultCacheDir(
  env: Env = process.env,
  platform: string = process.platform,
  home: string = homedir(),
): string {
  if (env.TRACE_LOGOS_CACHE_DIR) return env.TRACE_LOGOS_CACHE_DIR;
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'trace-logos');
  if (platform === 'win32') {
    return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'trace-logos', 'Cache');
  }
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'trace-logos');
}

export interface Cmd {
  cmd: string;
  args: string[];
}

/** Clipboard utilities to try, in order. */
export function clipboardCommands(platform: string, env: Env): Cmd[] {
  if (platform === 'darwin') return [{ cmd: 'pbcopy', args: [] }];
  if (platform === 'win32') return [{ cmd: 'clip', args: [] }];
  const list: Cmd[] = [];
  if (env.WAYLAND_DISPLAY) list.push({ cmd: 'wl-copy', args: [] });
  list.push({ cmd: 'xclip', args: ['-selection', 'clipboard'] }, { cmd: 'xsel', args: ['--clipboard', '--input'] });
  if (!env.WAYLAND_DISPLAY) list.push({ cmd: 'wl-copy', args: [] });
  return list;
}

/** Command that opens a URL in the default browser. Windows avoids cmd.exe (it would mangle "&" in URLs). */
export function openCommand(platform: string, url: string): Cmd {
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'win32') return { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  return { cmd: 'xdg-open', args: [url] };
}

function writeToProcess(c: Cmd, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(c.cmd, c.args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
      p.stdin.on('error', () => {});
      p.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

/** Copies text; false if no clipboard utility worked (the caller prints the text instead). */
export async function copyToClipboard(text: string, platform: string = process.platform, env: Env = process.env): Promise<boolean> {
  for (const c of clipboardCommands(platform, env)) if (await writeToProcess(c, text)) return true;
  return false;
}

/** Opens an http(s) URL in the default browser; false if it could not be started. */
export function openInBrowser(url: string, platform: string = process.platform): Promise<boolean> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(false);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return resolve(false);
    const c = openCommand(platform, parsed.href);
    try {
      const p = spawn(c.cmd, c.args, { stdio: 'ignore', detached: true, windowsHide: true });
      p.on('error', () => resolve(false));
      p.on('spawn', () => {
        p.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
