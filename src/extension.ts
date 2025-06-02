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

	const runClocDisposable = vscode.commands.registerCommand('vs-cloc.runCloc', () => {
		sidebarProvider.runCloc();
		vscode.window.showInformationMessage('Counting lines of code...');
	});
	context.subscriptions.push(runClocDisposable);

	const refreshClocDisposable = vscode.commands.registerCommand('vs-cloc.refreshCloc', () => {
		sidebarProvider.runCloc();
		vscode.window.showInformationMessage('Finished counting!');
	});
	context.subscriptions.push(refreshClocDisposable);
}
