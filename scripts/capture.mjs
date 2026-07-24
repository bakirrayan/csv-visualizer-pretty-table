/**
 * Renders the webview UI standalone in headless Chrome and screenshots each
 * feature for the README. Dev-only: excluded from the published extension.
 *
 *   node scripts/capture.mjs            # all shots
 *   node scripts/capture.mjs sort types # only the named shots
 *
 * The webview is plain HTML/CSS/JS under media/, so it runs outside VS Code as
 * long as acquireVsCodeApi() is stubbed and setData is delivered.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { parseCSV } = require(join(root, 'out/parser/csvParser.js'));

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DEFAULT_WIDTH = 1500;

const html = readFileSync(join(root, 'media/index.html'), 'utf8');
const css = readFileSync(join(root, 'media/style.css'), 'utf8');
const js = readFileSync(join(root, 'media/main.js'), 'utf8');

/** Datasets available to shots, keyed by name. */
const datasets = {
  sales: load('sample.csv'),
  gallery: load('gallery.csv'),
};

function load(file) {
  const parsed = parseCSV(readFileSync(join(root, 'scripts/fixtures', file), 'utf8'), file);
  // Escape "</" so a cell containing "</script>" cannot close the inline script.
  return JSON.stringify({
    headers: parsed.headers,
    rows: parsed.rows,
    rowCount: parsed.rowCount,
  }).replace(/<\//g, '<\\/');
}

/**
 * VS Code's Light+ theme variables. The panel reads --vscode-* tokens, so
 * injecting them shows what the extension looks like under a light theme.
 */
const LIGHT_THEME_VARS = `
  :root {
    --vscode-editor-background: #ffffff;
    --vscode-sideBar-background: #f3f3f3;
    --vscode-editorWidget-background: #f8f8f8;
    --vscode-list-hoverBackground: #e8e8e8;
    --vscode-panel-border: #d4d4d4;
    --vscode-focusBorder: #0090f1;
    --vscode-foreground: #3b3b3b;
    --vscode-descriptionForeground: #5f6368;
    --vscode-disabledForeground: #8b8b8b;
    --vscode-textLink-foreground: #005fb8;
    --vscode-textLink-activeForeground: #004a94;
    --vscode-list-activeSelectionBackground: #cfe6fb;
    --vscode-input-background: #ffffff;
    --vscode-input-foreground: #3b3b3b;
    --vscode-button-background: #005fb8;
    --vscode-button-foreground: #ffffff;
    --vscode-button-hoverBackground: #004a94;
    --vscode-button-secondaryBackground: #f3f3f3;
    --vscode-button-secondaryForeground: #3b3b3b;
    --vscode-charts-green: #16825d;
    --vscode-errorForeground: #d32f2f;
  }
`;

/** Sets rows-per-page; smaller pages keep the pagination bar in frame. */
const rowsPerPage = (n) => `
  var rpp = document.getElementById('rowsPerPage');
  rpp.value = '${n}';
  rpp.dispatchEvent(new Event('change', { bubbles: true }));
`;

/** Applies the column types that make the sales fixture render richly. */
const TYPED_SALES_COLUMNS = `
  var types = { 4: 'number', 5: 'number', 6: 'number', 7: 'date', 8: 'bool', 9: 'number', 10: 'link' };
  var selects = document.querySelectorAll('#columnConfig [data-action="set-type"]');
  Object.keys(types).forEach(function (i) {
    selects[i].value = types[i];
    selects[i].dispatchEvent(new Event('change', { bubbles: true }));
  });
`;

function buildPage({ dataset = 'sales', driver = '', themeVars = '' }) {
  return html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(
      '<link rel="stylesheet" href="{{styleUri}}">',
      () => `<style>${css}</style><style>${themeVars}</style>`
    )
    .replace(
      '<script nonce="{{nonce}}" src="{{scriptUri}}"></script>',
      () => `<script>
         window.acquireVsCodeApi = function () {
           return {
             postMessage: function (message) {
               if (message && message.command === 'ready') {
                 window.postMessage({ command: 'setData', data: ${datasets[dataset]} }, '*');
               }
             },
             getState: function () { return undefined; },
             setState: function () {},
           };
         };
       </script>
       <script>${js}</script>
       <script>
         // Disable entry animations so a shot never catches a mid-fade frame.
         document.querySelectorAll('*').forEach(function (n) { n.style.animation = 'none'; });
         setTimeout(function () { ${driver} }, 50);
       </script>`
    );
}

const shots = [
  {
    name: 'table',
    height: 1240,
    driver: `${rowsPerPage(10)}`,
  },
  {
    name: 'stats',
    height: 262,
    driver: `
      ${rowsPerPage(10)}
      // Filter and hide a column so the "visible" counters differ from the totals.
      var s = document.getElementById('globalSearch');
      s.value = 'Lighting';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      var boxes = document.querySelectorAll('#columnConfig [data-action="toggle-visibility"]');
      [5, 10].forEach(function (i) {
        boxes[i].checked = false;
        boxes[i].dispatchEvent(new Event('change', { bubbles: true }));
      });
    `,
  },
  {
    name: 'search',
    height: 1000,
    driver: `
      ${rowsPerPage(25)}
      var s = document.getElementById('globalSearch');
      s.value = 'Lighting';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    `,
  },
  {
    name: 'column-filter',
    height: 1000,
    driver: `
      ${rowsPerPage(25)}
      ${TYPED_SALES_COLUMNS}
      var ops = document.querySelectorAll('#tableHead [data-action="set-operator"]');
      ops[4].value = 'greaterThan';
      ops[4].dispatchEvent(new Event('change', { bubbles: true }));
      var vals = document.querySelectorAll('#tableHead [data-action="set-filter-value"]');
      vals[4].value = '20';
      vals[4].dispatchEvent(new Event('input', { bubbles: true }));
      vals[4].focus();
      // Focusing scrolls the container horizontally; put it back.
      document.querySelector('.table-container').scrollLeft = 0;
    `,
  },
  {
    name: 'unique-values',
    height: 1050,
    driver: `
      ${rowsPerPage(25)}
      var toggles = document.querySelectorAll('#tableHead [data-action="toggle-unique"]');
      toggles[2].click();
      // Untick one value; the dropdown stays open so the checkbox list is visible.
      var items = document.querySelectorAll('#tableHead th:nth-of-type(4) [data-action="toggle-unique-value"]');
      items[2].click();
    `,
  },
  {
    name: 'sort',
    height: 1000,
    driver: `
      ${rowsPerPage(25)}
      ${TYPED_SALES_COLUMNS}
      // Keep the numeric columns on screen so the ordering is visible.
      var boxes = document.querySelectorAll('#columnConfig [data-action="toggle-visibility"]');
      [0, 2, 3, 7, 8, 9, 10].forEach(function (i) {
        boxes[i].checked = false;
        boxes[i].dispatchEvent(new Event('change', { bubbles: true }));
      });
      // Descending sort on revenue — typed as a number, so it sorts by value.
      var th = Array.prototype.slice
        .call(document.querySelectorAll('#tableHead th[data-col-id]'))
        .filter(function (t) { return t.querySelector('.th-content span').textContent === 'revenue'; })[0];
      th.querySelectorAll('[data-action="sort"]')[1].click();
    `,
  },
  {
    name: 'types',
    height: 940,
    driver: `
      ${rowsPerPage(25)}
      ${TYPED_SALES_COLUMNS}
      // Hide the plain text columns so every typed column is in frame.
      var boxes = document.querySelectorAll('#columnConfig [data-action="toggle-visibility"]');
      [0, 1, 2, 3, 5, 9].forEach(function (i) {
        boxes[i].checked = false;
        boxes[i].dispatchEvent(new Event('change', { bubbles: true }));
      });
    `,
  },
  {
    name: 'columns',
    height: 1150,
    driver: `
      ${rowsPerPage(10)}
      ${TYPED_SALES_COLUMNS}
      document.getElementById('columnConfigToggle').click();
      var boxes = document.querySelectorAll('#columnConfig [data-action="toggle-visibility"]');
      boxes[6].checked = false;
      boxes[6].dispatchEvent(new Event('change', { bubbles: true }));
    `,
  },
  {
    name: 'selection',
    height: 1000,
    driver: `
      ${rowsPerPage(25)}
      var rows = document.querySelectorAll('#tableBody tr');
      [0, 1, 3, 4, 6].forEach(function (i) {
        var box = rows[i].querySelector('input[data-action="select-row"]');
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      });
    `,
  },
  {
    name: 'cell-copy',
    height: 900,
    driver: `
      ${rowsPerPage(10)}
      // Leave a wide text column in view so truncation and expansion are visible.
      var boxes = document.querySelectorAll('#columnConfig [data-action="toggle-visibility"]');
      [2, 3, 4, 5, 6, 7, 8, 9].forEach(function (i) {
        boxes[i].checked = false;
        boxes[i].dispatchEvent(new Event('change', { bubbles: true }));
      });
      // A screenshot cannot hover, so apply the same rule :hover applies.
      var style = document.createElement('style');
      style.textContent = '#tableBody tr:nth-child(1) td:nth-child(4) .copy-btn { display: block; }';
      document.head.appendChild(style);
    `,
  },
  {
    name: 'pagination',
    height: 1240,
    driver: `
      ${rowsPerPage(10)}
      document.querySelector('[data-page-action="next"]').click();
      document.querySelector('[data-page-action="next"]').click();
    `,
  },
  {
    name: 'images',
    dataset: 'gallery',
    height: 1150,
    driver: `
      ${rowsPerPage(10)}
      var selects = document.querySelectorAll('#columnConfig [data-action="set-type"]');
      selects[4].value = 'image';
      selects[4].dispatchEvent(new Event('change', { bubbles: true }));
      // Free horizontal space so the thumbnail grid is not clipped.
      var boxes = document.querySelectorAll('#columnConfig [data-action="toggle-visibility"]');
      [2, 3].forEach(function (i) {
        boxes[i].checked = false;
        boxes[i].dispatchEvent(new Event('change', { bubbles: true }));
      });
    `,
  },
  {
    name: 'lightbox',
    dataset: 'gallery',
    height: 900,
    driver: `
      ${rowsPerPage(10)}
      var selects = document.querySelectorAll('#columnConfig [data-action="set-type"]');
      selects[4].value = 'image';
      selects[4].dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(function () {
        document.querySelector('#tableBody img[data-action="open-lightbox"]').click();
      }, 30);
    `,
  },
  {
    name: 'light-theme',
    height: 1000,
    themeVars: LIGHT_THEME_VARS,
    driver: `
      ${rowsPerPage(25)}
      ${TYPED_SALES_COLUMNS}
    `,
  },
];

const only = process.argv.slice(2);
const selected = only.length ? shots.filter((s) => only.includes(s.name)) : shots;
if (selected.length === 0) {
  console.error('No shots matched. Available: ' + shots.map((s) => s.name).join(', '));
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'csvshot-'));
mkdirSync(join(root, 'assets'), { recursive: true });

for (const shot of selected) {
  const file = `screenshot-${shot.name}.png`;
  const pagePath = join(workDir, `${shot.name}.html`);
  writeFileSync(pagePath, buildPage(shot));

  const outPath = join(root, 'assets', file);
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${shot.width || DEFAULT_WIDTH},${shot.height}`,
      `--screenshot=${outPath}`,
      '--virtual-time-budget=4000',
      `file://${pagePath}`,
    ],
    { stdio: 'pipe' }
  );

  console.log('wrote assets/' + file);
}

console.log(`\nDone — ${selected.length} screenshot(s) in assets/.`);
