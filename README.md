<div align="center">
  <img src="https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/logo.png" width="96" height="96" alt="CSV Pretty Visualizer logo">
  <h1>CSV Pretty Visualizer</h1>
  <p><b>Open CSV and TSV files as a rich, interactive table — right inside VS Code.</b><br>
  Search, filter, sort, type, reorder, select and copy, without leaving your editor or opening a spreadsheet.</p>

  <a href="https://marketplace.visualstudio.com/items?itemName=layem-software.csv-visualizer-pretty-table">
    <img src="https://img.shields.io/visual-studio-marketplace/v/layem-software.csv-visualizer-pretty-table?color=7c6af7&label=VS%20Marketplace&logo=visual-studio-code" alt="VS Marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=layem-software.csv-visualizer-pretty-table">
    <img src="https://img.shields.io/visual-studio-marketplace/d/layem-software.csv-visualizer-pretty-table?color=7c6af7&label=installs" alt="Installs">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=layem-software.csv-visualizer-pretty-table">
    <img src="https://img.shields.io/visual-studio-marketplace/r/layem-software.csv-visualizer-pretty-table?color=7c6af7&label=rating" alt="Rating">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-7c6af7" alt="MIT License">
  </a>
</div>

<br>

![The CSV table view](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-table.png)

---

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Features](#features)
  - [Interactive table view](#interactive-table-view)
  - [Live stats](#live-stats)
  - [Global search](#global-search)
  - [Per-column filters](#per-column-filters)
  - [Unique value picker](#unique-value-picker)
  - [Sorting](#sorting)
  - [Column types](#column-types)
  - [Column visibility and reordering](#column-visibility-and-reordering)
  - [Row selection and copy](#row-selection-and-copy)
  - [Cell copy and expand](#cell-copy-and-expand)
  - [Pagination](#pagination)
  - [Image thumbnails](#image-thumbnails)
  - [Full-screen lightbox](#full-screen-lightbox)
  - [Theme aware](#theme-aware)
  - [Live updates](#live-updates)
  - [Multiple files at once](#multiple-files-at-once)
  - [Delimiter detection](#delimiter-detection)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Security](#security)
- [Development](#development)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

**From the VS Marketplace** — search for **CSV Pretty Visualizer** in the Extensions panel (`Ctrl+Shift+X`), or install directly:

```
ext install layem-software.csv-visualizer-pretty-table
```

**From a `.vsix` file**

```bash
code --install-extension csv-visualizer-pretty-table-1.1.0.vsix
```

Requires VS Code `1.109.0` or newer.

## Quick start

Open any `.csv` or `.tsv` file, then use whichever of these you prefer:

| # | How | Where |
|---|---|---|
| 1 | Click the table icon (⊞) in the editor title bar | Top-right of the editor, when a CSV is active |
| 2 | **CSV › Open Table View** | Right-click inside the CSV editor |
| 3 | **CSV › Open Table View** | Right-click a `.csv`/`.tsv` file in the Explorer — the file does not need to be open |
| 4 | `Ctrl+Alt+T` / `Cmd+Alt+T` | While the CSV editor is focused |

The table opens in its own panel. Everything below is available immediately — no configuration and no settings to set.

---

## Features

### Interactive table view

Any `.csv` or `.tsv` file becomes a clean, scrollable table with a sticky header, zebra-free row hovering, and a horizontal scroll for wide files. Columns size themselves to their contents, and long values are truncated with an ellipsis until you click them.

![The CSV table view](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-table.png)

### Live stats

Four counters at the top always reflect the current view: total rows in the file, rows matching your filters, total columns, and columns currently visible.

![Live stats counters](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-stats.png)

### Global search

One box filters rows across every column at once, case-insensitively, as you type. Here `Lighting` narrows 30 rows to 10.

![Global search across all columns](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-search.png)

### Per-column filters

Every column header carries its own operator dropdown and value box. Filters across different columns combine, so you can narrow down with as many conditions as you like.

Available operators:

| Text | Numeric | Emptiness |
|---|---|---|
| Contains | Greater `>` | Is Empty |
| Equals | Less `<` | Not Empty |
| Not Equals | Greater or equal `>=` | |
| Starts With | Less or equal `<=` | |
| Ends With | | |

Below, `units` is filtered with **Greater >** `20`:

![Per-column filter with a numeric operator](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-column-filter.png)

### Unique value picker

Click **Select Values** on any column to get a checkbox list of that column's distinct values, each with the number of rows it appears in, ordered by frequency. Tick only what you want to see, or use **(Select All)** / **(Clear All)**.

Here `Accessories` has been unticked, leaving the 21 Furniture and Lighting rows:

![Unique value checkbox picker](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-unique-values.png)

> On very high-cardinality columns the list shows the 500 most common values so the dropdown stays instant; the count in the button always reflects the true total.

### Sorting

Each header has ▲ ▼ buttons — ascending and descending. The active direction stays highlighted. Columns typed as **Number** or **Date** sort by value rather than as text, and values that cannot be parsed are kept at the end instead of scattered through the results.

`revenue` sorted descending:

![Descending numeric sort](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-sort.png)

### Column types

Set a type per column to change both how it renders and how it filters and sorts:

| Type | Rendering |
|---|---|
| **Text** | Plain text (default) |
| **Number** | Right-aligned, thousands separators, tabular figures |
| **Date** | Formatted to your locale |
| **Boolean** | Green ✓ True / red ✗ False for `true`/`1`/`yes`/`y` |
| **Link** | Clickable link, opened externally |
| **Image** | Thumbnail with lightbox — see [Image thumbnails](#image-thumbnails) |
| **JSON** | Pretty-printed and monospaced |
| **Array**, **HTML**, **Raw**, **Base64** | Monospaced text |

![Number, date, boolean and link columns](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-types.png)

### Column visibility and reordering

Expand **Column Configuration** to hide columns you don't care about, set each column's type, and move columns left or right with ◀ ▶. One checkbox toggles every column at once. Hidden columns are excluded from copied output.

![Column configuration panel](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-columns.png)

### Row selection and copy

Tick individual rows, use the header checkbox to take the whole page, or **Select All Rows** to take everything matching your current filters. The counter tracks the total, and **Copy Selected** puts the rows on your clipboard as **tab-separated values** — ready to paste straight into Excel, Google Sheets or Numbers. Only visible columns are copied, in the order shown.

![Selected rows ready to copy](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-selection.png)

### Cell copy and expand

Hover any cell for a one-click **Copy** button that copies the cell's full, unformatted value — the raw text, not the formatted display value. Click a cell to expand it in place when its content is wider than the column, which is handy for long descriptions, JSON blobs and URLs.

![The per-cell copy button](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-cell-copy.png)

### Pagination

Choose 10, 25, 50, 100, 250, 500 or **all** rows per page. Jump with **First** / **Previous** / **Next** / **Last**, or type a page number and press `Enter`. The readout always says exactly which rows you are looking at.

![Pagination controls on page 3](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-pagination.png)

### Image thumbnails

Set a column's type to **Image** and its URLs render as thumbnails. A cell may hold:

- a single URL — `https://example.com/a.png`
- a comma-separated list — `a.png, b.png, c.png`
- a JSON or Python-style array — `['a.png', 'b.png']`
- a `data:` URI, which is kept intact even though it contains commas

Images that fail to load fall back to a placeholder rather than a broken-image icon.

![Image thumbnails in a gallery column](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-images.png)

### Full-screen lightbox

Click any thumbnail for a full-screen gallery of every image in that cell, with a counter, a thumbnail strip, and previous/next navigation. Use `←` and `→` to move, `Esc` to close.

![Full-screen image lightbox](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-lightbox.png)

### Theme aware

The panel reads VS Code's own theme colours, so it matches your editor instead of forcing a dark palette. The same file under a light theme:

![The table under a light theme](https://raw.githubusercontent.com/bakirrayan/csv-visualizer-pretty-table/main/assets/screenshot-light-theme.png)

### Live updates

Edit the CSV in the editor with the table open and the table refreshes as you type — no need to close and reopen the panel.

### Multiple files at once

Every file gets its own panel with its own filters, sort, types and selection. Re-running the command on a file that is already open focuses its existing panel instead of opening a duplicate.

### Delimiter detection

The delimiter is detected automatically from `,` `;` `Tab` and `|` by sampling several lines and preferring the one that splits them consistently. Quoted delimiters are ignored, so `name;"city, state";population` is read as three columns, and `.tsv` files are always tab-delimited. Quoted fields, escaped `""` quotes, embedded newlines and CRLF line endings are all handled, and short rows are padded so trailing columns stay aligned.

---

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Open Table View | `Ctrl+Alt+T` | `Cmd+Alt+T` |
| Go to typed page | `Enter` in the page box | `Enter` in the page box |
| Lightbox: previous / next image | `←` / `→` | `←` / `→` |
| Lightbox: close | `Esc` | `Esc` |

## Security

CSV files are untrusted input, so the table view treats them that way:

- The webview runs under a strict nonce-based Content Security Policy with no inline scripts and no remote code.
- Every header and cell reaches the page as text, never as markup — a file containing `<img src=x onerror=…>` displays those characters rather than executing them.
- **Link** columns only follow `http:`, `https:` and `mailto:` URLs; anything else, including `javascript:`, is shown as plain text.

## Development

```bash
bun install
bun run check      # compile the extension and type-check the webview
bun run package    # build a .vsix
```

Press `F5` in VS Code to launch an Extension Development Host with the fixtures folder open.

| Path | What it is |
|---|---|
| [src/](src/) | Extension host: command wiring, panel lifecycle, CSV parser |
| [media/](media/) | The webview UI — plain HTML, CSS and JS, no build step |
| [scripts/fixtures/](scripts/fixtures/) | Sample, hostile, image and odd-delimiter CSVs for manual testing |
| `node scripts/capture.mjs` | Regenerates every screenshot in this README with headless Chrome |
| `node scripts/smoke.mjs` | Runs the webview against the hostile fixture and asserts the escaping, filter and selection invariants |

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/bakirrayan/csv-visualizer-pretty-table). If you are reporting a parsing problem, a small sample file that reproduces it helps enormously.

## License

[MIT](LICENSE) © layem-software
