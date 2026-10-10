// Integration tests in a real VS Code (downloaded by @vscode/test-electron into <repo>/.vscode-test/).
// Isolated profile: --user-data-dir/--extensions-dir under .vscode-test; the user's VS Code is never touched.
// Suites: "workspace" (temp project folder), "noworkspace" (empty window), "vsix" (installed VSIX, no dev path).
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');
const { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');

const extRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(extRoot, '..', '..');
const base = path.join(repoRoot, '.vscode-test');
const profile = [`--user-data-dir=${path.join(base, 'user-data')}`, `--extensions-dir=${path.join(base, 'extensions')}`];
const common = ['--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-telemetry', ...profile];

async function main() {
  const only = process.argv.slice(2);
  const want = (s) => !only.length || only.includes(s);
  const exe = await downloadAndUnzipVSCode({ cachePath: base, version: process.env.VSCODE_VERSION || 'stable' });
  const suite = path.join(__dirname, 'suite.cjs');

  if (want('workspace')) {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-ws-'));
    await runTests({
      vscodeExecutablePath: exe, extensionDevelopmentPath: extRoot, extensionTestsPath: suite,
      launchArgs: [ws, '--disable-extensions', ...common],
      extensionTestsEnv: { TL_SUITE: 'workspace', TL_WS: ws, ...(process.env.TL_SCREENSHOTS === '1' ? { TL_SCREENSHOT: path.join(base, 'screens') } : {}) },
    });
  }
  if (want('noworkspace')) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-nows-'));
    await runTests({
      vscodeExecutablePath: exe, extensionDevelopmentPath: extRoot, extensionTestsPath: suite,
      launchArgs: ['--disable-extensions', ...common],
      extensionTestsEnv: { TL_SUITE: 'noworkspace', TL_PICK_DIR: dir },
    });
  }
  if (want('vsix')) {
    const vsix = fs.readdirSync(extRoot).filter((f) => f.endsWith('.vsix')).sort().pop();
    if (!vsix) throw new Error('no .vsix in extensions/vscode — run `npm run package` first');
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(exe);
    const args = [...cliArgs.filter((a) => !a.startsWith('--extensions-dir') && !a.startsWith('--user-data-dir')), ...profile];
    cp.execFileSync(cli, [...args, '--install-extension', path.join(extRoot, vsix), '--force'], { stdio: 'inherit' });
    console.log(cp.execFileSync(cli, [...args, '--list-extensions', '--show-versions'], { encoding: 'utf8' }));
    await runTests({
      vscodeExecutablePath: exe, extensionDevelopmentPath: path.join(__dirname, '..', 'probe'),
      extensionTestsPath: path.join(__dirname, '..', 'probe', 'probe.cjs'),
      launchArgs: common,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
