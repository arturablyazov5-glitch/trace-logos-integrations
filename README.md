# trace-logos-integrations

Integrations for the [Trace Logo's](https://trace-logos.ru/) logo catalog: an npm package (CLI + Node.js API) and a VS Code extension. They contain no logos and no copy of the catalog: everything is read at run time from `https://trace-logos.ru/logos.json` and cached, so new logos appear without new releases.

## Install

Node.js 18.17 or newer for the CLI and Node.js API:

```sh
npx trace-logos search telegram
npm install -g trace-logos  # CLI
npm install trace-logos     # Node.js API
```

For VS Code 1.85 or newer, install [Trace Logos from the Marketplace](https://marketplace.visualstudio.com/items?itemName=trace-logos.trace-logos), or run:

```sh
code --install-extension trace-logos.trace-logos
```

The extension is also published on [Open VSX](https://open-vsx.org/extension/trace-logos/trace-logos).

## Structure

| Path | What | Published as |
|---|---|---|
| `packages/core` | Shared client: catalog loading and cache, search (RU/EN, keyboard layout), page links with UTM, safe asset download. Private, bundled into the others. | — |
| `packages/cli` | `trace-logos` CLI and Node.js API ([README](packages/cli/README.md)) | [npm: `trace-logos`](https://www.npmjs.com/package/trace-logos) |
| `extensions/vscode` | VS Code extension ([README](extensions/vscode/README.md), [publishing](extensions/vscode/PUBLISHING.md)) | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=trace-logos.trace-logos) · [Open VSX](https://open-vsx.org/extension/trace-logos/trace-logos) |

`extensions/vscode` is deliberately not an npm workspace (its package name `trace-logos` would clash with the CLI); it has its own lockfile and bundles core from source. The root `postinstall` installs its dependencies.

## Build and test

Node.js 18.17 or newer.

```sh
npm install        # root workspaces + extensions/vscode (postinstall)
npm run build      # core -> cli -> vscode
npm test           # unit tests of all three
npm run typecheck

cd extensions/vscode
npm run package            # trace-logos-<version>.vsix
npm run test:integration   # real VS Code: downloaded once into .vscode-test/ with an isolated profile
```

No telemetry anywhere. Brand pages are opened only on an explicit user action; their links carry `utm_source=npm|vscode&utm_medium=integration&utm_campaign=<slug>` and nothing else.

## License

Code: MIT, see [LICENSE](LICENSE).

Логотипы и товарные знаки брендов, доступные через каталог Trace Logo's, принадлежат их владельцам и не покрываются лицензией MIT; пакет не содержит логотипов, они загружаются по запросу с https://trace-logos.ru/. Каталог: Trace Logo's.

Brand logos and trademarks available through the Trace Logo's catalog belong to their respective owners and are not covered by the MIT License. This package contains no logos; they are downloaded on request from https://trace-logos.ru/. Catalog: Trace Logo's.

## Links

- Catalog: https://trace-logos.ru/
- Issues: https://github.com/arturablyazov5-glitch/trace-logos-integrations/issues
