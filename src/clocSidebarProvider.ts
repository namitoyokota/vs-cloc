import { exec } from 'child_process';
import * as vscode from 'vscode';

export class ClocSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private clocOutput: string[] = [];
    private running: boolean = false;

    constructor() {
        this.runCloc();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        // Remove the refresh button from the tree; use view/title button instead
        if (!element) {
            return Promise.resolve(this.getClocItems());
        }
        return Promise.resolve([]);
    }

    getClocItems(): vscode.TreeItem[] {
        if (this.running) {
            return [
                new vscode.TreeItem('Running cloc...'),
                ...this.clocOutput.map(line => new vscode.TreeItem(line))
            ];
        }
        if (this.clocOutput.length === 0) {
            return [
                new vscode.TreeItem('No cloc output yet.')
            ];
        }
        return this.clocOutput.map(line => new vscode.TreeItem(line));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    runCloc() {
        console.log('CLOC: runCloc: started');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            console.log('CLOC: No workspace folder found. Aborting cloc run.');
            this.clocOutput = ['No workspace folder found. Please open a folder in VS Code.'];
            this.running = false;
            this.refresh();
            return;
        }
        this.running = true;
        this.refresh();
        // Use --vcs=git to only count files tracked by git
        const proc = exec('npx cloc --json --vcs=git .', { cwd: workspaceFolder });
        let stdout = '';
        console.log('CLOC: cloc process started with cwd:', workspaceFolder);
        if (proc.stdout) {
            proc.stdout.on('data', (data) => {
                console.log('CLOC: cloc stdout data:', data);
                stdout += data;
                // Optionally show a progress message
                this.clocOutput = ['Cloc is running...'];
                this.refresh();
            });
        } else {
            console.log('CLOC: proc.stdout is null');
        }
        proc.on('close', (code) => {
            console.log('CLOC: cloc process closed with code:', code);
            this.running = false;
            // Try to parse JSON output
            try {
                const jsonEnd = stdout.lastIndexOf('}') + 1;
                const jsonStr = stdout.slice(0, jsonEnd);
                const result = JSON.parse(jsonStr);
                // Simplified output: number of files and lines of code per file type, with commas
                const formatNumber = (n: number) => n.toLocaleString();
                this.clocOutput = Object.entries(result)
                    .filter(([key]) => key !== 'header' && key !== 'SUM')
                    .map(([lang, stats]) => `${lang}: ${formatNumber((stats as any)['nFiles'] ?? 0)} files, ${formatNumber((stats as any)['code'] ?? 0)} lines`);
                // Add summary if available
                if (result['SUM']) {
                    this.clocOutput.push(`Total files: ${formatNumber(result['SUM']['nFiles'])}, Total lines: ${formatNumber(result['SUM']['code'])}`);
                }
                if (this.clocOutput.length === 0) {
                    this.clocOutput = ['No code files found.'];
                }
            } catch (e) {
                this.clocOutput = ['Error parsing cloc output:', e instanceof Error ? e.message : String(e), 'Raw output:', stdout];
            }
            this.refresh();
            vscode.window.showInformationMessage('Cloc results updated!');
        });
        proc.on('error', (err) => {
            console.log('CLOC: cloc process error:', err);
            this.running = false;
            this.clocOutput = ['Error running cloc:', err.message];
            this.refresh();
        });
    }
}
