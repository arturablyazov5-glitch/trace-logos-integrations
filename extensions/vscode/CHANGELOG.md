# Changelog

## Unreleased

- Documentation: replace pre-publication installation instructions with Marketplace and Open VSX links; add the npm package link.

## 0.1.0

- `Trace Logos: Search` — search the Trace Logo's catalog as you type (Russian/English names, wrong keyboard layout), with lazy thumbnails for the first results.
- Actions: insert SVG/PNG link at the cursor, insert as `<img>` / JSX / Markdown / CSS `url()` depending on the file language, download SVG or PNG into the project, choose a logo variant, copy link, open the brand page on trace-logos.ru.
- `Trace Logos: Download here` in the Explorer context menu for folders.
- Large preview panel (strict CSP, image rendered as `<img>` from a data URI) with the same actions.
- Settings: `traceLogos.downloadFolder`, `traceLogos.catalogUrl`, `traceLogos.cacheTtlMinutes`, `traceLogos.showEditorTitleButton`.
- Catalog cached on disk with ETag revalidation; works offline from the last cached copy.
