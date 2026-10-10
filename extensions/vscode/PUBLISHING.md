# Publishing (owner only)

Nothing in this repository publishes automatically, and `package.json` deliberately has no publish scripts.
Run the commands below by hand, only after the release is agreed.

## One-time setup (owner)

1. **Publisher / ID.** `package.json` has `"name": "trace-logos"` and the placeholder publisher `trace-logos`;
   the extension ID is `<publisher>.trace-logos`. Create the real publisher at
   https://marketplace.visualstudio.com/manage (Microsoft account) and put its ID into `"publisher"`.
   The extension is intentionally **not** an npm workspace of the repository root (`packages/cli` is also
   named `trace-logos`); it has its own `package-lock.json`, and core is bundled from `../../packages/core/src`.
2. **Azure DevOps PAT** for the Visual Studio Marketplace: https://dev.azure.com → User settings → Personal access tokens →
   New token, Organization: **All accessible organizations**, Scopes: **Marketplace → Manage**.
3. **Open VSX:** sign in at https://open-vsx.org with GitHub, sign the Publisher Agreement, create an access token
   (Settings → Access Tokens), then create the namespace once (must equal `"publisher"`):
   `npx ovsx create-namespace <publisher> -p <OPEN_VSX_TOKEN>`
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

Open VSX (used by VSCodium, Gitpod, Eclipse Theia and other VS Code-compatible editors):

```bash
npx ovsx publish trace-logos-<version>.vsix -p <OPEN_VSX_TOKEN>
```

Publish the same `.vsix` file to both registries.
