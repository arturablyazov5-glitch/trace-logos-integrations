# trace-logos

Find and download brand logos (SVG and PNG) from the [Trace Logo's](https://trace-logos.ru/) catalog, from the terminal or from Node.js. Russian and international brands. **Zero dependencies**, Node.js 18.17+. The package contains no logos and no catalog: both are loaded from trace-logos.ru and cached on disk.

## Quick start

```sh
npx trace-logos search telegram
# or install globally
npm i -g trace-logos
```

In a terminal `search` opens an interactive menu: pick a logo by number, then copy an SVG/PNG link, download SVG or PNG, choose a variant, or open the brand page. Piped or with `--json` it just prints the list.

## Commands

```sh
trace-logos search <query> [--limit N] [--category slug] [--json]
trace-logos get <slug|query> [--svg|--png] [--variant label] [--out dir|file] [--stdout] [--force]
trace-logos info <slug|query>
trace-logos open <slug|query>
```

```sh
trace-logos search телеграм              # Russian, English, or the wrong keyboard layout (ntktuhfv)
trace-logos search bank --category bank --limit 10 --json
trace-logos get telegram                 # ./telegram.svg
trace-logos get telegram --png --out ./assets/
trace-logos get telegram --variant premium --out ./assets/tg-premium.svg
trace-logos get telegram --stdout > tg.svg
trace-logos get bank/alfa                # category/slug when a bare slug is ambiguous
trace-logos info sber                    # page, formats, variants, direct links
trace-logos open sber                    # opens the brand page in your browser (only when you run it)
```

- `get` never overwrites an existing file unless you pass `--force`. File names are generated safely (`telegram.svg`, `telegram-premium.svg`). When a slug exists in several categories, the category is prefixed (`bank-alfa.svg`, `insurance-alfa.svg`), so the name depends on whether the catalog has duplicates.
- Some slugs exist in more than one category (e.g. `alfa`). The CLI then lists the candidates and exits with an error; use `category/slug`.
- A logo without SVG: `get` falls back to PNG; with an explicit `--svg` it suggests the PNG command.
- Cache and network: `--no-cache` (no disk cache), `--refresh` (re-check the catalog now), `--offline` (cache only, no requests). Network errors give a short message and a non-zero exit code.
- Exit codes: `0` ok, `1` error (not found, network, file exists), `2` usage error.
- Cache location: `~/Library/Caches/trace-logos` (macOS), `%LOCALAPPDATA%\trace-logos\Cache` (Windows), `$XDG_CACHE_HOME/trace-logos` or `~/.cache/trace-logos` (Linux). Override with `TRACE_LOGOS_CACHE_DIR`.
- Clipboard uses `pbcopy` / `clip` / `wl-copy`, `xclip` or `xsel`; if none is available the link is printed. The browser is opened with `open` / `rundll32` / `xdg-open` (no shell).

## Node.js API

```js
import { TraceLogos } from 'trace-logos';      // CommonJS: require('trace-logos')

const tl = new TraceLogos();                    // source 'npm', file cache in the user cache dir
await tl.load();                                // cached; revalidated with ETag
const [telegram] = tl.search('telegram', { limit: 1 });
const asset = tl.assetsOf(telegram).find((a) => a.kind === 'svg');
const { bytes } = await tl.fetchAsset(asset.url);
console.log(tl.pageUrl(telegram));              // brand page with UTM labels
```

It re-exports the whole core (`searchLogos`, `suggestFilename`, `TraceLogosError`, `createMemoryCache`, ...) and adds `createFileCache(dir)` and `defaultCacheDir()`. Options: `cache: false` or a custom `CacheStorage`, `cacheDir`, `ttlMs`, `fetch`, `timeoutMs`, `catalogUrl`. TypeScript types are included.

## The catalog updates without the package

Logos are read from `https://trace-logos.ru/logos.json` at run time (cached 10 minutes, revalidated with ETag, expired cache used if you are offline). New brands appear without a new npm release.

## Logos, attribution and license

Logos are trademarks of their respective owners; the catalog is curated by Trace Logo's, <https://trace-logos.ru/>. Check each brand's usage guidelines before using a logo. Nothing is added to the files you download. If you publish logos from the catalog, a link to <https://trace-logos.ru/> is appreciated.

**UTM:** links to brand pages carry `utm_source=npm&utm_medium=integration&utm_campaign=<slug>` so the site knows the click came from this package. These are plain labels in the URL: no identifiers, no tracking code, no telemetry; the CLI only talks to trace-logos.ru for the catalog and the files you ask for.

Code license: MIT (see `LICENSE`).

Логотипы и товарные знаки брендов, доступные через каталог Trace Logo's, принадлежат их владельцам и не покрываются лицензией MIT; пакет не содержит логотипов, они загружаются по запросу с https://trace-logos.ru/. Каталог: Trace Logo's.

Brand logos and trademarks available through the Trace Logo's catalog belong to their respective owners and are not covered by the MIT License. This package contains no logos; they are downloaded on request from https://trace-logos.ru/. Catalog: Trace Logo's.

Source code and issues: <https://github.com/arturablyazov5-glitch/trace-logos-integrations> (`packages/cli`).

## По-русски

CLI и Node.js API для каталога логотипов [Trace Logo's](https://trace-logos.ru/): `npx trace-logos search телеграм` — поиск (в терминале интерактивное меню: скопировать ссылку, скачать SVG/PNG, выбрать вариант, открыть страницу бренда), `get telegram` — скачать в текущую папку (существующие файлы не перезаписываются без `--force`), `info`, `open`. Если slug есть в нескольких категориях, указывайте `категория/slug`, например `bank/alfa`. Логотипов и каталога внутри пакета нет: они грузятся с trace-logos.ru и кэшируются, поэтому новые бренды появляются без обновления пакета. Логотипы — товарные знаки их владельцев. UTM-метки в ссылках на страницы — только метки перехода, без трекинга и телеметрии. Лицензия кода — MIT.
