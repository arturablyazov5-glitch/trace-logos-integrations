# Trace Logos for VS Code

Find brand logos (SVG and PNG) from the [Trace Logo's](https://trace-logos.ru/) catalog without leaving the editor: insert a link at the cursor, insert ready-made `<img>` / Markdown markup, or download the file into your project.

The extension ships no logos and no copy of the catalog. It reads the public catalog `https://trace-logos.ru/logos.json`, caches it locally and picks up new logos without an extension update.

## Installation

Until the extension is published, install it from a `.vsix` file: build it from the [source repository](https://github.com/arturablyazov5-glitch/trace-logos-integrations) (`extensions/vscode`, `npm run package`), then in VS Code run **Extensions: Install from VSIX…** or `code --install-extension trace-logos-<version>.vsix`.

Requires VS Code 1.85 or newer.

## Commands

| Command | Where |
|---|---|
| **Trace Logos: Search** | Command Palette, editor title bar button, editor context menu, Explorer context menu on a folder |
| **Trace Logos: Download here** | Explorer context menu on a folder — downloads go to that folder |
| **Trace Logos: Refresh catalog** | Command Palette — reload the catalog now |

Search works as you type: Russian and English names, other known names of a brand, and text typed in the wrong keyboard layout (`ntktuhfv` → Telegram). Each result shows its category and formats (SVG/PNG); thumbnails load lazily for the first results.

After choosing a logo:

- **Insert SVG link** — at the cursor of the active editor (no editor open → copied to the clipboard).
- **Insert as `<img>` / JSX `<img />` / Markdown image / CSS `url()`** — offered in HTML-like, JSX/TSX, Markdown and CSS files.
- **Download SVG** / **Download PNG** — into the project (see `traceLogos.downloadFolder`). Existing files are never overwritten without asking.
- **Preview** — a large preview with light/dark/checker backgrounds and the same actions.
- **Choose variant…** — horizontal lockups, alternative and older versions, when the logo has them.
- **Copy SVG link**.
- **Open on Trace Logo's** — opens the brand page in your browser.

Some logos exist only as PNG. For them the SVG actions are hidden and the list says so.

## Settings

| Setting | Default | Description |
|---|---|---|
| `traceLogos.downloadFolder` | `assets/logos` | Download folder, relative to the first workspace folder (or an absolute path). The folder is created after you confirm. Without an open workspace you are asked to pick a folder. |
| `traceLogos.cacheTtlMinutes` | `60` | How long the cached catalog is used before it is revalidated with the server. |
| `traceLogos.catalogUrl` | `https://trace-logos.ru/logos.json` | For debugging only. Files are downloaded only from `https://trace-logos.ru/`. |
| `traceLogos.showEditorTitleButton` | `true` | Show the search button in the editor title bar. |

## Network and offline use

- Requests go only to `trace-logos.ru`: the catalog and the logo files you preview, download or see as thumbnails.
- The catalog and thumbnails are cached in the extension's global storage. When the network is unavailable, the last cached catalog is used.
- If loading fails and there is no cached copy, you get a message with a **Retry** button.

## Privacy

- No telemetry. The extension does not collect or send any usage data.
- The site is never opened automatically — only when you choose **Open on Trace Logo's**.
- That link carries campaign labels only: `utm_source=vscode&utm_medium=integration&utm_campaign=<logo slug>`. No user, machine or project identifiers.
- Nothing is written to your files except what you explicitly insert or download.

## Attribution

Logos catalog: Trace Logo's — https://trace-logos.ru/

Check each brand's guidelines before using a logo.

## License

Code: MIT, see [LICENSE](LICENSE).

Логотипы и товарные знаки брендов, доступные через каталог Trace Logo's, принадлежат их владельцам и не покрываются лицензией MIT; пакет не содержит логотипов, они загружаются по запросу с https://trace-logos.ru/. Каталог: Trace Logo's.

Brand logos and trademarks available through the Trace Logo's catalog belong to their respective owners and are not covered by the MIT License. This package contains no logos; they are downloaded on request from https://trace-logos.ru/. Catalog: Trace Logo's.

## Links

- Logo catalog: https://trace-logos.ru/
- Source code and issues: https://github.com/arturablyazov5-glitch/trace-logos-integrations (`extensions/vscode`)
