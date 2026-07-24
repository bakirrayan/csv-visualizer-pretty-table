import * as vscode from 'vscode';
import { parseCSV } from './parser/csvParser';
import { ParsedCSV } from './types/csv';

/** Message shapes the webview may send to the extension host. */
interface WebviewMessage {
  command: string;
  text?: string;
  message?: string | null;
}

export class CSVWebviewProvider {
  private static readonly viewType = 'csvVisualizer.webview';
  private panel: vscode.WebviewPanel | undefined;
  private parsedData: ParsedCSV | undefined;
  private disposables: vscode.Disposable[] = [];
  private disposeCallbacks: (() => void)[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  public reveal() {
    this.panel?.reveal(vscode.ViewColumn.One);
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
    this.parsedData = parseCSV(document.getText(), document.fileName);

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.sendDataToWebview();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      CSVWebviewProvider.viewType,
      `CSV: ${document.fileName.split(/[\\/]/).pop()}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      }
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.disposeCallbacks.forEach((callback) => callback());
        this.disposeCallbacks = [];
        while (this.disposables.length) {
          this.disposables.pop()?.dispose();
        }
      },
      null,
      this.disposables
    );

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) =>
        this.handleMessage(message)
      )
    );

    this.panel.webview.html = await this.getWebviewContent(this.panel.webview);
  }

  /** Re-parse the document and push it into an already-open panel. */
  public refresh(document: vscode.TextDocument) {
    if (!this.panel) return;
    this.parsedData = parseCSV(document.getText(), document.fileName);
    this.sendDataToWebview();
  }

  private async handleMessage(message: WebviewMessage) {
    switch (message.command) {
      case 'ready':
        this.sendDataToWebview();
        break;
      case 'copyToClipboard':
        // The webview's navigator.clipboard is unreliable, so copying is done here.
        await vscode.env.clipboard.writeText(message.text ?? '');
        if (message.message) {
          vscode.window.showInformationMessage(message.message);
        }
        break;
      case 'showMessage':
        if (message.message) {
          vscode.window.showInformationMessage(message.message);
        }
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
      },
    });
  }

  private async getWebviewContent(webview: vscode.Webview): Promise<string> {
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
    const html = Buffer.from(
      await vscode.workspace.fs.readFile(vscode.Uri.joinPath(mediaUri, 'index.html'))
    ).toString('utf8');

    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'style.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'main.js'));

    return html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{nonce}}/g, getNonce())
      .replace(/{{styleUri}}/g, styleUri.toString())
      .replace(/{{scriptUri}}/g, scriptUri.toString());
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
