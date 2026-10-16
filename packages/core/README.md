# @trace-logos-int/core

Internal core of the `trace-logos` package: loads the live catalog `https://trace-logos.ru/logos.json`
(cache + ETag, stale-if-error), searches it (RU/EN, keyboard layout, typos), builds brand-page links
with UTM labels and downloads assets from trace-logos.ru only. Zero runtime dependencies;
`@trace-logos-int/core/node` adds `createFileCache(dir)`.

This core is private and bundled into the published [npm package](https://www.npmjs.com/package/trace-logos) and extension ([VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=trace-logos.trace-logos), [Open VSX](https://open-vsx.org/extension/trace-logos/trace-logos)). For the public Node.js API, install `trace-logos`; do not install this internal workspace directly.

## File names

`suggestFilename(logo, asset)` / `assetsOf(logo)[].filename` return `[a-z0-9-_.]` names, never a path:

- `<slug>.<ext>` — e.g. `telegram.svg`; variants append the label: `telegram-premium.svg`.
- Slugs are unique only within a category. If the loaded catalog has the same slug more than once
  (`bank/alfa`, `insurance/alfa`), `normalizeCatalog` sets `logo.ambiguousSlug = true` and the
  category is prefixed: `bank-alfa.svg`, `bank-alfa-full.svg`, `insurance-alfa.svg`.

So a file name depends on whether the catalog currently contains a duplicate of that slug; the result
does not depend on entry order.
