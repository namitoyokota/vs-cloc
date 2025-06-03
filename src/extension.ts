import * as vscode from 'vscode';
import { ClocSidebarProvider } from './clocSidebarProvider';

/**
 * Called when your extension is activated. Registers commands and the cloc sidebar provider.
 * @param context The VS Code extension context for managing disposables and state.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('CLOC extension is active.');

	const sidebarProvider = new ClocSidebarProvider();
	vscode.window.registerTreeDataProvider('vsClocSidebar', sidebarProvider);

	const countLinesOfCodeDisposable = vscode.commands.registerCommand('vs-cloc.countLinesOfCode', () => {
		sidebarProvider.countLinesOfCode();
		vscode.window.showInformationMessage('Counting lines of code.');
	});
	context.subscriptions.push(countLinesOfCodeDisposable);

	const refreshDisposable = vscode.commands.registerCommand('vs-cloc.refresh', () => {
		sidebarProvider.countLinesOfCode();
		vscode.window.showInformationMessage('Re-counting lines of code.');
	});
	context.subscriptions.push(refreshDisposable);
}
