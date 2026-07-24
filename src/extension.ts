import * as vscode from 'vscode';
import { CSVWebviewProvider } from './csvWebviewProvider';

/** Debounce for pushing editor edits into an open panel. */
const REFRESH_DEBOUNCE_MS = 300;

function isCsvDocument(document: vscode.TextDocument): boolean {
  const name = document.fileName.toLowerCase();
  return document.languageId === 'csv' || name.endsWith('.csv') || name.endsWith('.tsv');
}

async function promptToOpenCsv(reason: string) {
  const selection = await vscode.window.showErrorMessage(reason, 'Open a csv file', 'Ignore');
  if (selection === 'Open a csv file') {
    await vscode.commands.executeCommand('workbench.action.files.openFile');
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Track open panels by document URI.
  const openPanels = new Map<string, CSVWebviewProvider>();
  const refreshTimers = new Map<string, NodeJS.Timeout>();

  context.subscriptions.push(
    vscode.commands.registerCommand('csvVisualizer.openView', async (uri?: vscode.Uri) => {
      // The explorer and editor-title menus pass the resource URI; the command
      // palette and keybinding do not, so fall back to the active editor.
      let document: vscode.TextDocument | undefined;

      if (uri instanceof vscode.Uri) {
        try {
          document = await vscode.workspace.openTextDocument(uri);
        } catch {
          await promptToOpenCsv(`Could not open ${uri.fsPath}`);
          return;
        }
      } else {
        document = vscode.window.activeTextEditor?.document;
      }

      if (!document) {
        await promptToOpenCsv('No CSV file opened');
        return;
      }

      if (!isCsvDocument(document)) {
        await promptToOpenCsv('This is not a CSV file');
        return;
      }

      const key = document.uri.toString();
      const existing = openPanels.get(key);

      if (existing) {
        existing.reveal();
        return;
      }

      const webviewProvider = new CSVWebviewProvider(context.extensionUri);
      webviewProvider.onDidDispose(() => {
        openPanels.delete(key);
        const timer = refreshTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          refreshTimers.delete(key);
        }
      });

      await webviewProvider.show(document);
      openPanels.set(key, webviewProvider);
    })
  );

  // Keep open panels in sync with edits to their source document.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const key = event.document.uri.toString();
      const provider = openPanels.get(key);
      if (!provider || event.contentChanges.length === 0) return;

      const pending = refreshTimers.get(key);
      if (pending) clearTimeout(pending);

      refreshTimers.set(
        key,
        setTimeout(() => {
          refreshTimers.delete(key);
          provider.refresh(event.document);
        }, REFRESH_DEBOUNCE_MS)
      );
    })
  );

  context.subscriptions.push(
    new vscode.Disposable(() => {
      refreshTimers.forEach((timer) => clearTimeout(timer));
      refreshTimers.clear();
    })
  );
}

export function deactivate() {}
