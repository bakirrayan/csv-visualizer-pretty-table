// @ts-check
/**
 * Webview UI for the CSV table view.
 *
 * Runs under a nonce CSP, so there are no inline event handlers: every
 * interaction is wired with addEventListener, mostly via delegation on the
 * table head/body. All user data reaches the DOM through textContent or
 * setAttribute, never innerHTML — CSV headers and cells are untrusted input.
 */

(function () {
  const vscode = acquireVsCodeApi();

  /** Maximum unique values rendered in a column dropdown before truncating. */
  const UNIQUE_VALUE_RENDER_LIMIT = 500;
  /** Debounce for the global search box, in ms. */
  const SEARCH_DEBOUNCE_MS = 150;
  /** Placeholder shown when an image URL fails to load. */
  const BROKEN_IMAGE_SRC =
    'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23718096%22>&#10005;</text></svg>';

  const COLUMN_TYPES = [
    ['text', 'Text'],
    ['number', 'Number'],
    ['date', 'Date'],
    ['bool', 'Boolean'],
    ['link', 'Link'],
    ['image', 'Image'],
    ['json', 'JSON'],
    ['array', 'Array'],
    ['html', 'HTML'],
    ['raw', 'Raw'],
    ['base64', 'Base64'],
  ];

  const FILTER_OPERATORS = [
    ['contains', 'Contains'],
    ['equals', 'Equals'],
    ['notEquals', 'Not Equals'],
    ['startsWith', 'Starts With'],
    ['endsWith', 'Ends With'],
    ['greaterThan', 'Greater >'],
    ['lessThan', 'Less <'],
    ['greaterOrEqual', 'Greater >='],
    ['lessOrEqual', 'Less <='],
    ['isEmpty', 'Is Empty'],
    ['isNotEmpty', 'Not Empty'],
  ];

  /** Protocols permitted for `link` columns. */
  const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

  // ---------------------------------------------------------------- state

  /** Raw rows, never mutated after load — row identity is its index here. */
  let rows = [];
  let totalRowCount = 0;

  /**
   * Display columns. `sourceIndex` is the position in a raw row; reordering
   * shuffles this array only, so row data and row identity stay stable.
   * @type {{id: string, name: string, type: string, visible: boolean, sourceIndex: number}[]}
   */
  let columns = [];

  /** Filter state keyed by column id (names may repeat in a CSV). */
  let columnFilters = {};
  /** Unique-value maps keyed by sourceIndex. */
  let uniqueValuesCache = {};

  /** Indexes into `rows` that survive the current filters, in sort order. */
  let filteredIndexes = [];
  /** Row indexes the user has ticked. */
  let selectedRows = new Set();

  let currentPage = 1;
  let rowsPerPage = 25;
  let totalPages = 1;
  let sortColumnId = null;
  let sortDirection = 'asc';
  let globalSearchTerm = '';

  let lightboxImages = [];
  let lightboxCurrentIndex = 0;

  // ---------------------------------------------------------------- helpers

  /**
   * @param {string} id
   * @returns {any} the element, or null if absent
   */
  function el(id) {
    return document.getElementById(id);
  }

  /**
   * A fresh, unrestricted filter. `selectedValues === null` means "no value
   * restriction"; an empty Set means "nothing selected", which matches no rows.
   */
  function newFilter() {
    return { operator: 'contains', value: '', selectedValues: null };
  }

  function findColumn(id) {
    return columns.find((c) => c.id === id);
  }

  function visibleColumns() {
    return columns.filter((c) => c.visible);
  }

  function postCopy(text, message) {
    vscode.postMessage({ command: 'copyToClipboard', text: text, message: message });
  }

  function postNotice(message) {
    vscode.postMessage({ command: 'showMessage', message: message });
  }

  /**
   * Split on commas that begin a new URL, so a `data:` URI — which always
   * contains a comma of its own — survives intact.
   */
  const IMAGE_LIST_SEPARATOR =
    /,(?=\s*["']?(?:https?:\/\/|data:|file:\/\/|\.{0,2}\/|[A-Za-z]:[\\/]|[\w.\-%]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif|ico)\b))/i;

  /**
   * Split a cell into image URLs. Handles `['a','b']`-style lists, bare
   * comma-separated lists, and single URLs.
   * @param {string} value
   * @returns {string[]}
   */
  function parseImageUrls(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return [];

    const body = raw.startsWith('[') ? raw.slice(1, raw.endsWith(']') ? -1 : undefined).trim() : raw;

    return body
      .split(IMAGE_LIST_SEPARATOR)
      .map((part) => part.trim().replace(/^["']|["']$/g, '').trim())
      .filter(Boolean);
  }

  /** @param {string} value */
  function safeHref(value) {
    try {
      const url = new URL(String(value), 'https://invalid.example');
      return SAFE_PROTOCOLS.includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- data in

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'setData') {
      loadData(message.data);
    }
  });

  function loadData(data) {
    rows = data.rows || [];
    totalRowCount = data.rowCount || rows.length;

    columns = (data.headers || []).map((name, index) => ({
      id: 'c' + index,
      name: String(name),
      type: 'text',
      visible: true,
      sourceIndex: index,
    }));

    columnFilters = {};
    columns.forEach((col) => {
      columnFilters[col.id] = newFilter();
    });

    uniqueValuesCache = {};
    selectedRows = new Set();
    sortColumnId = null;
    currentPage = 1;
    globalSearchTerm = '';
    const search = el('globalSearch');
    if (search) search.value = '';

    applyFilters();
    renderColumnConfig();
    renderHeaders();
    renderTableBody();
    updateStats();
    updateSelectAllColumnsCheckbox();
  }

  // ---------------------------------------------------------------- filtering

  function applyFilters() {
    const term = globalSearchTerm;

    filteredIndexes = [];
    for (let i = 0; i < rows.length; i++) {
      if (rowMatches(rows[i], term)) filteredIndexes.push(i);
    }

    if (sortColumnId !== null) {
      const col = findColumn(sortColumnId);
      if (col) {
        const src = col.sourceIndex;
        const factor = sortDirection === 'asc' ? 1 : -1;
        filteredIndexes.sort((ia, ib) => {
          const aVal = rows[ia][src];
          const bVal = rows[ib][src];
          let comparison;
          if (col.type === 'number') {
            const an = parseFloat(aVal);
            const bn = parseFloat(bVal);
            const aBad = isNaN(an);
            const bBad = isNaN(bn);
            // Non-numeric values sort last regardless of direction.
            if (aBad && bBad) comparison = 0;
            else if (aBad) return 1;
            else if (bBad) return -1;
            else comparison = an - bn;
          } else if (col.type === 'date') {
            const at = new Date(aVal).getTime();
            const bt = new Date(bVal).getTime();
            const aBad = isNaN(at);
            const bBad = isNaN(bt);
            if (aBad && bBad) comparison = 0;
            else if (aBad) return 1;
            else if (bBad) return -1;
            else comparison = at - bt;
          } else {
            comparison = String(aVal == null ? '' : aVal).localeCompare(String(bVal == null ? '' : bVal));
          }
          return comparison * factor;
        });
      }
    }

    recalculatePagination();
  }

  function rowMatches(row, term) {
    if (term) {
      let hit = false;
      for (let i = 0; i < row.length; i++) {
        if (String(row[i]).toLowerCase().includes(term)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }

    for (const col of columns) {
      const filter = columnFilters[col.id];
      if (!filter) continue;

      const cellValue = String(row[col.sourceIndex] == null ? '' : row[col.sourceIndex]);

      if (filter.selectedValues && !filter.selectedValues.has(cellValue)) {
        return false;
      }

      const operator = filter.operator;
      const filterValue = filter.value;
      if (!filterValue && operator !== 'isEmpty' && operator !== 'isNotEmpty') continue;

      const cellLower = cellValue.toLowerCase();
      const filterLower = filterValue.toLowerCase();
      const cellNum = parseFloat(cellValue);
      const filterNum = parseFloat(filterValue);
      let ok;

      switch (operator) {
        case 'contains': ok = cellLower.includes(filterLower); break;
        case 'equals': ok = cellLower === filterLower; break;
        case 'notEquals': ok = cellLower !== filterLower; break;
        case 'startsWith': ok = cellLower.startsWith(filterLower); break;
        case 'endsWith': ok = cellLower.endsWith(filterLower); break;
        case 'greaterThan': ok = !isNaN(cellNum) && !isNaN(filterNum) && cellNum > filterNum; break;
        case 'lessThan': ok = !isNaN(cellNum) && !isNaN(filterNum) && cellNum < filterNum; break;
        case 'greaterOrEqual': ok = !isNaN(cellNum) && !isNaN(filterNum) && cellNum >= filterNum; break;
        case 'lessOrEqual': ok = !isNaN(cellNum) && !isNaN(filterNum) && cellNum <= filterNum; break;
        case 'isEmpty': ok = cellValue === ''; break;
        case 'isNotEmpty': ok = cellValue !== ''; break;
        default: ok = true;
      }

      if (!ok) return false;
    }

    return true;
  }

  function recalculatePagination() {
    const select = el('rowsPerPage');
    const raw = select ? select.value : '25';
    rowsPerPage = raw === 'all' ? Math.max(filteredIndexes.length, 1) : parseInt(raw, 10) || 25;
    totalPages = Math.max(Math.ceil(filteredIndexes.length / rowsPerPage), 1);
    currentPage = Math.max(1, Math.min(currentPage, totalPages));

    const pageInput = el('pageInput');
    if (pageInput) pageInput.max = String(totalPages);
  }

  function getUniqueValues(col) {
    const key = String(col.sourceIndex);
    if (uniqueValuesCache[key]) return uniqueValuesCache[key];

    const counts = new Map();
    for (let i = 0; i < rows.length; i++) {
      const value = String(rows[i][col.sourceIndex] == null ? '' : rows[i][col.sourceIndex]);
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    const result = Array.from(counts, ([value, count]) => ({ value, count })).sort(
      (a, b) => b.count - a.count
    );
    uniqueValuesCache[key] = result;
    return result;
  }

  // ---------------------------------------------------------------- column config

  function renderColumnConfig() {
    const container = el('columnConfig');
    if (!container) return;
    container.textContent = '';

    const fragment = document.createDocumentFragment();

    columns.forEach((col, index) => {
      const item = document.createElement('div');
      item.className = 'column-item' + (col.visible ? '' : ' hidden');
      item.dataset.colId = col.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = col.visible;
      checkbox.dataset.action = 'toggle-visibility';
      item.appendChild(checkbox);

      const name = document.createElement('div');
      name.className = 'column-name';
      name.textContent = col.name;
      name.title = col.name;
      item.appendChild(name);

      const select = document.createElement('select');
      select.dataset.action = 'set-type';
      COLUMN_TYPES.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = col.type === value;
        select.appendChild(option);
      });
      item.appendChild(select);

      const up = document.createElement('button');
      up.textContent = '◀';
      up.title = 'Move left';
      up.dataset.action = 'move-up';
      up.disabled = index === 0;
      item.appendChild(up);

      const down = document.createElement('button');
      down.textContent = '▶';
      down.title = 'Move right';
      down.dataset.action = 'move-down';
      down.disabled = index === columns.length - 1;
      item.appendChild(down);

      fragment.appendChild(item);
    });

    container.appendChild(fragment);
  }

  function updateSelectAllColumnsCheckbox() {
    const checkbox = el('selectAllColumns');
    if (!checkbox || columns.length === 0) return;
    const allVisible = columns.every((c) => c.visible);
    const noneVisible = columns.every((c) => !c.visible);
    checkbox.checked = allVisible;
    checkbox.indeterminate = !allVisible && !noneVisible;
  }

  function moveColumn(colId, direction) {
    const index = columns.findIndex((c) => c.id === colId);
    const newIndex = index + direction;
    if (index < 0 || newIndex < 0 || newIndex >= columns.length) return;

    const temp = columns[index];
    columns[index] = columns[newIndex];
    columns[newIndex] = temp;

    // Row data is untouched, so filters, selection and caches all stay valid.
    renderColumnConfig();
    renderHeaders();
    renderTableBody();
  }

  // ---------------------------------------------------------------- headers

  function renderHeaders() {
    const thead = el('tableHead');
    if (!thead) return;
    thead.textContent = '';

    const headerRow = document.createElement('tr');

    const selectTh = document.createElement('th');
    selectTh.className = 'row-select-cell';
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAll.className = 'row-select-checkbox';
    selectAll.title = 'Select all on page';
    selectAll.id = 'selectPageCheckbox';
    selectTh.appendChild(selectAll);
    headerRow.appendChild(selectTh);

    visibleColumns().forEach((col) => {
      headerRow.appendChild(buildHeaderCell(col));
    });

    thead.appendChild(headerRow);
  }

  function buildHeaderCell(col) {
    const filter = columnFilters[col.id];
    const th = document.createElement('th');
    th.dataset.colId = col.id;

    const content = document.createElement('div');
    content.className = 'th-content';
    const label = document.createElement('span');
    label.textContent = col.name;
    label.title = col.name;
    content.appendChild(label);

    const sortButtons = document.createElement('div');
    sortButtons.className = 'sort-buttons';
    [['asc', '▲', 'Sort ascending'], ['desc', '▼', 'Sort descending']].forEach(
      ([dir, glyph, title]) => {
        const btn = document.createElement('button');
        btn.className =
          'sort-btn' + (sortColumnId === col.id && sortDirection === dir ? ' active' : '');
        btn.textContent = glyph;
        btn.title = title;
        btn.dataset.action = 'sort';
        btn.dataset.direction = dir;
        sortButtons.appendChild(btn);
      }
    );
    content.appendChild(sortButtons);
    th.appendChild(content);

    const filterWrap = document.createElement('div');
    filterWrap.className = 'column-filter';

    const filterRow = document.createElement('div');
    filterRow.className = 'column-filter-row';

    const operatorSelect = document.createElement('select');
    operatorSelect.dataset.action = 'set-operator';
    operatorSelect.title = 'Filter operator';
    FILTER_OPERATORS.forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      option.selected = filter.operator === value;
      operatorSelect.appendChild(option);
    });
    filterRow.appendChild(operatorSelect);

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter value...';
    filterInput.value = filter.value;
    filterInput.dataset.action = 'set-filter-value';
    filterInput.disabled = filter.operator === 'isEmpty' || filter.operator === 'isNotEmpty';
    filterRow.appendChild(filterInput);

    filterWrap.appendChild(filterRow);

    const toggle = document.createElement('button');
    toggle.className = 'filter-toggle';
    toggle.dataset.action = 'toggle-unique';
    toggle.textContent = 'Select Values ▾';
    filterWrap.appendChild(toggle);

    // Contents are built on first open — a high-cardinality column would
    // otherwise create tens of thousands of nodes on every header render.
    const dropdown = document.createElement('div');
    dropdown.className = 'unique-values';
    dropdown.dataset.colId = col.id;
    dropdown.dataset.populated = 'false';
    filterWrap.appendChild(dropdown);

    th.appendChild(filterWrap);
    return th;
  }

  function populateUniqueValues(dropdown, col) {
    const filter = columnFilters[col.id];
    const uniqueValues = getUniqueValues(col);
    dropdown.textContent = '';

    const fragment = document.createDocumentFragment();

    fragment.appendChild(
      buildUniqueControlRow('(Select All)', filter.selectedValues === null, 'select-all')
    );
    fragment.appendChild(
      buildUniqueControlRow(
        '(Clear All)',
        filter.selectedValues !== null && filter.selectedValues.size === 0,
        'clear-all'
      )
    );

    const shown = uniqueValues.slice(0, UNIQUE_VALUE_RENDER_LIMIT);
    if (uniqueValues.length > shown.length) {
      const note = document.createElement('div');
      note.className = 'unique-value-note';
      note.textContent =
        'Showing the ' + shown.length + ' most common of ' + uniqueValues.length + ' values';
      fragment.appendChild(note);
    }

    shown.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'unique-value-item';
      row.dataset.action = 'toggle-unique-value';
      row.dataset.value = item.value;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'unique-value-checkbox';
      checkbox.checked = filter.selectedValues === null || filter.selectedValues.has(item.value);
      row.appendChild(checkbox);

      const text = document.createElement('span');
      text.className = 'unique-value-text';
      text.textContent = item.value || '(empty)';
      text.title = item.value;
      row.appendChild(text);

      const count = document.createElement('span');
      count.className = 'unique-value-count';
      count.textContent = String(item.count);
      row.appendChild(count);

      fragment.appendChild(row);
    });

    dropdown.appendChild(fragment);
    dropdown.dataset.populated = 'true';

    const toggle = dropdown.parentElement
      ? dropdown.parentElement.querySelector('[data-action="toggle-unique"]')
      : null;
    if (toggle) toggle.textContent = 'Select Values (' + uniqueValues.length + ') ▾';
  }

  function buildUniqueControlRow(labelText, checked, action) {
    const row = document.createElement('div');
    row.className = 'unique-value-item';
    row.dataset.action = action;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'unique-value-checkbox';
    checkbox.checked = checked;
    row.appendChild(checkbox);

    const text = document.createElement('span');
    text.className = 'unique-value-text';
    const strong = document.createElement('strong');
    strong.textContent = labelText;
    text.appendChild(strong);
    row.appendChild(text);

    return row;
  }

  /** Refresh sort-button highlighting without rebuilding the header DOM. */
  function refreshSortIndicators() {
    const thead = el('tableHead');
    if (!thead) return;
    thead.querySelectorAll('th[data-col-id]').forEach((th) => {
      const colId = th.dataset.colId;
      th.querySelectorAll('.sort-btn').forEach((btn) => {
        const active = colId === sortColumnId && btn.dataset.direction === sortDirection;
        btn.classList.toggle('active', active);
      });
    });
  }

  // ---------------------------------------------------------------- body

  function renderTableBody() {
    const tbody = el('tableBody');
    if (!tbody) return;
    tbody.textContent = '';

    const start = (currentPage - 1) * rowsPerPage;
    const pageIndexes = filteredIndexes.slice(start, start + rowsPerPage);

    if (pageIndexes.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = visibleColumns().length + 1;
      td.className = 'no-data';
      td.textContent = 'No data matches your filters';
      tr.appendChild(td);
      tbody.appendChild(tr);
      updatePaginationInfo();
      updateSelectedRowCount();
      updatePageCheckbox();
      return;
    }

    const fragment = document.createDocumentFragment();
    const visible = visibleColumns();

    pageIndexes.forEach((rowIndex) => {
      const row = rows[rowIndex];
      const tr = document.createElement('tr');
      tr.dataset.rowIndex = String(rowIndex);
      if (selectedRows.has(rowIndex)) tr.classList.add('selected');

      const selectTd = document.createElement('td');
      selectTd.className = 'row-select-cell';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'row-select-checkbox';
      checkbox.checked = selectedRows.has(rowIndex);
      checkbox.dataset.action = 'select-row';
      selectTd.appendChild(checkbox);
      tr.appendChild(selectTd);

      visible.forEach((col) => {
        tr.appendChild(buildCell(col, row, rowIndex));
      });

      fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
    updatePaginationInfo();
    updateSelectedRowCount();
    updatePageCheckbox();
  }

  function buildCell(col, row, rowIndex) {
    const td = document.createElement('td');
    td.className = 'cell-' + col.type;

    const raw = row[col.sourceIndex];
    const value = String(raw == null ? '' : raw);
    td.dataset.value = value;

    switch (col.type) {
      case 'image':
        renderImageCell(td, value, col, rowIndex);
        break;

      case 'link': {
        if (value) {
          const href = safeHref(value);
          if (href) {
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.target = '_blank';
            anchor.rel = 'noreferrer noopener';
            anchor.textContent = value;
            td.appendChild(anchor);
          } else {
            // Unsupported scheme (javascript:, data:, ...) — show as plain text.
            td.textContent = value;
          }
        } else {
          td.textContent = '—';
        }
        td.appendChild(buildCopyButton());
        break;
      }

      case 'bool': {
        const isTruthy = ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
        td.className += isTruthy ? ' true' : ' false';
        td.textContent = isTruthy ? '✓ True' : '✗ False';
        break;
      }

      case 'json': {
        try {
          td.textContent = JSON.stringify(JSON.parse(value), null, 2);
        } catch {
          td.textContent = value;
        }
        td.appendChild(buildCopyButton());
        break;
      }

      case 'number': {
        const num = parseFloat(value);
        td.textContent = isNaN(num) ? value : num.toLocaleString();
        td.appendChild(buildCopyButton());
        break;
      }

      case 'date': {
        const date = new Date(value);
        td.textContent = isNaN(date.getTime()) ? value : date.toLocaleDateString();
        td.appendChild(buildCopyButton());
        break;
      }

      default:
        td.textContent = value || '—';
        td.title = value;
        if (value) td.appendChild(buildCopyButton());
    }

    return td;
  }

  function buildCopyButton() {
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    button.dataset.action = 'copy-cell';
    return button;
  }

  /** One code path for single URLs, bracketed lists and comma-separated lists. */
  function renderImageCell(td, value, col, rowIndex) {
    const urls = parseImageUrls(value);
    if (urls.length === 0) {
      td.textContent = '—';
      return;
    }

    const target = urls.length > 1 ? document.createElement('div') : td;
    if (urls.length > 1) target.className = 'image-list-container';

    urls.forEach((url, imgIndex) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Image';
      img.title = url;
      img.dataset.action = 'open-lightbox';
      img.dataset.rowIndex = String(rowIndex);
      img.dataset.colId = col.id;
      img.dataset.imgIndex = String(imgIndex);
      img.addEventListener('error', function () {
        // Swap once; a failing placeholder must not loop.
        if (img.dataset.failed !== 'true') {
          img.dataset.failed = 'true';
          img.src = BROKEN_IMAGE_SRC;
        }
      });
      target.appendChild(img);
    });

    if (urls.length > 1) td.appendChild(target);
  }

  // ---------------------------------------------------------------- stats & paging

  function updatePaginationInfo() {
    const info = el('paginationInfo');
    if (!info) return;
    const total = filteredIndexes.length;
    const start = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(currentPage * rowsPerPage, total);
    info.textContent = 'Showing ' + start + '-' + end + ' of ' + total + ' rows';
    const pageInput = el('pageInput');
    if (pageInput) pageInput.value = String(currentPage);
  }

  function updateStats() {
    const set = (id, text) => {
      const node = el(id);
      if (node) node.textContent = text;
    };
    set('totalRows', totalRowCount.toLocaleString());
    set('visibleRows', filteredIndexes.length.toLocaleString());
    set('totalColumns', String(columns.length));
    set('visibleColumns', String(visibleColumns().length));
  }

  function goToPage(page) {
    const target = Math.max(1, Math.min(page, totalPages));
    if (isNaN(target)) return;
    currentPage = target;
    renderTableBody();
  }

  // ---------------------------------------------------------------- selection

  function updateSelectedRowCount() {
    const node = el('selectedRowCount');
    if (node) node.textContent = String(selectedRows.size);
  }

  function updatePageCheckbox() {
    const checkbox = el('selectPageCheckbox');
    if (!checkbox) return;
    const start = (currentPage - 1) * rowsPerPage;
    const pageIndexes = filteredIndexes.slice(start, start + rowsPerPage);
    const all = pageIndexes.length > 0 && pageIndexes.every((i) => selectedRows.has(i));
    const none = pageIndexes.every((i) => !selectedRows.has(i));
    checkbox.checked = all;
    checkbox.indeterminate = !all && !none;
  }

  function copySelectedRows() {
    if (selectedRows.size === 0) {
      postNotice('No rows selected');
      return;
    }

    const visible = visibleColumns();
    // Tab-separated so the result pastes straight into a spreadsheet.
    const lines = [visible.map((col) => col.name).join('\t')];

    filteredIndexes.forEach((rowIndex) => {
      if (!selectedRows.has(rowIndex)) return;
      const row = rows[rowIndex];
      lines.push(
        visible
          .map((col) => String(row[col.sourceIndex] == null ? '' : row[col.sourceIndex]).replace(/[\t\r\n]+/g, ' '))
          .join('\t')
      );
    });

    postCopy(lines.join('\n'), 'Copied ' + selectedRows.size + ' row(s) to the clipboard');
  }

  // ---------------------------------------------------------------- lightbox

  function openLightbox(rowIndex, colId, imgIndex) {
    const col = findColumn(colId);
    if (!col) return;

    const row = rows[rowIndex];
    lightboxImages = parseImageUrls(String(row[col.sourceIndex] == null ? '' : row[col.sourceIndex]));
    if (lightboxImages.length === 0) return;

    const modal = el('lightboxModal');
    if (modal) modal.classList.add('active');

    const first = visibleColumns()[0];
    const title = el('lightboxTitle');
    if (title) {
      const label = first ? String(row[first.sourceIndex] == null ? '' : row[first.sourceIndex]) : '';
      title.textContent = 'Images from: ' + (label || 'Row');
    }

    showLightboxImage(Math.max(0, Math.min(imgIndex, lightboxImages.length - 1)));
    renderLightboxThumbnails();
    document.addEventListener('keydown', handleLightboxKeyboard);
  }

  function closeLightbox() {
    const modal = el('lightboxModal');
    if (modal) modal.classList.remove('active');
    document.removeEventListener('keydown', handleLightboxKeyboard);
  }

  function handleLightboxKeyboard(e) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'ArrowRight') navigateLightbox(1);
  }

  function navigateLightbox(direction) {
    const newIndex = lightboxCurrentIndex + direction;
    if (newIndex >= 0 && newIndex < lightboxImages.length) showLightboxImage(newIndex);
  }

  function showLightboxImage(index) {
    lightboxCurrentIndex = index;

    const img = el('lightboxImage');
    if (img) img.src = lightboxImages[index];

    const counter = el('lightboxCounter');
    if (counter) counter.textContent = index + 1 + ' / ' + lightboxImages.length;

    const prev = el('lightboxPrev');
    const next = el('lightboxNext');
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === lightboxImages.length - 1;

    updateLightboxThumbnails();
  }

  function renderLightboxThumbnails() {
    const container = el('lightboxThumbnails');
    if (!container) return;
    container.textContent = '';

    lightboxImages.forEach((src, index) => {
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.className = 'lightbox-thumbnail' + (index === lightboxCurrentIndex ? ' active' : '');
      thumb.dataset.thumbIndex = String(index);
      container.appendChild(thumb);
    });
  }

  function updateLightboxThumbnails() {
    const thumbs = document.querySelectorAll('.lightbox-thumbnail');
    thumbs.forEach((thumb, index) => {
      thumb.classList.toggle('active', index === lightboxCurrentIndex);
    });
    const active = thumbs[lightboxCurrentIndex];
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // ---------------------------------------------------------------- events

  const columnConfig = el('columnConfig');
  if (columnConfig) {
    columnConfig.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const item = button.closest('.column-item');
      if (!item) return;
      if (button.dataset.action === 'move-up') moveColumn(item.dataset.colId, -1);
      if (button.dataset.action === 'move-down') moveColumn(item.dataset.colId, 1);
    });

    columnConfig.addEventListener('change', (e) => {
      const target = e.target;
      const item = target.closest('.column-item');
      if (!item) return;
      const col = findColumn(item.dataset.colId);
      if (!col) return;

      if (target.dataset.action === 'toggle-visibility') {
        col.visible = target.checked;
        item.classList.toggle('hidden', !col.visible);
        renderHeaders();
        renderTableBody();
        updateStats();
        updateSelectAllColumnsCheckbox();
      } else if (target.dataset.action === 'set-type') {
        col.type = target.value;
        applyFilters();
        renderTableBody();
      }
    });
  }

  const selectAllColumns = el('selectAllColumns');
  if (selectAllColumns) {
    selectAllColumns.addEventListener('change', () => {
      const visible = selectAllColumns.checked;
      columns.forEach((col) => {
        col.visible = visible;
      });
      renderColumnConfig();
      renderHeaders();
      renderTableBody();
      updateStats();
    });
  }

  const columnConfigToggle = el('columnConfigToggle');
  if (columnConfigToggle) {
    columnConfigToggle.addEventListener('click', () => {
      const content = el('columnConfigContent');
      const icon = el('columnConfigIcon');
      if (content) content.classList.toggle('open');
      if (icon) icon.classList.toggle('open');
    });
  }

  const thead = el('tableHead');
  if (thead) {
    thead.addEventListener('click', (e) => {
      const target = e.target;

      const sortBtn = target.closest('[data-action="sort"]');
      if (sortBtn) {
        const th = sortBtn.closest('th[data-col-id]');
        sortColumnId = th.dataset.colId;
        sortDirection = sortBtn.dataset.direction;
        applyFilters();
        refreshSortIndicators();
        renderTableBody();
        return;
      }

      const toggleBtn = target.closest('[data-action="toggle-unique"]');
      if (toggleBtn) {
        const th = toggleBtn.closest('th[data-col-id]');
        const dropdown = th.querySelector('.unique-values');
        const col = findColumn(th.dataset.colId);
        if (!dropdown || !col) return;

        document.querySelectorAll('.unique-values').forEach((other) => {
          if (other !== dropdown) other.classList.remove('show');
        });

        if (dropdown.dataset.populated !== 'true') populateUniqueValues(dropdown, col);
        dropdown.classList.toggle('show');
        return;
      }

      const uniqueRow = target.closest('.unique-value-item');
      if (uniqueRow) {
        e.stopPropagation();
        const th = uniqueRow.closest('th[data-col-id]');
        const col = findColumn(th.dataset.colId);
        if (!col) return;
        const filter = columnFilters[col.id];
        const action = uniqueRow.dataset.action;

        if (action === 'select-all') {
          filter.selectedValues = null;
        } else if (action === 'clear-all') {
          filter.selectedValues = new Set();
        } else if (action === 'toggle-unique-value') {
          const value = uniqueRow.dataset.value;
          if (filter.selectedValues === null) {
            // Materialise the implicit "everything" set before removing from it.
            filter.selectedValues = new Set(getUniqueValues(col).map((item) => item.value));
          }
          if (filter.selectedValues.has(value)) filter.selectedValues.delete(value);
          else filter.selectedValues.add(value);
        } else {
          return;
        }

        currentPage = 1;
        applyFilters();
        const dropdown = th.querySelector('.unique-values');
        const wasOpen = dropdown.classList.contains('show');
        populateUniqueValues(dropdown, col);
        if (wasOpen) dropdown.classList.add('show');
        renderTableBody();
        updateStats();
      }
    });

    thead.addEventListener('change', (e) => {
      const target = e.target;
      if (target.dataset.action !== 'set-operator') {
        if (target.id === 'selectPageCheckbox') {
          const start = (currentPage - 1) * rowsPerPage;
          filteredIndexes.slice(start, start + rowsPerPage).forEach((rowIndex) => {
            if (target.checked) selectedRows.add(rowIndex);
            else selectedRows.delete(rowIndex);
          });
          renderTableBody();
        }
        return;
      }

      const th = target.closest('th[data-col-id]');
      const col = findColumn(th.dataset.colId);
      if (!col) return;

      columnFilters[col.id].operator = target.value;
      const input = th.querySelector('[data-action="set-filter-value"]');
      if (input) {
        input.disabled = target.value === 'isEmpty' || target.value === 'isNotEmpty';
      }
      currentPage = 1;
      applyFilters();
      renderTableBody();
      updateStats();
    });

    thead.addEventListener('input', (e) => {
      const target = e.target;
      if (target.dataset.action !== 'set-filter-value') return;
      const th = target.closest('th[data-col-id]');
      const col = findColumn(th.dataset.colId);
      if (!col) return;

      columnFilters[col.id].value = target.value;
      currentPage = 1;
      applyFilters();
      renderTableBody();
      updateStats();
    });
  }

  const tbody = el('tableBody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const target = e.target;

      const copyBtn = target.closest('[data-action="copy-cell"]');
      if (copyBtn) {
        e.stopPropagation();
        const td = copyBtn.closest('td');
        postCopy(td.dataset.value || '', null);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1500);
        return;
      }

      const img = target.closest('[data-action="open-lightbox"]');
      if (img) {
        e.stopPropagation();
        openLightbox(
          parseInt(img.dataset.rowIndex, 10),
          img.dataset.colId,
          parseInt(img.dataset.imgIndex, 10)
        );
        return;
      }

      if (target.tagName === 'INPUT') return;

      const td = target.closest('td');
      if (td && !td.classList.contains('row-select-cell')) td.classList.toggle('expanded');
    });

    tbody.addEventListener('change', (e) => {
      const target = e.target;
      if (target.dataset.action !== 'select-row') return;
      const tr = target.closest('tr');
      const rowIndex = parseInt(tr.dataset.rowIndex, 10);
      if (target.checked) selectedRows.add(rowIndex);
      else selectedRows.delete(rowIndex);
      tr.classList.toggle('selected', target.checked);
      updateSelectedRowCount();
      updatePageCheckbox();
    });
  }

  const selectAllRows = el('selectAllRowsCheckbox');
  if (selectAllRows) {
    selectAllRows.addEventListener('change', () => {
      if (selectAllRows.checked) filteredIndexes.forEach((i) => selectedRows.add(i));
      else selectedRows.clear();
      renderTableBody();
    });
  }

  const clearSelectionBtn = el('clearSelectionBtn');
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => {
      selectedRows.clear();
      const box = el('selectAllRowsCheckbox');
      if (box) box.checked = false;
      renderTableBody();
    });
  }

  const copySelectedBtn = el('copySelectedBtn');
  if (copySelectedBtn) copySelectedBtn.addEventListener('click', copySelectedRows);

  const clearFiltersBtn = el('clearFiltersBtn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      const search = el('globalSearch');
      if (search) search.value = '';
      globalSearchTerm = '';
      columns.forEach((col) => {
        columnFilters[col.id] = newFilter();
      });
      currentPage = 1;
      applyFilters();
      renderHeaders();
      renderTableBody();
      updateStats();
    });
  }

  let searchTimer = null;
  const globalSearch = el('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        globalSearchTerm = globalSearch.value.toLowerCase();
        currentPage = 1;
        applyFilters();
        renderTableBody();
        updateStats();
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  const rowsPerPageSelect = el('rowsPerPage');
  if (rowsPerPageSelect) {
    rowsPerPageSelect.addEventListener('change', () => {
      currentPage = 1;
      recalculatePagination();
      renderTableBody();
    });
  }

  const pageInput = el('pageInput');
  if (pageInput) {
    pageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') goToPage(parseInt(pageInput.value, 10));
    });
  }

  document.querySelectorAll('[data-page-action]').forEach((node) => {
    const button = /** @type {HTMLElement} */ (node);
    button.addEventListener('click', () => {
      const action = button.dataset.pageAction;
      if (action === 'first') goToPage(1);
      else if (action === 'prev') goToPage(currentPage - 1);
      else if (action === 'next') goToPage(currentPage + 1);
      else if (action === 'last') goToPage(totalPages);
      else if (action === 'go') {
        const input = el('pageInput');
        goToPage(parseInt(input ? input.value : '1', 10));
      }
    });
  });

  // Close open unique-value dropdowns on an outside click.
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.closest('.column-filter')) {
      document.querySelectorAll('.unique-values').forEach((node) => node.classList.remove('show'));
    }
  });

  const lightboxModal = el('lightboxModal');
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  const lightboxClose = el('lightboxClose');
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);

  const lightboxPrev = el('lightboxPrev');
  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateLightbox(-1);
    });
  }

  const lightboxNext = el('lightboxNext');
  if (lightboxNext) {
    lightboxNext.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateLightbox(1);
    });
  }

  const lightboxThumbnails = el('lightboxThumbnails');
  if (lightboxThumbnails) {
    lightboxThumbnails.addEventListener('click', (e) => {
      e.stopPropagation();
      const thumb = e.target.closest('[data-thumb-index]');
      if (thumb) showLightboxImage(parseInt(thumb.dataset.thumbIndex, 10));
    });
  }

  const lightboxContent = el('lightboxContent');
  if (lightboxContent) lightboxContent.addEventListener('click', (e) => e.stopPropagation());

  vscode.postMessage({ command: 'ready' });
})();
