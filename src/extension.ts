import * as vscode from 'vscode';
import { ClocSidebarProvider } from './clocSidebarProvider';

/**
 * Called when your extension is activated. Registers commands and the cloc sidebar provider.
 * @param context The VS Code extension context for managing disposables and state.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "vs-cloc" is now active!');

	const disposable = vscode.commands.registerCommand('vs-cloc.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vs-cloc!');
	});
	context.subscriptions.push(disposable);

	const sidebarProvider = new ClocSidebarProvider();
	vscode.window.registerTreeDataProvider('vsClocSidebar', sidebarProvider);

	const runClocDisposable = vscode.commands.registerCommand('vs-cloc.runCloc', () => {
		sidebarProvider.runCloc();
		vscode.window.showInformationMessage('Running cloc...');
	});
	context.subscriptions.push(runClocDisposable);

	const refreshClocDisposable = vscode.commands.registerCommand('vs-cloc.refreshCloc', () => {
		sidebarProvider.runCloc();
		vscode.window.showInformationMessage('Cloc results refreshed!');
	});
	context.subscriptions.push(refreshClocDisposable);
}
