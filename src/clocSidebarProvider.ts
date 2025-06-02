import { exec } from 'child_process';
import * as vscode from 'vscode';

export class ClocSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private clocOutput: string[] = [];
    private running: boolean = false;
    private fileCounts: string[] = [];
    private lineCounts: string[] = [];
    private filter: string | undefined = undefined;

    constructor() {
        this.runCloc();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        // If no element, return the root collapsible 'Files' and 'Lines' items
        if (!element) {
            const filesRoot = new vscode.TreeItem('Files', vscode.TreeItemCollapsibleState.Expanded);
            filesRoot.id = 'filesRoot';
            filesRoot.iconPath = new vscode.ThemeIcon('file-directory');
            // Use a built-in icon for lines section (e.g., 'note' for code)
            const linesRoot = new vscode.TreeItem('Lines', vscode.TreeItemCollapsibleState.Expanded);
            linesRoot.id = 'linesRoot';
            linesRoot.iconPath = new vscode.ThemeIcon('note');
            return Promise.resolve([filesRoot, linesRoot]);
        }
        // If the element is the 'Files' root, return the file count items
        if (element.label === 'Files' && element.id === 'filesRoot') {
            return Promise.resolve(this.getFileCountItems());
        }
        // If the element is the 'Lines' root, return the line count items
        if (element.label === 'Lines' && element.id === 'linesRoot') {
            return Promise.resolve(this.getLineCountItems());
        }
        return Promise.resolve([]);
    }

    getFileCountItems(): vscode.TreeItem[] {
        if (this.running || this.fileCounts.length === 0) {
            return [];
        }
        // Apply filter if set
        let filtered = this.fileCounts;
        if (this.filter && this.filter.trim() !== '') {
            const filterLower = this.filter.toLowerCase();
            filtered = filtered.filter(line => {
                const match = line.match(/^(.*?): (.*?) files?$/i);
                if (match) {
                    return match[1].toLowerCase().includes(filterLower);
                }
                return true;
            });
            // Always include the Total line if present
            const total = this.fileCounts.find(l => /^Total files:/i.test(l));
            if (total && !filtered.includes(total)) {
                filtered.push(total);
            }
        }
        // Sort by file count descending, keep 'Total' at the end
        const totalIdx = filtered.findIndex(l => /^Total files:/i.test(l));
        let totalLine: string | undefined = undefined;
        if (totalIdx !== -1) {
            totalLine = filtered.splice(totalIdx, 1)[0];
        }
        filtered.sort((a, b) => {
            const aMatch = a.match(/^(.*?): ([\d,]+) files?$/i);
            const bMatch = b.match(/^(.*?): ([\d,]+) files?$/i);
            if (aMatch && bMatch) {
                const aNum = parseInt(aMatch[2].replace(/,/g, ''));
                const bNum = parseInt(bMatch[2].replace(/,/g, ''));
                return bNum - aNum;
            }
            return 0;
        });
        if (totalLine) { filtered.push(totalLine); }
        return filtered.map(line => {
            // Improved: parse fileCounts to label/description, non-clickable, non-selectable
            const match = line.match(/^(.*?): (.*?) files?$/i);
            let label = line, description = '';
            if (match) {
                label = match[1];
                description = match[2] + ' files';
            }
            // Special handling for total
            if (/^Total files:/i.test(line)) {
                label = 'Total';
                description = line.replace(/^Total files: /i, '') + ' files';
            }
            const item = new vscode.TreeItem(label);
            item.description = description;
            item.command = undefined;
            // Optionally, add a file icon for each language (skip for Total)
            if (label !== 'Total') {
                item.iconPath = new vscode.ThemeIcon('symbol-file');
            }
            return item;
        });
    }

    getLineCountItems(): vscode.TreeItem[] {
        if (this.running || this.lineCounts.length === 0) {
            return [];
        }
        // Apply filter if set
        let filtered = this.lineCounts;
        if (this.filter && this.filter.trim() !== '') {
            const filterLower = this.filter.toLowerCase();
            filtered = filtered.filter(line => {
                const match = line.match(/^(.*?): (.*?) lines?$/i);
                if (match) {
                    return match[1].toLowerCase().includes(filterLower);
                }
                return true;
            });
            // Always include the Total line if present
            const total = this.lineCounts.find(l => /^Total lines:/i.test(l));
            if (total && !filtered.includes(total)) {
                filtered.push(total);
            }
        }
        // Sort by line count descending, keep 'Total' at the end
        const totalIdx = filtered.findIndex(l => /^Total lines:/i.test(l));
        let totalLine: string | undefined = undefined;
        if (totalIdx !== -1) {
            totalLine = filtered.splice(totalIdx, 1)[0];
        }
        filtered.sort((a, b) => {
            const aMatch = a.match(/^(.*?): ([\d,]+) lines?$/i);
            const bMatch = b.match(/^(.*?): ([\d,]+) lines?$/i);
            if (aMatch && bMatch) {
                const aNum = parseInt(aMatch[2].replace(/,/g, ''));
                const bNum = parseInt(bMatch[2].replace(/,/g, ''));
                return bNum - aNum;
            }
            return 0;
        });
        if (totalLine) { filtered.push(totalLine); }
        return filtered.map(line => {
            // Improved: parse lineCounts to label/description, non-clickable, non-selectable
            const match = line.match(/^(.*?): (.*?) lines?$/i);
            let label = line, description = '';
            if (match) {
                label = match[1];
                description = match[2] + ' lines';
            }
            // Special handling for total
            if (/^Total lines:/i.test(line)) {
                label = 'Total';
                description = line.replace(/^Total lines: /i, '') + ' lines';
            }
            const item = new vscode.TreeItem(label);
            item.description = description;
            item.command = undefined;
            // Optionally, add a code icon for each language (skip for Total)
            if (label !== 'Total') {
                item.iconPath = new vscode.ThemeIcon('note');
            }
            return item;
        });
    }

    setFilter(filter: string | undefined) {
        this.filter = filter;
        this.refresh();
    }

    clearFilter() {
        this.filter = undefined;
        this.refresh();
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
                const formatNumber = (n: number) => n.toLocaleString();
                // Separate file and line counts for each language
                this.fileCounts = [];
                this.lineCounts = [];
                Object.entries(result)
                    .filter(([key]) => key !== 'header' && key !== 'SUM')
                    .forEach(([lang, stats]) => {
                        this.fileCounts.push(`${lang}: ${formatNumber((stats as any)['nFiles'] ?? 0)} files`);
                        this.lineCounts.push(`${lang}: ${formatNumber((stats as any)['code'] ?? 0)} lines`);
                    });
                // Add summary if available
                if (result['SUM']) {
                    this.fileCounts.push(`Total files: ${formatNumber(result['SUM']['nFiles'])}`);
                    this.lineCounts.push(`Total lines: ${formatNumber(result['SUM']['code'])}`);
                }
                if (this.fileCounts.length === 0 && this.lineCounts.length === 0) {
                    this.fileCounts = ['No code files found.'];
                }
            } catch (e) {
                this.fileCounts = ['Error parsing cloc output:', e instanceof Error ? e.message : String(e), 'Raw output:', stdout];
                this.lineCounts = [];
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
