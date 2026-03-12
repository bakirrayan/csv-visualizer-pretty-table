<div align="center">
  <img src="assets/logo.png" width="96" height="96" alt="CSV Pretty Visualizer logo">
  <h1>CSV Pretty Visualizer</h1>
  <p>A VSCode extension that opens CSV and TSV files in a rich, interactive table view — right inside your editor.</p>

  <a href="https://marketplace.visualstudio.com/items?itemName=layem-software.csv-visualizer-pretty-table">
    <img src="https://img.shields.io/visual-studio-marketplace/v/layem-software.csv-visualizer-pretty-table?color=7c6af7&label=VS%20Marketplace&logo=visual-studio-code" alt="VS Marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=layem-software.csv-visualizer-pretty-table">
    <img src="https://img.shields.io/visual-studio-marketplace/d/layem-software.csv-visualizer-pretty-table?color=7c6af7&label=installs" alt="Installs">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-7c6af7" alt="MIT License">
  </a>
</div>

---

<!-- Replace this comment with a demo GIF:
     Record your screen opening a CSV file, toggling columns, sorting, filtering, and copying rows.
     Recommended tool: https://github.com/phw/peek or https://www.screentogif.com/
     Save as: assets/demo.gif  -->
<!-- ![Demo](assets/demo.gif) -->

## Features

- **Interactive table view** — renders any `.csv` or `.tsv` file as a clean, scrollable table
- **Global search** — filter rows across all columns at once
- **Per-column filtering** — contains, equals, starts with, ends with, greater/less than, and more
- **Unique value filter** — pick specific values from a dropdown per column
- **Sort** — click the up/down arrows on any column header
- **Column types** — set a column as `text`, `numeric`, or `date` to enable type-aware filtering
- **Column visibility** — hide/show individual columns or toggle all at once
- **Column reordering** — move columns left or right
- **Row selection & copy** — select individual rows, all rows on a page, or all filtered rows; copy to clipboard
- **Pagination** — choose 10 / 25 / 50 / 100 / 250 / 500 rows per page
- **Live stats** — see total rows, visible rows, total columns, and visible columns at a glance
- **Image rendering** — cells containing image URLs are rendered as thumbnails with a full-screen lightbox gallery
- **Cell copy** — hover any cell to get a one-click copy button
- **Multiple files** — open several CSV files simultaneously, each in its own panel

## Installation

**From the VS Marketplace**

Search for **CSV Pretty Visualizer** in the Extensions panel (`Ctrl+Shift+X`) or install directly:

```
ext install layem-software.csv-visualizer-pretty-table
```

**From a `.vsix` file**

```bash
code --install-extension csv-visualizer-pretty-table-1.0.0.vsix
```

## Usage

### Opening the table view

There are three ways to open a CSV/TSV file in the table view:

1. **Editor title bar** — click the table icon (⊞) that appears in the top-right of the editor when a CSV file is active
2. **Right-click** — right-click anywhere in the CSV editor and choose **CSV › Open Table View**
3. **Explorer** — right-click a `.csv` or `.tsv` file in the file explorer and choose **CSV › Open Table View**
4. **Keyboard shortcut** — `Shift+F` (Windows/Linux) or `Cmd+Shift+F` (macOS) while the CSV file is focused

### Searching and filtering

<!-- Replace with: assets/filtering.gif -->

Use the **Global Search** box to instantly narrow rows across every column.

For more granular control, expand **Column Configuration** and use the per-column filter inputs. Select a filter operator from the dropdown (contains, equals, >, <, etc.) and type your value.

Click **unique values** on any column header to open a checkbox dropdown and select only the values you care about.

### Sorting

<!-- Replace with: assets/sorting.gif -->

Each column header has ▲ ▼ sort buttons. Click once to sort ascending, again to sort descending.

### Managing columns

<!-- Replace with: assets/columns.gif -->

Expand **Column Configuration** to:

- Toggle individual columns on or off
- Select/deselect all columns at once
- Change a column's type (`text` / `numeric` / `date`)
- Reorder columns with the ◀ ▶ arrows

### Selecting and copying rows

<!-- Replace with: assets/copy.gif -->

Check the checkbox at the start of any row to select it. Use **Select All Rows** to grab everything currently visible (respects active filters). Click **Copy Selected** to copy the rows as tab-separated values, ready to paste into a spreadsheet.

### Image columns

If a cell contains a URL ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, or `.svg`, the extension renders it as a thumbnail. Click the thumbnail to open a full-screen lightbox with navigation between all images in that column.

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Open Table View | `Shift+F` | `Cmd+Shift+F` |

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/layem-software/csv-visualizer-pretty-table).

## License

[MIT](LICENSE) © layem-software
