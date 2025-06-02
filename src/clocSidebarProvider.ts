import { exec } from 'child_process';
import * as vscode from 'vscode';

/**
 * Enum for commonly used TreeItem IDs and labels to avoid magic strings and typos.
 */
enum ClocTree {
    TotalRootId = 'totalRoot',
    TotalRootLabel = 'Total',
    FilesRootId = 'filesRoot',
    FilesRootLabel = 'Files',
    LinesRootId = 'linesRoot',
    LinesRootLabel = 'Lines',
    TotalFilesId = 'totalFiles',
    TotalLinesId = 'totalLines',
}

/**
 * Provides a TreeView sidebar for displaying cloc (Count Lines of Code) results in VS Code.
 * Supports filtering, sorting, and summary statistics for files and lines per language.
 */
export class ClocSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private clocOutput: string[] = [];
    private running: boolean = false;
    private fileCounts: string[] = [];
    private lineCounts: string[] = [];
    private filter: string | undefined = undefined;

    constructor() {
        this.runCloc();
    }

    /**
     * Returns the TreeItem for the given element.
     * @param element The TreeItem element.
     * @returns The same TreeItem element.
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Returns the children TreeItems for the given element.
     * @param element The parent TreeItem or undefined for root.
     * @returns A Promise resolving to an array of TreeItems.
     */
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            const totalRoot = new vscode.TreeItem(ClocTree.TotalRootLabel, vscode.TreeItemCollapsibleState.Expanded);
            totalRoot.id = ClocTree.TotalRootId;
            totalRoot.iconPath = new vscode.ThemeIcon('repo');

            const filesRoot = new vscode.TreeItem(ClocTree.FilesRootLabel, vscode.TreeItemCollapsibleState.Expanded);
            filesRoot.id = ClocTree.FilesRootId;
            filesRoot.iconPath = new vscode.ThemeIcon('file-directory');

            const linesRoot = new vscode.TreeItem(ClocTree.LinesRootLabel, vscode.TreeItemCollapsibleState.Expanded);
            linesRoot.id = ClocTree.LinesRootId;
            linesRoot.iconPath = new vscode.ThemeIcon('file-code');

            return Promise.resolve([totalRoot, filesRoot, linesRoot]);
        }

        if (element.label === ClocTree.TotalRootLabel && element.id === ClocTree.TotalRootId) {
            const totalFiles = this.fileCounts.find(l => /^Total files:/i.test(l));
            const totalLines = this.lineCounts.find(l => /^Total lines:/i.test(l));

            const filesProp = new vscode.TreeItem(
                `Files: ${totalFiles ? totalFiles.replace(/^Total files: /i, '') : '0'}`,
                vscode.TreeItemCollapsibleState.None
            );
            filesProp.id = ClocTree.TotalFilesId;
            filesProp.iconPath = new vscode.ThemeIcon('file-directory');

            const linesProp = new vscode.TreeItem(
                `Lines: ${totalLines ? totalLines.replace(/^Total lines: /i, '') : '0'}`,
                vscode.TreeItemCollapsibleState.None
            );
            linesProp.id = ClocTree.TotalLinesId;
            linesProp.iconPath = new vscode.ThemeIcon('file-code');

            return Promise.resolve([filesProp, linesProp]);
        }

        if (element.id === ClocTree.FilesRootId) {
            return Promise.resolve(this.getFileCountItems());
        }

        if (element.id === ClocTree.LinesRootId) {
            return Promise.resolve(this.getLineCountItems());
        }

        return Promise.resolve([]);
    }

    /**
     * Returns TreeItems for each language's file count, sorted descending, filtered if needed.
     * @returns Array of TreeItems for file counts.
     */
    getFileCountItems(): vscode.TreeItem[] {
        if (this.running || this.fileCounts.length === 0) {
            return [];
        }

        let filtered = this.fileCounts.filter(l => !/^Total files:/i.test(l));

        if (this.filter && this.filter.trim() !== '') {
            const filterLower = this.filter.toLowerCase();
            filtered = filtered.filter(line => {
                const match = line.match(/^(.*?): (.*?) files?$/i);
                if (match) {
                    return match[1].toLowerCase().includes(filterLower);
                }
                return true;
            });
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

        return filtered.map(line => {
            const match = line.match(/^(.*?): (.*?) files?$/i);
            let label = line, description = '';
            if (match) {
                label = match[1];
                description = match[2] + ' files';
            }
            const item = new vscode.TreeItem(label);
            item.description = description;
            item.command = undefined;
            if (label !== 'Total') {
                item.iconPath = new vscode.ThemeIcon('symbol-file');
            }
            return item;
        });
    }

    /**
     * Returns TreeItems for each language's line count, sorted descending, filtered if needed.
     * @returns Array of TreeItems for line counts.
     */
    getLineCountItems(): vscode.TreeItem[] {
        if (this.running || this.lineCounts.length === 0) {
            return [];
        }

        let filtered = this.lineCounts.filter(l => !/^Total lines:/i.test(l));

        if (this.filter && this.filter.trim() !== '') {
            const filterLower = this.filter.toLowerCase();
            filtered = filtered.filter(line => {
                const match = line.match(/^(.*?): (.*?) lines?$/i);
                if (match) {
                    return match[1].toLowerCase().includes(filterLower);
                }
                return true;
            });
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

        return filtered.map(line => {
            const match = line.match(/^(.*?): (.*?) lines?$/i);
            let label = line, description = '';
            if (match) {
                label = match[1];
                description = match[2] + ' lines';
            }
            const item = new vscode.TreeItem(label);
            item.description = description;
            item.command = undefined;
            if (label !== 'Total') {
                item.iconPath = new vscode.ThemeIcon('note');
            }
            return item;
        });
    }

    /**
     * Sets the filter string for language filtering and refreshes the view.
     * @param filter The filter string or undefined to clear.
     */
    setFilter(filter: string | undefined) {
        this.filter = filter;
        this.refresh();
    }

    /**
     * Clears the filter and refreshes the view.
     */
    clearFilter() {
        this.filter = undefined;
        this.refresh();
    }

    /**
     * Refreshes the TreeView.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Runs cloc in the workspace and updates file/line counts.
     */
    runCloc() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            this.clocOutput = ['No workspace folder found. Please open a folder in VS Code.'];
            this.running = false;
            this.refresh();
            return;
        }

        this.running = true;
        this.refresh();

        const proc = exec('npx cloc --json --vcs=git .', { cwd: workspaceFolder });
        let stdout = '';

        proc.stdout?.on('data', (data) => {
            stdout += data;
            this.clocOutput = ['Cloc is running...'];
            this.refresh();
        });

        proc.on('close', (code) => {
            this.running = false;
            try {
                const jsonEnd = stdout.lastIndexOf('}') + 1;
                const jsonStr = stdout.slice(0, jsonEnd);
                const result = JSON.parse(jsonStr);
                const formatNumber = (n: number) => n.toLocaleString();
                this.fileCounts = [];
                this.lineCounts = [];
                Object.entries(result)
                    .filter(([key]) => key !== 'header' && key !== 'SUM')
                    .forEach(([lang, stats]) => {
                        this.fileCounts.push(`${lang}: ${formatNumber((stats as any)['nFiles'] ?? 0)} files`);
                        this.lineCounts.push(`${lang}: ${formatNumber((stats as any)['code'] ?? 0)} lines`);
                    });
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
            this.running = false;
            this.clocOutput = ['Error running cloc:', err.message];
            this.refresh();
        });
    }
}
