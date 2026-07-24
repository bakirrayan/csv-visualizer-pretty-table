/**
 * Loads the real webview bundle in headless Chrome against the hostile fixture
 * and asserts the escaping, filtering and selection invariants hold.
 *
 *   node scripts/smoke.mjs
 *
 * Dev-only; excluded from the published extension.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { parseCSV } = require(join(root, 'out/parser/csvParser.js'));

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const html = readFileSync(join(root, 'media/index.html'), 'utf8');
const css = readFileSync(join(root, 'media/style.css'), 'utf8');
const js = readFileSync(join(root, 'media/main.js'), 'utf8');
const parsed = parseCSV(readFileSync(join(root, 'scripts/fixtures/hostile.csv'), 'utf8'), 'hostile.csv');

// Append a gallery column so image parsing can be exercised too: row 0 holds a
// single data: URI (which contains a comma of its own), row 1 holds two.
const DATA_URI = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='8'%20height='8'%3E%3C/svg%3E";
parsed.headers.push('gallery');
parsed.rows.forEach((row, i) => {
  if (i === 0) row.push(DATA_URI);
  else if (i === 1) row.push(DATA_URI + ',' + DATA_URI);
  else row.push('');
});

/**
 * JSON for embedding inside an inline <script>. A CSV cell may legitimately
 * contain "</script>", which would otherwise close the element early.
 */
