# Changelog

All notable changes to **CSV Pretty Visualizer** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-24

### Added

- A rewritten README documenting every feature, with a screenshot for each, shown
  on the Marketplace page.
- Live updates: editing a CSV in the editor now refreshes any open table view.
- Theme awareness — the panel follows the active VS Code colour theme instead of
  always rendering dark.
- An **All rows** option in the rows-per-page selector.
- Keyboard shortcuts documented for the lightbox (`←` `→` `Esc`).

### Fixed

- **Security:** CSV headers and cell values are no longer interpolated into HTML.
  A file whose header or cells contained markup (for example
  `<img src=x onerror=…>`) could previously execute script in the webview. The
  webview now runs under a nonce-based CSP with no inline handlers, and all CSV
  content is inserted as text.
- **Security:** `link` columns only render `http:`, `https:` and `mailto:` URLs;
  other schemes such as `javascript:` are shown as plain text.
- Right-clicking a `.csv`/`.tsv` file in the Explorer opened whichever editor was
  focused instead of the file that was clicked.
- Values containing an apostrophe or quote broke their filter checkbox.
- Reordering columns showed another column's values in the unique-value dropdown
  and silently discarded the current row selection.
- Duplicate rows were selected and deselected together; row selection is now
  tracked per row rather than by content.
- Columns sharing a name (common in real CSVs) shared a single filter.
- **Clear All** in the unique-value dropdown selected everything instead of
  clearing the selection.
- Copying selected rows now produces tab-separated output, as documented, and is
  routed through VS Code's clipboard API so it works reliably in the webview.
- Plain-HTTP image URLs were blocked by the Content Security Policy.
- Image cells holding a `data:` URI rendered as several broken images, because the
  cell was split on every comma — including the one inside the URI itself.
- Delimiter detection is quote-aware and samples several lines, so a
  semicolon-delimited file with a quoted comma — or a `.tsv` whose header
  contains commas — is parsed correctly.
- Number and date sorting keep non-parsable values at the end instead of
  producing an arbitrary order.
- Short rows are padded so trailing columns render instead of showing `undefined`.
- The default keybinding moved from `Shift+F` (which hijacked typing a capital F
  in any CSV editor, and shadowed Find-in-Files on macOS) to `Ctrl+Alt+T` /
  `Cmd+Alt+T`.
- A leaked webview message listener and pending refresh timers are now disposed
  with the panel.

### Changed

- The webview was extracted from a single 2,000-line template literal in
  `csvWebviewProvider.ts` into `media/{index.html,style.css,main.js}`, served via
  `asWebviewUri` and type-checked in CI-able form (`bun run check`).
- Global search is debounced, filtering no longer reads the DOM per row, unique
  value dropdowns are built lazily and capped at 500 entries, and sorting or
  filtering re-renders only the table body. Large files stay responsive.
- The packaged extension no longer ships sources, fixtures or build config.

## [1.0.0]

- Initial release.
