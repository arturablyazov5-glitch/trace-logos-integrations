// Runs against the INSTALLED VSIX (no development path for trace-logos): activation + commands.
const vscode = require('vscode');
const assert = require('node:assert/strict');
exports.run = async () => {
  const ext = vscode.extensions.getExtension('trace-logos.trace-logos');
  assert.ok(ext, 'installed extension trace-logos.trace-logos not found');
  assert.ok(!ext.extensionPath.includes('extensions/vscode'), `expected installed copy, got ${ext.extensionPath}`);
  const api = await ext.activate();
  assert.equal(ext.isActive, true);
  assert.equal(api, undefined, 'test API must not be exposed outside ExtensionMode.Test');
  const cmds = await vscode.commands.getCommands(true);
  for (const c of ['traceLogos.search', 'traceLogos.downloadHere', 'traceLogos.refreshCatalog']) assert.ok(cmds.includes(c), c);
  console.log(`PASS vsix: ${ext.id}@${ext.packageJSON.version} active from ${ext.extensionPath}, commands registered`);
};
