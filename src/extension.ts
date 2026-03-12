import * as vscode from 'vscode';
import { CSVWebviewProvider } from './csvWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
  // Track open panels by file path
  const openPanels = new Map<string, CSVWebviewProvider>();

  context.subscriptions.push(
    vscode.commands.registerCommand('csvVisualizer.openView', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        const selection = await vscode.window.showErrorMessage(
          'No CSV file opened',
          'Open a csv file',
          'Ignore'
        );
        if (selection === 'Open a csv file') {
          await vscode.commands.executeCommand('workbench.action.files.openFile');
        }
        return;
      }

      const document = editor.document;
      
      // Check if it's a CSV file by extension or language ID
      const isCsvFile = document.languageId === 'csv' || 
                        document.languageId === 'plaintext' && document.fileName.endsWith('.csv') ||
                        document.fileName.endsWith('.csv') ||
                        document.fileName.endsWith('.tsv');
      
      if (!isCsvFile) {
        const selection = await vscode.window.showErrorMessage(
          'This is not a CSV file',
          'Open a csv file',
          'Ignore'
        );
        if (selection === 'Open a csv file') {
          await vscode.commands.executeCommand('workbench.action.files.openFile');
        }
        return;
      }

      // Get file path as unique identifier
      const filePath = document.uri.toString();

      // Check if this CSV is already open
      if (openPanels.has(filePath)) {
        // Focus the existing panel
        const existingProvider = openPanels.get(filePath);
        existingProvider?.reveal();
      } else {
        // Create new provider for this CSV
        const webviewProvider = new CSVWebviewProvider(context.extensionUri);
        
        // Set up disposal handler to remove from map when closed
        webviewProvider.onDidDispose(() => {
          openPanels.delete(filePath);
        });
        
        // Show the webview
        await webviewProvider.show(document);
        
        // Track this panel
        openPanels.set(filePath, webviewProvider);
      }
    })
  );
}

export function deactivate() {}