function inlineJson(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

const checks = `
  function record(name, pass, detail) {
    results.push((pass ? 'PASS' : 'FAIL') + ' :: ' + name + (detail ? ' :: ' + detail : ''));
  }

  record('no page errors', window.__errors.length === 0, JSON.stringify(window.__errors));
  record('table rendered', document.querySelectorAll('#tableHead th[data-col-id]').length > 0,
    'th=' + document.querySelectorAll('#tableHead th').length +
    ' rows=' + document.querySelectorAll('#tableBody tr').length +
    ' spans=' + document.querySelectorAll('#tableHead span').length);

  // 1. No script from the CSV executed.
  record('no script executed from CSV content', window.__xssFired !== true);

  // 2. Header text is literal, not parsed as markup.
  var headerSpans = document.querySelectorAll('#tableHead th[data-col-id] .th-content span');
  var secondHeader = headerSpans[1] ? headerSpans[1].textContent : '';
  record('markup header rendered literally', secondHeader === '<img src=x onerror=alert(1)>', JSON.stringify(secondHeader));
  record('no injected img element', document.querySelectorAll('#tableHead img').length === 0);

  // 3. Apostrophes survive in headers and in unique-value entries.
  var apostropheHeader = headerSpans[2] ? headerSpans[2].textContent : '';
  record('apostrophe header intact', apostropheHeader === "O'Brien", JSON.stringify(apostropheHeader));

  var toggles = document.querySelectorAll('#tableHead [data-action="toggle-unique"]');
  toggles[2].click();
  var items = document.querySelectorAll('#tableHead th[data-col-id]:nth-of-type(4) .unique-value-item .unique-value-text');
  var texts = Array.prototype.map.call(items, function (n) { return n.textContent; });
  record('apostrophe values listed', texts.indexOf("D'Angelo") !== -1, JSON.stringify(texts));
  toggles[2].click();

  // 4. javascript: link is not rendered as an anchor; https: is.
  var typeSelects = document.querySelectorAll('#columnConfig [data-action="set-type"]');
  typeSelects[4].value = 'link';
  typeSelects[4].dispatchEvent(new Event('change', { bubbles: true }));
  var linkCells = document.querySelectorAll('#tableBody tr td:nth-child(6)');
  record('javascript: URL not linkified', linkCells[0].querySelector('a') === null, linkCells[0].textContent);
  record('https URL linkified', linkCells[1].querySelector('a') !== null);
  record('mailto URL linkified', linkCells[2].querySelector('a') !== null);
  record('data: URL not linkified', linkCells[3].querySelector('a') === null);

  // 5. Duplicate column names keep independent filters.
  var inputs = document.querySelectorAll('#tableHead [data-action="set-filter-value"]');
  var notesA = inputs[5];
  notesA.value = 'first';
  notesA.dispatchEvent(new Event('input', { bubbles: true }));
  var afterFirst = document.querySelectorAll('#tableBody tr').length;
  record('filter on first duplicate column', afterFirst === 1, 'rows=' + afterFirst);
  record('second duplicate column filter untouched', inputs[6].value === '', JSON.stringify(inputs[6].value));
  notesA.value = '';
  notesA.dispatchEvent(new Event('input', { bubbles: true }));

  // 6. Column reorder keeps unique values correct and selection intact.
  document.getElementById('columnConfigToggle').click();
  var firstRowBox = document.querySelector('#tableBody tr input[data-action="select-row"]');
  firstRowBox.checked = true;
  firstRowBox.dispatchEvent(new Event('change', { bubbles: true }));
  var selectedBefore = document.getElementById('selectedRowCount').textContent;

  var moveBtn = document.querySelectorAll('#columnConfig [data-action="move-down"]')[0];
  moveBtn.click();
  var selectedAfter = document.getElementById('selectedRowCount').textContent;
  record('selection survives column reorder', selectedBefore === '1' && selectedAfter === '1', selectedBefore + '->' + selectedAfter);

  var newHeaders = Array.prototype.map.call(
    document.querySelectorAll('#tableHead th[data-col-id] .th-content span'),
    function (n) { return n.textContent; }
  );
  record('columns actually swapped', newHeaders[0] === '<img src=x onerror=alert(1)>' && newHeaders[1] === 'id', JSON.stringify(newHeaders.slice(0, 2)));

  // The unique dropdown for the moved column must show that column's values.
  var toggles2 = document.querySelectorAll('#tableHead [data-action="toggle-unique"]');
  toggles2[1].click();
  var idItems = document.querySelectorAll('#tableHead th[data-col-id]:nth-of-type(3) .unique-value-item .unique-value-text');
  var idTexts = Array.prototype.map.call(idItems, function (n) { return n.textContent; }).slice(2);
  record('unique values follow their column after reorder', idTexts.sort().join(',') === '1,2,3,4', JSON.stringify(idTexts));

  // 6b. Image cells: a data: URI keeps its own comma; a two-URI cell splits in two.
  var imageCol = Array.prototype.slice
    .call(document.querySelectorAll('#columnConfig .column-item'))
    .filter(function (item) { return item.querySelector('.column-name').textContent === 'gallery'; })[0];
  var imageSelect = imageCol.querySelector('[data-action="set-type"]');
  imageSelect.value = 'image';
  imageSelect.dispatchEvent(new Event('change', { bubbles: true }));

  var bodyRows = document.querySelectorAll('#tableBody tr');
  var singleCell = bodyRows[0].querySelector('td.cell-image');
  var pairCell = bodyRows[1].querySelector('td.cell-image');
  record('single data: URI renders as one image', singleCell.querySelectorAll('img').length === 1,
    'imgs=' + singleCell.querySelectorAll('img').length);
  record('two data: URIs render as two images', pairCell.querySelectorAll('img').length === 2,
    'imgs=' + pairCell.querySelectorAll('img').length);
  record('data: URI src not truncated at its comma',
    singleCell.querySelector('img').getAttribute('src').indexOf('%3Csvg') !== -1,
    singleCell.querySelector('img').getAttribute('src').slice(0, 40));

  imageSelect.value = 'text';
  imageSelect.dispatchEvent(new Event('change', { bubbles: true }));

  // 7. Clear All really clears.
  var clearAll = document.querySelectorAll('#tableHead th[data-col-id]:nth-of-type(3) [data-action="clear-all"]')[0];
  clearAll.click();
  record('clear all selects nothing', document.getElementById('visibleRows').textContent === '0', document.getElementById('visibleRows').textContent);
`;

const page = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace('<link rel="stylesheet" href="{{styleUri}}">', () => `<style>${css}</style>`)
  .replace(
    '<script nonce="{{nonce}}" src="{{scriptUri}}"></script>',
    () => `<script>
       window.__errors = [];
       window.addEventListener('error', function (e) { window.__errors.push(e.message); });
       window.__xssFired = false;
       window.alert = function () { window.__xssFired = true; };
       window.acquireVsCodeApi = function () {
         return {
           postMessage: function (m) {
             if (m && m.command === 'ready') {
               window.postMessage({ command: 'setData', data: ${inlineJson({
                 headers: parsed.headers,
                 rows: parsed.rows,
                 rowCount: parsed.rowCount,
               })} }, '*');
             }
           },
           getState: function () {}, setState: function () {},
         };
       };
     </script>
     <script>${js}</script>
     <script>
       var results = [];
       setTimeout(function () {
         try { ${checks} } catch (e) { results.push('FAIL :: threw :: ' + e.message + ' ' + e.stack); }
         var pre = document.createElement('pre');
         pre.id = 'results';
         pre.textContent = results.join('\\n');
         document.body.appendChild(pre);
       }, 60);
     </script>`
  );

const workDir = mkdtempSync(join(tmpdir(), 'csvsmoke-'));
const pagePath = join(workDir, 'smoke.html');
writeFileSync(pagePath, page);

const dom = execFileSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--virtual-time-budget=5000',
    '--dump-dom',
    `file://${pagePath}`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);

const match = dom.match(/<pre id="results">([\s\S]*?)<\/pre>/);
if (!match) {
  console.error('No results element found — the page failed to run.');
  process.exit(1);
}

const decoded = match[1]
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

console.log(decoded);
const failures = decoded.split('\n').filter((line) => line.startsWith('FAIL'));
console.log(`\n${failures.length === 0 ? 'All checks passed.' : failures.length + ' check(s) FAILED.'}`);
process.exit(failures.length === 0 ? 0 : 1);
