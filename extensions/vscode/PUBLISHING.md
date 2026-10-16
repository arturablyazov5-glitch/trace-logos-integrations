# Publishing (owner only)

Nothing in this repository publishes automatically, and `package.json` deliberately has no publish scripts.
Run the commands below by hand, only after the release is agreed.

## Published extension

- Publisher: `trace-logos`; extension ID: `trace-logos.trace-logos`.
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=trace-logos.trace-logos)
- [Open VSX](https://open-vsx.org/extension/trace-logos/trace-logos)
- Related CLI and Node.js API: [npm `trace-logos`](https://www.npmjs.com/package/trace-logos)

Version 0.1.0 was the initial published release. Keep the existing publisher and namespace.
The extension is intentionally not an npm workspace (`packages/cli` has the same name);
it has its own lockfile and bundles core from `../../packages/core/src`.

The Marketplace overview comes from `extensions/vscode/README.md` inside the published VSIX.
Pushing README changes to GitHub does not update the published overview. Version 0.1.1 updates the
installation text and registry links without changing extension functionality.
Do not publish a new npm package or extension version without the owner's approval.

## Publisher access (owner)

1. Manage the existing publisher at https://marketplace.visualstudio.com/manage.
2. **Azure DevOps PAT** for the Visual Studio Marketplace: https://dev.azure.com → User settings → Personal access tokens →
   New token, Organization: **All accessible organizations**, Scopes: **Marketplace → Manage**.
3. **Open VSX:** sign in at https://open-vsx.org with GitHub, sign the Publisher Agreement, create an access token
   (Settings → Access Tokens), use the existing `trace-logos` namespace.
4. `repository` / `bugs` point to https://github.com/arturablyazov5-glitch/trace-logos-integrations (the repository must be
   public before publishing — the Marketplace page links to it); `homepage` is https://trace-logos.ru/.
5. `LICENSE`: MIT for the code, © 2026 Trace Logo's, plus the note that brand logos are not covered.

Never commit tokens. Pass them as environment variables or through the interactive prompt.

## Every release

```bash
npm install            # repository root; postinstall also installs extensions/vscode
npm run build          # core -> cli -> vscode
npm test               # all three
cd extensions/vscode
# bump "version" in package.json and add a CHANGELOG.md entry
npm run package                                       # -> trace-logos-<version>.vsix
npm run test:integration   # real VS Code (downloaded once into <repo>/.vscode-test, isolated profile); also installs the VSIX there
npx vsce ls --no-dependencies                         # check contents: dist, media, README, CHANGELOG, LICENSE, package.json
```

Visual Studio Marketplace:

```bash
VSCE_PAT=<AZURE_DEVOPS_PAT> npx vsce publish --no-dependencies --packagePath trace-logos-<version>.vsix
```

Open VSX:

```bash
npx ovsx publish trace-logos-<version>.vsix -p <OPEN_VSX_TOKEN>
```

Publish the same `.vsix` file to both registries.
