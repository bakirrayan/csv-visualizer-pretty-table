import * as vscode from 'vscode';
import { parseCSV } from './parser/csvParser';
import { ColumnType, ColumnMeta, ParsedCSV } from './types/csv';

export class CSVWebviewProvider {
  private static readonly viewType = 'csvVisualizer.webview';
  private panel: vscode.WebviewPanel | undefined;
  private parsedData: ParsedCSV | undefined;
  private columnMeta: ColumnMeta[] = [];
  private disposables: vscode.Disposable[] = [];

  private disposeCallbacks: (() => void)[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  public reveal() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    }
  }

  public onDidDispose(callback: () => void): vscode.Disposable {
    this.disposeCallbacks.push(callback);
    return new vscode.Disposable(() => {
      const index = this.disposeCallbacks.indexOf(callback);
      if (index > -1) {
        this.disposeCallbacks.splice(index, 1);
      }
    });
  }

  public async show(document: vscode.TextDocument) {
    const csvText = document.getText();
    this.parsedData = parseCSV(csvText);

    // Initialize column metadata
    this.columnMeta = this.parsedData.headers.map((name) => ({
      name,
      type: 'text' as ColumnType,
      visible: true,
      filter: '',
    }));

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        CSVWebviewProvider.viewType,
        `CSV: ${document.fileName.split(/[\\/]/).pop()}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.extensionUri],
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        // Call all registered dispose callbacks
        this.disposeCallbacks.forEach(callback => callback());
        this.disposeCallbacks = [];
        // Dispose all disposables
        while (this.disposables.length) {
          const disposable = this.disposables.pop();
          if (disposable) {
            disposable.dispose();
          }
        }
      }, null, this.disposables);

      this.panel.webview.onDidReceiveMessage(
        (message) => this.handleMessage(message),
        undefined,
        []
      );
    }

    this.panel.webview.html = this.getWebviewContent();
  }

  private handleMessage(message: any) {
    switch (message.command) {
      case 'ready':
        this.sendDataToWebview();
        break;
      case 'updateColumnMeta':
        this.updateColumnMeta(message.data);
        break;
    }
  }

  private sendDataToWebview() {
    if (!this.panel || !this.parsedData) return;

    this.panel.webview.postMessage({
      command: 'setData',
      data: {
        headers: this.parsedData.headers,
        rows: this.parsedData.rows,
        rowCount: this.parsedData.rowCount,
        columnMeta: this.columnMeta,
      },
    });
  }

  private updateColumnMeta(columnMeta: ColumnMeta[]) {
    this.columnMeta = columnMeta;
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src 'unsafe-inline';
    script-src 'unsafe-inline';
    img-src https: data:;
  ">
  <title>CSV Visualizer</title>
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --bg-primary: #0a0e14;
      --bg-secondary: #12171f;
      --bg-tertiary: #1a2029;
      --bg-hover: #222936;
      --border: #2d3748;
      --border-active: #4a5568;
      --text-primary: #ffffff;
      --text-secondary: #cbd5e0;
      --text-muted: #a0aec0;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
      --shadow: rgba(0, 0, 0, 0.4);
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow-x: hidden;
      line-height: 1.6;
      font-weight: 500;
    }

    .container {
      max-width: 100%;
      padding: 24px;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .header {
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--border);
      animation: slideDown 0.5s ease-out;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    h1 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--success) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 400;
    }

    .controls {
      display: grid;
      gap: 16px;
      margin-bottom: 24px;
      background: var(--bg-secondary);
      padding: 20px;
      border-radius: 12px;
      border: 1px solid var(--border);
      animation: slideUp 0.5s ease-out 0.1s both;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .control-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
      min-width: 200px;
    }

    label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }

    input[type="text"],
    input[type="number"],
    select {
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
      transition: all 0.2s ease;
      outline: none;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
    }

    input[type="text"]:hover,
    input[type="number"]:hover,
    select:hover {
      border-color: var(--border-active);
    }

    button {
      padding: 10px 18px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
      white-space: nowrap;
    }

    button:hover {
      background: var(--bg-hover);
      border-color: var(--border-active);
      transform: translateY(-1px);
    }

    button:active {
      transform: translateY(0);
    }

    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--bg-primary);
    }

    button.primary:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    .column-config {
      display: grid;
      gap: 12px;
      margin-bottom: 24px;
      animation: slideUp 0.5s ease-out 0.2s both;
      max-height: 400px;
      overflow-y: auto;
      padding-right: 8px;
    }

    .column-config::-webkit-scrollbar {
      width: 8px;
    }

    .column-config::-webkit-scrollbar-track {
      background: var(--bg-tertiary);
      border-radius: 4px;
    }

    .column-config::-webkit-scrollbar-thumb {
      background: var(--border-active);
      border-radius: 4px;
    }

    .column-config::-webkit-scrollbar-thumb:hover {
      background: var(--accent);
    }

    .column-item {
      display: grid;
      grid-template-columns: 40px 1fr 150px 100px 100px;
      gap: 12px;
      align-items: center;
      padding: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .column-item:hover {
      background: var(--bg-hover);
      border-color: var(--border-active);
    }

    .column-item.hidden {
      opacity: 0.5;
    }

    .column-name {
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: var(--accent);
    }

    .table-container {
      overflow-x: auto;
      overflow-y: visible;
      background: var(--bg-secondary);
      border-radius: 12px;
      border: 1px solid var(--border);
      margin-bottom: 24px;
      animation: slideUp 0.5s ease-out 0.3s both;
      max-width: 100%;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      table-layout: auto;
    }

    tbody tr {
      border-bottom: 1px solid var(--border);
    }

    th {
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 2px solid var(--border);
      white-space: nowrap;
      position: relative;
      min-width: 120px;
      max-width: 400px;
    }

    thead {
      position: sticky;
      top: 0;
      background: var(--bg-tertiary);
      z-index: 10;
    }

    tr {
      display: table-row;
    }

    .th-content {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: space-between;
    }

    .sort-buttons {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sort-btn {
      padding: 2px 4px;
      font-size: 10px;
      min-width: 0;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: color 0.2s ease;
    }

    .sort-btn:hover {
      color: var(--accent);
      background: transparent;
      transform: none;
    }

    .sort-btn.active {
      color: var(--accent);
    }

    .column-filter {
      margin-top: 8px;
      width: 100%;
      display: flex;
      gap: 4px;
      flex-direction: column;
    }

    .column-filter-row {
      display: flex;
      gap: 4px;
    }

    .column-filter select {
      flex: 0 0 auto;
      width: 80px;
      padding: 4px 6px;
      font-size: 11px;
    }

    .column-filter input {
      flex: 1;
      padding: 6px 8px;
      font-size: 12px;
    }

    .unique-values {
      max-height: 200px;
      overflow-y: auto;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-top: 4px;
      display: none;
    }

    .unique-values.show {
      display: block;
    }

    .unique-value-item {
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }

    .unique-value-item:hover {
      background: var(--bg-hover);
    }

    .unique-value-item:last-child {
      border-bottom: none;
    }

    .unique-value-checkbox {
      margin: 0;
    }

    .unique-value-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .unique-value-count {
      color: var(--text-muted);
      font-size: 11px;
    }

    .filter-toggle {
      padding: 4px 8px;
      font-size: 11px;
      margin-top: 4px;
      width: 100%;
    }

    td {
      padding: 12px 16px;
      color: var(--text-primary);
      max-width: 400px;
      min-width: 100px;
      position: relative;
      cursor: pointer;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
      height: 100%;
    }

    td.expanded {
      max-width: none;
      white-space: normal;
      word-wrap: break-word;
      background: var(--bg-hover);
    }

    td:not(.expanded) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    td .copy-btn {
      display: none;
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      padding: 4px 8px;
      background: var(--accent);
      color: var(--bg-primary);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      z-index: 5;
    }

    td:hover .copy-btn {
      display: block;
    }

    td .copy-btn:hover {
      background: var(--accent-hover);
    }

    tr:hover td {
      background: var(--bg-hover);
    }

    tr.selected {
      border-color: var(--accent);
    }

    tr.selected td {
      background: rgba(56, 189, 248, 0.15);
    }

    tr.selected:hover td {
      background: rgba(56, 189, 248, 0.25);
    }

    .row-select-cell {
      width: 40px;
      text-align: center;
    }

    .row-select-checkbox {
      cursor: pointer;
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }

    .select-all-rows {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .select-all-rows button {
      margin-left: auto;
    }

    .cell-image img {
      max-width: 80px;
      max-height: 60px;
      border-radius: 4px;
      object-fit: cover;
      margin: 2px;
      cursor: zoom-in;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .cell-image img:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 8px var(--shadow);
      z-index: 10;
      position: relative;
    }

    .image-list-container {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-height: 150px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 2px;
      width: 100%;
      box-sizing: border-box;
      max-width: 100%;
    }

    .image-list-container::-webkit-scrollbar {
      width: 6px;
    }

    .image-list-container::-webkit-scrollbar-track {
      background: var(--bg-tertiary);
      border-radius: 3px;
    }

    .image-list-container::-webkit-scrollbar-thumb {
      background: var(--border-active);
      border-radius: 3px;
    }

    .image-list-container::-webkit-scrollbar-thumb:hover {
      background: var(--accent);
    }

    /* Lightbox Modal */
    .lightbox-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    }

    .lightbox-modal.active {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
    }

    .lightbox-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
      z-index: 10001;
    }

    .lightbox-title {
      color: white;
      font-size: 16px;
      font-weight: 600;
    }

    .lightbox-close {
      background: var(--danger);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .lightbox-close:hover {
      background: #dc2626;
      transform: scale(1.05);
    }

    .lightbox-content {
      position: relative;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-image {
      max-width: 100%;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
      animation: zoomIn 0.3s ease;
    }

    @keyframes zoomIn {
      from {
        transform: scale(0.8);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    .lightbox-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      padding: 20px 15px;
      cursor: pointer;
      font-size: 24px;
      border-radius: 8px;
      transition: all 0.2s ease;
      z-index: 10002;
    }

    .lightbox-nav:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-50%) scale(1.1);
    }

    .lightbox-nav:active {
      transform: translateY(-50%) scale(0.95);
    }

    .lightbox-prev {
      left: 20px;
    }

    .lightbox-next {
      right: 20px;
    }

    .lightbox-nav:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .lightbox-nav:disabled:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-50%);
    }

    .lightbox-thumbnails {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      max-width: 90vw;
      overflow-x: auto;
      z-index: 10001;
    }

    .lightbox-thumbnails::-webkit-scrollbar {
      height: 6px;
    }

    .lightbox-thumbnails::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }

    .lightbox-thumbnails::-webkit-scrollbar-thumb {
      background: var(--accent);
      border-radius: 3px;
    }

    .lightbox-thumbnail {
      width: 60px;
      height: 60px;
      object-fit: cover;
      border-radius: 6px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .lightbox-thumbnail:hover {
      border-color: white;
      transform: scale(1.1);
    }

    .lightbox-thumbnail.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3);
    }

    .lightbox-counter {
      position: absolute;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10001;
    }

    .cell-link a {
      color: var(--accent);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .cell-link a:hover {
      color: var(--accent-hover);
      text-decoration: underline;
    }

    .cell-json,
    .cell-array,
    .cell-html,
    .cell-raw {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .cell-bool {
      font-weight: 600;
    }

    .cell-bool.true {
      color: var(--success);
    }

    .cell-bool.false {
      color: var(--danger);
    }

    .cell-number {
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .pagination {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: var(--bg-secondary);
      border-radius: 12px;
      border: 1px solid var(--border);
      animation: slideUp 0.5s ease-out 0.4s both;
    }

    .pagination-info {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .pagination-controls {
      display: flex;
      gap: 8px;
    }

    .page-input {
      width: 80px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
      animation: slideUp 0.5s ease-out 0.15s both;
    }

    .stat-card {
      padding: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .stat-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px var(--shadow);
    }

    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .no-data {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
      font-size: 14px;
    }

    .toggle-section {
      margin-bottom: 16px;
    }

    .toggle-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .toggle-header:hover {
      background: var(--bg-hover);
    }

    .toggle-title {
      font-weight: 600;
      font-size: 14px;
    }

    .toggle-icon {
      transition: transform 0.3s ease;
    }

    .toggle-icon.open {
      transform: rotate(90deg);
    }

    .toggle-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }

    .toggle-content.open {
      max-height: 2000px;
      margin-top: 12px;
    }

    @media (max-width: 768px) {
      .column-item {
        grid-template-columns: 1fr;
      }

      .control-row {
        flex-direction: column;
      }

      .control-group {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CSV Visualizer</h1>
      <div class="subtitle">Advanced data exploration and filtering</div>
    </div>

    <div class="stats" id="stats">
      <div class="stat-card">
        <div class="stat-label">Total Rows</div>
        <div class="stat-value" id="totalRows">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Visible Rows</div>
        <div class="stat-value" id="visibleRows">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Columns</div>
        <div class="stat-value" id="totalColumns">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Visible Columns</div>
        <div class="stat-value" id="visibleColumns">0</div>
      </div>
    </div>

    <div class="toggle-section">
      <div class="toggle-header" onclick="toggleSection('columnConfig')">
        <div class="toggle-title">Column Configuration</div>
        <div class="toggle-icon" id="columnConfigIcon">▶</div>
      </div>
      <div class="toggle-content" id="columnConfigContent">
        <div style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="selectAllColumns" onchange="toggleAllColumns()" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent);">
          <label for="selectAllColumns" style="cursor: pointer; font-weight: 600;">Select/Deselect All Columns</label>
        </div>
        <div class="column-config" id="columnConfig"></div>
      </div>
    </div>

    <div class="select-all-rows">
      <input type="checkbox" id="selectAllRowsCheckbox" onchange="toggleAllRowsSelection()" class="row-select-checkbox">
      <label for="selectAllRowsCheckbox" style="font-weight: 600;">Select All Rows (<span id="selectedRowCount">0</span> selected)</label>
      <button onclick="clearRowSelection()">Clear Selection</button>
      <button class="primary" onclick="copySelectedRows()">Copy Selected</button>
    </div>

    <div class="controls">
      <div class="control-row">
        <div class="control-group">
          <label>Global Search</label>
          <input type="text" id="globalSearch" placeholder="Search across all columns...">
        </div>
        <div class="control-group">
          <label>Rows Per Page</label>
          <select id="rowsPerPage">
            <option value="10">10 rows</option>
            <option value="25" selected>25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="250">250 rows</option>
            <option value="500">500 rows</option>
          </select>
        </div>
        <div class="control-group">
          <label>&nbsp;</label>
          <button onclick="clearAllFilters()" style="background: var(--danger); border-color: var(--danger);">Clear All Filters</button>
        </div>
      </div>
    </div>

    <div class="table-container">
      <table id="dataTable">
        <thead id="tableHead"></thead>
        <tbody id="tableBody"></tbody>
      </table>
    </div>

    <div class="pagination">
      <div class="pagination-info" id="paginationInfo"></div>
      <div class="pagination-controls">
        <button onclick="goToPage(1)">First</button>
        <button onclick="goToPage(currentPage - 1)">Previous</button>
        <input type="number" id="pageInput" class="page-input" min="1" value="1">
        <button onclick="goToPageInput()">Go</button>
        <button onclick="goToPage(currentPage + 1)">Next</button>
        <button onclick="goToPage(totalPages)">Last</button>
      </div>
    </div>
  </div>

  <!-- Lightbox Modal -->
  <div class="lightbox-modal" id="lightboxModal" onclick="closeLightbox(event)">
    <div class="lightbox-header">
      <div class="lightbox-title" id="lightboxTitle">Image Gallery</div>
      <button class="lightbox-close" onclick="closeLightbox()">✕ Close</button>
    </div>
    
    <div class="lightbox-counter" id="lightboxCounter">1 / 1</div>
    
    <button class="lightbox-nav lightbox-prev" id="lightboxPrev" onclick="event.stopPropagation(); navigateLightbox(-1)">‹</button>
    
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <img class="lightbox-image" id="lightboxImage" src="" alt="Full size image">
    </div>
    
    <button class="lightbox-nav lightbox-next" id="lightboxNext" onclick="event.stopPropagation(); navigateLightbox(1)">›</button>
    
    <div class="lightbox-thumbnails" id="lightboxThumbnails" onclick="event.stopPropagation()">
      <!-- Thumbnails will be inserted here -->
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    let allData = {
      headers: [],
      rows: [],
      rowCount: 0,
      columnMeta: []
    };
    
    let filteredRows = [];
    let currentPage = 1;
    let rowsPerPage = 25;
    let totalPages = 1;
    let sortColumn = null;
    let sortDirection = 'asc';
    let columnFilters = {};
    let uniqueValuesCache = {};
    let selectedRows = new Set();
    let lightboxImages = [];
    let lightboxCurrentIndex = 0;
    let lightboxRowData = null;

    // Send ready message
    vscode.postMessage({ command: 'ready' });

    // Receive data from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'setData') {
        allData = message.data;
        columnFilters = {};
        uniqueValuesCache = {};
        allData.columnMeta.forEach(col => {
          columnFilters[col.name] = {
            operator: 'contains',
            value: '',
            selectedValues: new Set()
          };
        });
        initializeTable();
      }
    });

    function initializeTable() {
      renderColumnConfig();
      // Initialize column filters with operators
      allData.columnMeta.forEach(col => {
        if (!columnFilters[col.name]) {
          columnFilters[col.name] = {
            operator: 'contains',
            value: '',
            selectedValues: new Set()
          };
        }
      });
      applyFilters();
      renderTable();
      updateStats();
      updateSelectAllColumnsCheckbox();
    }

    function renderColumnConfig() {
      const container = document.getElementById('columnConfig');
      container.innerHTML = '';

      allData.columnMeta.forEach((col, index) => {
        const item = document.createElement('div');
        item.className = \`column-item \${!col.visible ? 'hidden' : ''}\`;
        item.innerHTML = \`
          <input type="checkbox" 
                 id="visible_\${index}" 
                 \${col.visible ? 'checked' : ''}
                 onchange="toggleColumnVisibility(\${index})">
          <div class="column-name" title="\${col.name}">\${col.name}</div>
          <select id="type_\${index}" onchange="updateColumnType(\${index}, this.value)">
            <option value="text" \${col.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="number" \${col.type === 'number' ? 'selected' : ''}>Number</option>
            <option value="date" \${col.type === 'date' ? 'selected' : ''}>Date</option>
            <option value="bool" \${col.type === 'bool' ? 'selected' : ''}>Boolean</option>
            <option value="link" \${col.type === 'link' ? 'selected' : ''}>Link</option>
            <option value="image" \${col.type === 'image' ? 'selected' : ''}>Image</option>
            <option value="json" \${col.type === 'json' ? 'selected' : ''}>JSON</option>
            <option value="array" \${col.type === 'array' ? 'selected' : ''}>Array</option>
            <option value="html" \${col.type === 'html' ? 'selected' : ''}>HTML</option>
            <option value="raw" \${col.type === 'raw' ? 'selected' : ''}>Raw</option>
            <option value="base64" \${col.type === 'base64' ? 'selected' : ''}>Base64</option>
          </select>
          <button onclick="moveColumn(\${index}, -1)" \${index === 0 ? 'disabled' : ''}>↑</button>
          <button onclick="moveColumn(\${index}, 1)" \${index === allData.columnMeta.length - 1 ? 'disabled' : ''}>↓</button>
        \`;
        container.appendChild(item);
      });
    }

    function toggleColumnVisibility(index) {
      allData.columnMeta[index].visible = !allData.columnMeta[index].visible;
      vscode.postMessage({ command: 'updateColumnMeta', data: allData.columnMeta });
      renderColumnConfig();
      renderTable();
      updateStats();
      updateSelectAllColumnsCheckbox();
    }

    function toggleAllColumns() {
      const checkbox = document.getElementById('selectAllColumns');
      const newVisibility = checkbox.checked;
      
      allData.columnMeta.forEach(col => {
        col.visible = newVisibility;
      });
      
      vscode.postMessage({ command: 'updateColumnMeta', data: allData.columnMeta });
      renderColumnConfig();
      renderTable();
      updateStats();
    }

    function updateSelectAllColumnsCheckbox() {
      const checkbox = document.getElementById('selectAllColumns');
      const allVisible = allData.columnMeta.every(col => col.visible);
      const noneVisible = allData.columnMeta.every(col => !col.visible);
      
      checkbox.checked = allVisible;
      checkbox.indeterminate = !allVisible && !noneVisible;
    }

    function updateColumnType(index, type) {
      allData.columnMeta[index].type = type;
      vscode.postMessage({ command: 'updateColumnMeta', data: allData.columnMeta });
      renderTable();
    }

    function moveColumn(index, direction) {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= allData.columnMeta.length) return;
      
      // Swap in columnMeta
      [allData.columnMeta[index], allData.columnMeta[newIndex]] = 
        [allData.columnMeta[newIndex], allData.columnMeta[index]];
      
      // Swap in headers
      [allData.headers[index], allData.headers[newIndex]] = 
        [allData.headers[newIndex], allData.headers[index]];
      
      // Swap in all rows
      allData.rows.forEach(row => {
        [row[index], row[newIndex]] = [row[newIndex], row[index]];
      });

      vscode.postMessage({ command: 'updateColumnMeta', data: allData.columnMeta });
      renderColumnConfig();
      renderTable();
    }

    function applyFilters() {
      filteredRows = allData.rows.filter(row => {
        // Global search
        const globalSearch = document.getElementById('globalSearch')?.value.toLowerCase() || '';
        if (globalSearch) {
          const matchesGlobal = row.some(cell => 
            String(cell).toLowerCase().includes(globalSearch)
          );
          if (!matchesGlobal) return false;
        }

        // Column-specific filters
        return allData.columnMeta.every((col, index) => {
          const filter = columnFilters[col.name];
          if (!filter) return true;
          
          const cellValue = String(row[index] || '');
          const filterValue = filter.value;
          const operator = filter.operator;

          // Check selected values filter first
          if (filter.selectedValues.size > 0) {
            if (!filter.selectedValues.has(cellValue)) {
              return false;
            }
          }

          // Apply operator-based filter
          if (!filterValue && operator !== 'isEmpty' && operator !== 'isNotEmpty') {
            return true;
          }

          const cellLower = cellValue.toLowerCase();
          const filterLower = filterValue.toLowerCase();
          const cellNum = parseFloat(cellValue);
          const filterNum = parseFloat(filterValue);

          switch (operator) {
            case 'contains':
              return cellLower.includes(filterLower);
            case 'equals':
              return cellLower === filterLower;
            case 'notEquals':
              return cellLower !== filterLower;
            case 'startsWith':
              return cellLower.startsWith(filterLower);
            case 'endsWith':
              return cellLower.endsWith(filterLower);
            case 'greaterThan':
              return !isNaN(cellNum) && !isNaN(filterNum) && cellNum > filterNum;
            case 'lessThan':
              return !isNaN(cellNum) && !isNaN(filterNum) && cellNum < filterNum;
            case 'greaterOrEqual':
              return !isNaN(cellNum) && !isNaN(filterNum) && cellNum >= filterNum;
            case 'lessOrEqual':
              return !isNaN(cellNum) && !isNaN(filterNum) && cellNum <= filterNum;
            case 'isEmpty':
              return cellValue === '' || cellValue === null || cellValue === undefined;
            case 'isNotEmpty':
              return cellValue !== '' && cellValue !== null && cellValue !== undefined;
            default:
              return true;
          }
        });
      });

      // Apply sorting
      if (sortColumn !== null) {
        filteredRows.sort((a, b) => {
          const aVal = a[sortColumn];
          const bVal = b[sortColumn];
          const colType = allData.columnMeta[sortColumn].type;

          let comparison = 0;
          if (colType === 'number') {
            comparison = parseFloat(aVal) - parseFloat(bVal);
          } else if (colType === 'date') {
            comparison = new Date(aVal) - new Date(bVal);
          } else {
            comparison = String(aVal).localeCompare(String(bVal));
          }

          return sortDirection === 'asc' ? comparison : -comparison;
        });
      }

      // Update pagination
      const rowsPerPageSelect = document.getElementById('rowsPerPage');
      rowsPerPage = rowsPerPageSelect?.value === 'all' ? filteredRows.length : parseInt(rowsPerPageSelect?.value || '25');
      totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
      currentPage = Math.min(currentPage, totalPages);
      
      document.getElementById('pageInput').max = totalPages;
    }

    function renderTable() {
      const thead = document.getElementById('tableHead');
      const tbody = document.getElementById('tableBody');

      // Render headers
      thead.innerHTML = '';
      const headerRow = document.createElement('tr');
      
      // Add checkbox column header
      const selectTh = document.createElement('th');
      selectTh.className = 'row-select-cell';
      selectTh.innerHTML = '<input type="checkbox" onchange="toggleAllRowsOnPage(this.checked)" class="row-select-checkbox" title="Select all on page">';
      headerRow.appendChild(selectTh);
      
      allData.columnMeta.forEach((col, index) => {
        if (!col.visible) return;
        
        const filter = columnFilters[col.name] || { operator: 'contains', value: '', selectedValues: new Set() };
        const uniqueValues = getUniqueValues(index);
        
        const th = document.createElement('th');
        th.innerHTML = \`
          <div class="th-content">
            <span>\${col.name}</span>
            <div class="sort-buttons">
              <button class="sort-btn \${sortColumn === index && sortDirection === 'asc' ? 'active' : ''}" 
                      onclick="sortTable(\${index}, 'asc')" title="Sort ascending">▲</button>
              <button class="sort-btn \${sortColumn === index && sortDirection === 'desc' ? 'active' : ''}" 
                      onclick="sortTable(\${index}, 'desc')" title="Sort descending">▼</button>
            </div>
          </div>
          <div class="column-filter">
            <div class="column-filter-row">
              <select onchange="updateFilterOperator('\${col.name}', this.value)">
                <option value="contains" \${filter.operator === 'contains' ? 'selected' : ''}>Contains</option>
                <option value="equals" \${filter.operator === 'equals' ? 'selected' : ''}>Equals</option>
                <option value="notEquals" \${filter.operator === 'notEquals' ? 'selected' : ''}>Not Equals</option>
                <option value="startsWith" \${filter.operator === 'startsWith' ? 'selected' : ''}>Starts With</option>
                <option value="endsWith" \${filter.operator === 'endsWith' ? 'selected' : ''}>Ends With</option>
                <option value="greaterThan" \${filter.operator === 'greaterThan' ? 'selected' : ''}>Greater ></option>
                <option value="lessThan" \${filter.operator === 'lessThan' ? 'selected' : ''}>Less <</option>
                <option value="greaterOrEqual" \${filter.operator === 'greaterOrEqual' ? 'selected' : ''}>Greater >=</option>
                <option value="lessOrEqual" \${filter.operator === 'lessOrEqual' ? 'selected' : ''}>Less <=</option>
                <option value="isEmpty" \${filter.operator === 'isEmpty' ? 'selected' : ''}>Is Empty</option>
                <option value="isNotEmpty" \${filter.operator === 'isNotEmpty' ? 'selected' : ''}>Not Empty</option>
              </select>
              <input type="text" 
                     placeholder="Filter value..." 
                     value="\${filter.value}"
                     oninput="updateColumnFilterValue('\${col.name}', this.value)"
                     \${filter.operator === 'isEmpty' || filter.operator === 'isNotEmpty' ? 'disabled' : ''}>
            </div>
            <button class="filter-toggle" onclick="toggleUniqueValues('\${col.name}', \${index})">
              📋 Select Values (\${uniqueValues.length})
            </button>
            <div class="unique-values" id="unique_\${col.name.replace(/[^a-zA-Z0-9]/g, '_')}">
              <div class="unique-value-item" onclick="event.stopPropagation(); selectAllUniqueValues('\${col.name}', \${index}, true)">
                <input type="checkbox" class="unique-value-checkbox" 
                       \${filter.selectedValues.size === 0 ? 'checked' : ''} onclick="event.stopPropagation();">
                <span class="unique-value-text"><strong>(Select All)</strong></span>
              </div>
              <div class="unique-value-item" onclick="event.stopPropagation(); selectAllUniqueValues('\${col.name}', \${index}, false)">
                <input type="checkbox" class="unique-value-checkbox" 
                       \${filter.selectedValues.size > 0 ? '' : 'checked'} onclick="event.stopPropagation();">
                <span class="unique-value-text"><strong>(Clear All)</strong></span>
              </div>
              \${uniqueValues.map(item => \`
                <div class="unique-value-item" onclick="event.stopPropagation(); toggleUniqueValue('\${col.name}', '\${escapeHtml(item.value)}', \${index})">
                  <input type="checkbox" class="unique-value-checkbox" 
                         \${filter.selectedValues.size === 0 || filter.selectedValues.has(item.value) ? 'checked' : ''} onclick="event.stopPropagation();">
                  <span class="unique-value-text" title="\${escapeHtml(item.value)}">\${escapeHtml(item.value) || '(empty)'}</span>
                  <span class="unique-value-count">\${item.count}</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);

      renderTableBody();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function getUniqueValues(columnIndex) {
      const cacheKey = \`col_\${columnIndex}\`;
      if (uniqueValuesCache[cacheKey]) {
        return uniqueValuesCache[cacheKey];
      }

      const valueCount = {};
      allData.rows.forEach(row => {
        const value = String(row[columnIndex] || '');
        valueCount[value] = (valueCount[value] || 0) + 1;
      });

      const uniqueValues = Object.entries(valueCount)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

      uniqueValuesCache[cacheKey] = uniqueValues;
      return uniqueValues;
    }

    function toggleUniqueValues(columnName, columnIndex) {
      const elementId = 'unique_' + columnName.replace(/[^a-zA-Z0-9]/g, '_');
      const element = document.getElementById(elementId);
      
      // Close all other unique value dropdowns
      document.querySelectorAll('.unique-values').forEach(el => {
        if (el.id !== elementId) {
          el.classList.remove('show');
        }
      });
      
      element.classList.toggle('show');
    }

    function toggleUniqueValue(columnName, value, columnIndex) {
      const filter = columnFilters[columnName];
      
      if (filter.selectedValues.size === 0) {
        // If all were selected (empty set means all), we need to build the full set first
        const uniqueValues = getUniqueValues(columnIndex);
        filter.selectedValues = new Set(uniqueValues.map(item => item.value));
      }
      
      if (filter.selectedValues.has(value)) {
        filter.selectedValues.delete(value);
      } else {
        filter.selectedValues.add(value);
      }
      
      currentPage = 1;
      applyFilters();
      renderTable(); // Re-render table including headers to update checkboxes
      updateStats();
    }

    function selectAllUniqueValues(columnName, columnIndex, selectAll) {
      const filter = columnFilters[columnName];
      
      if (selectAll) {
        filter.selectedValues = new Set();
      } else {
        const uniqueValues = getUniqueValues(columnIndex);
        filter.selectedValues = new Set(uniqueValues.map(item => item.value));
      }
      
      currentPage = 1;
      applyFilters();
      renderTable(); // Re-render table including headers to update checkboxes
      updateStats();
    }

    function updateFilterOperator(columnName, operator) {
      columnFilters[columnName].operator = operator;
      currentPage = 1;
      applyFilters();
      renderTable(); // Need to re-render header if operator changes enable/disable state
      updateStats();
    }

    function updateColumnFilterValue(columnName, value) {
      columnFilters[columnName].value = value;
      currentPage = 1;
      applyFilters();
      renderTableBody(); // Only re-render body, not headers
      updateStats();
    }

    function renderTableBody() {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';
      
      const start = (currentPage - 1) * rowsPerPage;
      const end = start + rowsPerPage;
      const pageRows = filteredRows.slice(start, end);

      if (pageRows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = allData.columnMeta.filter(c => c.visible).length + 1; // +1 for checkbox column
        td.className = 'no-data';
        td.textContent = 'No data matches your filters';
        tr.appendChild(td);
        tbody.appendChild(tr);
        updatePaginationInfo();
        updateSelectedRowCount();
        return;
      }

      pageRows.forEach((row, pageIndex) => {
        const globalRowIndex = start + pageIndex;
        const tr = document.createElement('tr');
        const rowId = JSON.stringify(row); // Use row content as unique ID
        
        if (selectedRows.has(rowId)) {
          tr.classList.add('selected');
        }
        
        // Add checkbox cell
        const selectTd = document.createElement('td');
        selectTd.className = 'row-select-cell';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'row-select-checkbox';
        checkbox.checked = selectedRows.has(rowId);
        checkbox.onchange = (e) => {
          e.stopPropagation();
          toggleRowSelection(rowId, row);
        };
        selectTd.appendChild(checkbox);
        tr.appendChild(selectTd);
        
        allData.columnMeta.forEach((col, index) => {
          if (!col.visible) return;
          
          const td = document.createElement('td');
          td.className = \`cell-\${col.type}\`;
          
          const value = row[index];
          const fullValue = String(value || '');
          
          // Add click to expand/collapse
          td.onclick = function() {
            this.classList.toggle('expanded');
          };
          
          // Add copy button
          const copyBtn = document.createElement('button');
          copyBtn.className = 'copy-btn';
          copyBtn.textContent = '📋 Copy';
          copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(fullValue);
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => copyBtn.textContent = '📋 Copy', 1500);
          };
          
          switch (col.type) {
            case 'image':
              // Check if value looks like a Python list or JSON array of images
              if (value && value.trim().startsWith('[')) {
                try {
                  let imageUrls = [];
                  const trimmedValue = value.trim();
                  
                  // Remove the outer brackets
                  const withoutBrackets = trimmedValue.slice(1, -1).trim();
                  
                  // Split by comma
                  const parts = withoutBrackets.split(',');
                  
                  // Clean each URL - remove quotes and whitespace
                  imageUrls = parts.map(part => {
                    // Remove single quotes, double quotes, and whitespace
                    return part.trim().replace(/^["']|["']$/g, '').trim();
                  }).filter(url => url && url.length > 0);
                  
                  if (imageUrls.length > 0) {
                    // Create a wrapper container for images
                    const container = document.createElement('div');
                    container.className = 'image-list-container';
                    // Create images with click handlers
                    const imgElements = imageUrls.map((url, imgIndex) => {
                      const img = document.createElement('img');
                      img.src = url;
                      img.alt = 'Image';
                      img.title = url;
                      img.onerror = function() {
                        this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23718096%22>✕</text></svg>';
                      };
                      img.onclick = (e) => {
                        e.stopPropagation();
                        const allRowImages = collectRowImages(row, index);
                        const startIndex = allRowImages.indexOf(url);
                        openLightbox(allRowImages, startIndex >= 0 ? startIndex : 0, row);
                      };
                      return img;
                    });
                    imgElements.forEach(img => container.appendChild(img));
                    td.appendChild(container);
                  } else {
                    td.textContent = '—';
                  }
                } catch (e) {
                  console.error('Error parsing image list:', e, value);
                  if (value) {
                    const img = document.createElement('img');
                    img.src = value;
                    img.alt = 'Image';
                    img.title = value;
                    img.onerror = function() {
                      this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23718096%22>✕</text></svg>';
                    };
                    img.onclick = (e) => {
                      e.stopPropagation();
                      const allRowImages = collectRowImages(row, index);
                      openLightbox(allRowImages, 0, row);
                    };
                    td.appendChild(img);
                  } else {
                    td.textContent = '—';
                  }
                }
              } else if (value && value.includes(',') && !value.includes('http') === false) {
                // Comma-separated URLs without brackets
                try {
                  const imageUrls = value.split(',')
                    .map(url => url.trim().replace(/^["']|["']$/g, '').trim())
                    .filter(url => url && url.length > 0);
                  
                  if (imageUrls.length > 0) {
                    // Create a wrapper container for images
                    const container = document.createElement('div');
                    container.className = 'image-list-container';
                    const imgElements = imageUrls.map((url, imgIndex) => {
                      const img = document.createElement('img');
                      img.src = url;
                      img.alt = 'Image';
                      img.title = url;
                      img.onerror = function() {
                        this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23718096%22>✕</text></svg>';
                      };
                      img.onclick = (e) => {
                        e.stopPropagation();
                        const allRowImages = collectRowImages(row, index);
                        const startIndex = allRowImages.indexOf(url);
                        openLightbox(allRowImages, startIndex >= 0 ? startIndex : 0, row);
                      };
                      return img;
                    });
                    imgElements.forEach(img => container.appendChild(img));
                    td.appendChild(container);
                  } else {
                    td.textContent = '—';
                  }
                } catch (e) {
                  console.error('Error parsing comma-separated images:', e, value);
                  if (value) {
                    const img = document.createElement('img');
                    img.src = value;
                    img.alt = 'Image';
                    img.title = value;
                    img.onerror = function() {
                      this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23718096%22>✕</text></svg>';
                    };
                    img.onclick = (e) => {
                      e.stopPropagation();
                      const allRowImages = collectRowImages(row, index);
                      openLightbox(allRowImages, 0, row);
                    };
                    td.appendChild(img);
                  } else {
                    td.textContent = '—';
                  }
                }
              } else {
                // Single image URL
                if (value) {
                  const img = document.createElement('img');
                  img.src = value;
                  img.alt = 'Image';
                  img.title = value;
                  img.onerror = function() {
                    this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23718096%22>✕</text></svg>';
                  };
                  img.onclick = (e) => {
                    e.stopPropagation();
                    const allRowImages = collectRowImages(row, index);
                    const startIndex = allRowImages.indexOf(value);
                    openLightbox(allRowImages, startIndex >= 0 ? startIndex : 0, row);
                  };
                  td.appendChild(img);
                } else {
                  td.textContent = '—';
                }
              }
              break;
            case 'link':
              td.innerHTML = value ? \`<a href="\${value}" target="_blank">\${value}</a>\` : '—';
              td.appendChild(copyBtn);
              break;
            case 'bool':
              const boolVal = String(value).toLowerCase();
              const isTruthy = ['true', '1', 'yes', 'y'].includes(boolVal);
              td.className += \` \${isTruthy ? 'true' : 'false'}\`;
              td.textContent = isTruthy ? '✓ True' : '✕ False';
              break;
            case 'json':
              try {
                td.textContent = JSON.stringify(JSON.parse(value), null, 2);
                td.appendChild(copyBtn);
              } catch {
                td.textContent = value;
                td.appendChild(copyBtn);
              }
              break;
            case 'number':
              td.textContent = isNaN(parseFloat(value)) ? value : parseFloat(value).toLocaleString();
              td.appendChild(copyBtn);
              break;
            case 'date':
              try {
                const date = new Date(value);
                td.textContent = isNaN(date.getTime()) ? value : date.toLocaleDateString();
                td.appendChild(copyBtn);
              } catch {
                td.textContent = value;
                td.appendChild(copyBtn);
              }
              break;
            default:
              td.textContent = value || '—';
              td.title = fullValue;
              if (fullValue) {
                td.appendChild(copyBtn);
              }
          }
          
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      updatePaginationInfo();
      updateSelectedRowCount();
    }

    function sortTable(columnIndex, direction) {
      sortColumn = columnIndex;
      sortDirection = direction;
      applyFilters();
      renderTable();
    }

    function updatePaginationInfo() {
      const start = (currentPage - 1) * rowsPerPage + 1;
      const end = Math.min(currentPage * rowsPerPage, filteredRows.length);
      document.getElementById('paginationInfo').textContent = 
        \`Showing \${start}-\${end} of \${filteredRows.length} rows\`;
      document.getElementById('pageInput').value = currentPage;
    }

    function updateStats() {
      document.getElementById('totalRows').textContent = allData.rowCount.toLocaleString();
      document.getElementById('visibleRows').textContent = filteredRows.length.toLocaleString();
      document.getElementById('totalColumns').textContent = allData.columnMeta.length;
      document.getElementById('visibleColumns').textContent = 
        allData.columnMeta.filter(c => c.visible).length;
    }

    function goToPage(page) {
      if (page < 1 || page > totalPages) return;
      currentPage = page;
      renderTableBody();
    }

    function goToPageInput() {
      const page = parseInt(document.getElementById('pageInput').value);
      goToPage(page);
    }

    function toggleRowSelection(rowId, row) {
      if (selectedRows.has(rowId)) {
        selectedRows.delete(rowId);
      } else {
        selectedRows.add(rowId);
      }
      renderTableBody();
    }

    function toggleAllRowsOnPage(checked) {
      const start = (currentPage - 1) * rowsPerPage;
      const end = start + rowsPerPage;
      const pageRows = filteredRows.slice(start, end);
      
      pageRows.forEach(row => {
        const rowId = JSON.stringify(row);
        if (checked) {
          selectedRows.add(rowId);
        } else {
          selectedRows.delete(rowId);
        }
      });
      
      renderTableBody();
    }

    function toggleAllRowsSelection() {
      const checkbox = document.getElementById('selectAllRowsCheckbox');
      
      if (checkbox.checked) {
        // Select all filtered rows
        filteredRows.forEach(row => {
          selectedRows.add(JSON.stringify(row));
        });
      } else {
        // Clear all selections
        selectedRows.clear();
      }
      
      renderTableBody();
    }

    function clearRowSelection() {
      selectedRows.clear();
      document.getElementById('selectAllRowsCheckbox').checked = false;
      renderTableBody();
    }

    function updateSelectedRowCount() {
      document.getElementById('selectedRowCount').textContent = selectedRows.size;
    }

    function copySelectedRows() {
      if (selectedRows.size === 0) {
        alert('No rows selected');
        return;
      }
      
      // Get visible column headers
      const visibleHeaders = allData.columnMeta
        .filter(col => col.visible)
        .map(col => col.name);
      
      // Create CSV content
      let csvContent = visibleHeaders.join(',') + '\\n';
      
      // Add selected rows
      filteredRows.forEach(row => {
        const rowId = JSON.stringify(row);
        if (selectedRows.has(rowId)) {
          const visibleCells = row.filter((cell, index) => allData.columnMeta[index].visible);
          const escapedCells = visibleCells.map(cell => {
            const str = String(cell || '');
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
              return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
          });
          csvContent += escapedCells.join(',') + '\\n';
        }
      });
      
      navigator.clipboard.writeText(csvContent).then(() => {
        alert(\`Copied \${selectedRows.size} row(s) to clipboard as CSV\`);
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
      });
    }

    function clearAllFilters() {
      // Clear global search
      document.getElementById('globalSearch').value = '';
      
      // Clear all column filters
      allData.columnMeta.forEach(col => {
        columnFilters[col.name] = {
          operator: 'contains',
          value: '',
          selectedValues: new Set()
        };
      });
      
      currentPage = 1;
      applyFilters();
      renderTable();
      updateStats();
    }

    function toggleSection(sectionId) {
      const content = document.getElementById(sectionId + 'Content');
      const icon = document.getElementById(sectionId + 'Icon');
      content.classList.toggle('open');
      icon.classList.toggle('open');
    }

    // Event listeners
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
      currentPage = 1;
      applyFilters();
      renderTableBody();
      updateStats();
    });

    document.getElementById('rowsPerPage')?.addEventListener('change', () => {
      currentPage = 1;
      applyFilters();
      renderTable();
    });

    document.getElementById('pageInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') goToPageInput();
    });

    // Close unique values dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.column-filter') && !e.target.closest('.unique-values')) {
        document.querySelectorAll('.unique-values').forEach(el => {
          el.classList.remove('show');
        });
      }
    });

    // Lightbox Functions
    function openLightbox(images, startIndex, rowData) {
      lightboxImages = images;
      lightboxCurrentIndex = startIndex;
      lightboxRowData = rowData;
      
      const modal = document.getElementById('lightboxModal');
      modal.classList.add('active');
      
      // Set title based on row data
      if (rowData) {
        const firstColumn = allData.columnMeta.find(col => col.visible);
        const firstValue = firstColumn ? rowData[allData.headers.indexOf(firstColumn.name)] : '';
        document.getElementById('lightboxTitle').textContent = \`Images from: \${firstValue || 'Row'}\`;
      }
      
      showLightboxImage(startIndex);
      renderLightboxThumbnails();
      
      // Keyboard navigation
      document.addEventListener('keydown', handleLightboxKeyboard);
    }

    function closeLightbox(event) {
      if (event && event.target !== event.currentTarget) return;
      
      const modal = document.getElementById('lightboxModal');
      modal.classList.remove('active');
      
      document.removeEventListener('keydown', handleLightboxKeyboard);
    }

    function handleLightboxKeyboard(e) {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        navigateLightbox(-1);
      } else if (e.key === 'ArrowRight') {
        navigateLightbox(1);
      }
    }

    function navigateLightbox(direction) {
      const newIndex = lightboxCurrentIndex + direction;
      if (newIndex >= 0 && newIndex < lightboxImages.length) {
        showLightboxImage(newIndex);
      }
    }

    function showLightboxImage(index) {
      lightboxCurrentIndex = index;
      
      const img = document.getElementById('lightboxImage');
      img.src = lightboxImages[index];
      
      // Update counter
      document.getElementById('lightboxCounter').textContent = \`\${index + 1} / \${lightboxImages.length}\`;
      
      // Update navigation buttons
      document.getElementById('lightboxPrev').disabled = index === 0;
      document.getElementById('lightboxNext').disabled = index === lightboxImages.length - 1;
      
      // Update thumbnails
      updateLightboxThumbnails();
    }

    function renderLightboxThumbnails() {
      const container = document.getElementById('lightboxThumbnails');
      container.innerHTML = '';
      
      lightboxImages.forEach((src, index) => {
        const thumb = document.createElement('img');
        thumb.src = src;
        thumb.className = 'lightbox-thumbnail';
        if (index === lightboxCurrentIndex) {
          thumb.classList.add('active');
        }
        thumb.onclick = () => showLightboxImage(index);
        container.appendChild(thumb);
      });
    }

    function updateLightboxThumbnails() {
      const thumbs = document.querySelectorAll('.lightbox-thumbnail');
      thumbs.forEach((thumb, index) => {
        thumb.classList.toggle('active', index === lightboxCurrentIndex);
      });
      
      // Scroll active thumbnail into view
      const activeThumb = thumbs[lightboxCurrentIndex];
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    function collectRowImages(row, columnIndex) {
      const images = [];
      
      // Only collect from the specified column
      const value = row[columnIndex];
      if (!value) return images;
      
      // Parse image URLs from the value
      if (value.trim().startsWith('[')) {
        // Array format
        const withoutBrackets = value.trim().slice(1, -1).trim();
        const parts = withoutBrackets.split(',');
        const urls = parts.map(part => part.trim().replace(/^["']|["']$/g, '').trim()).filter(url => url);
        images.push(...urls);
      } else if (value.includes(',')) {
        // Comma-separated
        const urls = value.split(',').map(url => url.trim().replace(/^["']|["']$/g, '').trim()).filter(url => url);
        images.push(...urls);
      } else {
        // Single image
        images.push(value);
      }
      
      return images;
    }

  </script>
</body>
</html>`;
  }
}