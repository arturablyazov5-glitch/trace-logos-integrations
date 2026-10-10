import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const { defaultCacheDir, clipboardCommands, openCommand, openInBrowser } = await import('../.build/platform.mjs');

test('cache dir per platform', () => {
  assert.equal(defaultCacheDir({}, 'darwin', '/h'), join('/h', 'Library', 'Caches', 'trace-logos'));
  assert.equal(defaultCacheDir({ LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\U'), join('C:\\L', 'trace-logos', 'Cache'));
  assert.equal(defaultCacheDir({ XDG_CACHE_HOME: '/x' }, 'linux', '/h'), join('/x', 'trace-logos'));
  assert.equal(defaultCacheDir({}, 'linux', '/h'), join('/h', '.cache', 'trace-logos'));
  assert.equal(defaultCacheDir({ TRACE_LOGOS_CACHE_DIR: '/c' }, 'linux', '/h'), '/c');
});

test('clipboard and browser commands: argv arrays, no shell', () => {
  assert.equal(clipboardCommands('darwin', {})[0].cmd, 'pbcopy');
  assert.equal(clipboardCommands('win32', {})[0].cmd, 'clip');
  assert.deepEqual(clipboardCommands('linux', { WAYLAND_DISPLAY: 'w' }).map((c) => c.cmd), ['wl-copy', 'xclip', 'xsel']);
  assert.deepEqual(clipboardCommands('linux', {}).map((c) => c.cmd), ['xclip', 'xsel', 'wl-copy']);
  const url = 'https://trace-logos.ru/a/?x=1&y=2';
  assert.deepEqual(openCommand('darwin', url), { cmd: 'open', args: [url] });
  assert.deepEqual(openCommand('linux', url), { cmd: 'xdg-open', args: [url] });
  assert.deepEqual(openCommand('win32', url), { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] });
});

test('openInBrowser refuses non-http(s) URLs without spawning', async () => {
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)', '--help', 'calc.exe']) assert.equal(await openInBrowser(u), false);
});
