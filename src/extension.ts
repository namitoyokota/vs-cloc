// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ClocSidebarProvider } from './clocSidebarProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vs-cloc" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vs-cloc.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from vs-cloc!');
	});

	context.subscriptions.push(disposable);

	// Register the sidebar provider
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

// This method is called when your extension is deactivated
export function deactivate() {}
