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
 * Enum for all icon names used in the TreeView.
 */
enum ClocIcon {
	Repo = 'repo',
	FileDirectory = 'file-directory',
	FileCode = 'file-code',
	SymbolFile = 'symbol-file',
	Note = 'note',
}

/**
 * Provides a TreeView sidebar for displaying cloc (Count Lines of Code) results in VS Code.
 * Supports filtering, sorting, and summary statistics for files and lines per language.
 */
export class ClocSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	/** Emits events to refresh the TreeView. */
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter();

	/** Event to notify VS Code when the TreeView should refresh. */
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	/** Stores the latest cloc output or error messages. */
	private clocOutput: string[] = [];

	/** True if cloc is currently running. */
	private running: boolean = false;

	/** Stores the per-language file counts as formatted strings. */
	private fileCounts: string[] = [];

	/** Stores the per-language line counts as formatted strings. */
	private lineCounts: string[] = [];

	/** Current filter string for language search, or undefined for no filter. */
	private filter: string | undefined = undefined;

	constructor() {
		this.countLinesOfCode();
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
			totalRoot.iconPath = new vscode.ThemeIcon(ClocIcon.Repo);

			const filesRoot = new vscode.TreeItem(ClocTree.FilesRootLabel, vscode.TreeItemCollapsibleState.Expanded);
			filesRoot.id = ClocTree.FilesRootId;
			filesRoot.iconPath = new vscode.ThemeIcon(ClocIcon.FileDirectory);

			const linesRoot = new vscode.TreeItem(ClocTree.LinesRootLabel, vscode.TreeItemCollapsibleState.Expanded);
			linesRoot.id = ClocTree.LinesRootId;
			linesRoot.iconPath = new vscode.ThemeIcon(ClocIcon.FileCode);

			return Promise.resolve([totalRoot, filesRoot, linesRoot]);
		}

		if (element.label === ClocTree.TotalRootLabel && element.id === ClocTree.TotalRootId) {
			const totalFiles = this.fileCounts.find(l => /^Total files:/i.test(l));
			const totalLines = this.lineCounts.find(l => /^Total lines:/i.test(l));

			const filesValue = totalFiles ? totalFiles.replace(/^Total files: /i, '') : '0';
			const filesProp = new vscode.TreeItem('Files', vscode.TreeItemCollapsibleState.None);
			filesProp.id = ClocTree.TotalFilesId;
			filesProp.iconPath = new vscode.ThemeIcon(ClocIcon.FileDirectory);
			filesProp.description = filesValue + ' files';

			const linesValue = totalLines ? totalLines.replace(/^Total lines: /i, '') : '0';
			const linesProp = new vscode.TreeItem('Lines', vscode.TreeItemCollapsibleState.None);
			linesProp.id = ClocTree.TotalLinesId;
			linesProp.iconPath = new vscode.ThemeIcon(ClocIcon.FileCode);
			linesProp.description = linesValue + ' lines';

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
	 * Helper to filter and sort counts for files or lines.
	 * @param counts The array of formatted count strings.
	 * @param filter The filter string or undefined.
	 * @param totalPattern Regex to match the total line (to exclude from filtering/sorting).
	 * @param sortPattern Regex to extract the numeric value for sorting.
	 * @returns Filtered and sorted array of count strings (excluding total).
	 */
	private filterAndSortCounts(counts: string[], filter: string | undefined, totalPattern: RegExp, sortPattern: RegExp): string[] {
		let filtered = counts.filter(l => !totalPattern.test(l));

		if (filter && filter.trim() !== '') {
			const filterLower = filter.toLowerCase();
			filtered = filtered.filter(line => {
				const match = line.match(sortPattern);
				if (match) {
					return match[1].toLowerCase().includes(filterLower);
				}

				return true;
			});
		}

		filtered.sort((a, b) => {
			const aMatch = a.match(sortPattern);
			const bMatch = b.match(sortPattern);

			if (aMatch && bMatch) {
				const aNum = parseInt(aMatch[2].replace(/,/g, ''));
				const bNum = parseInt(bMatch[2].replace(/,/g, ''));
				return bNum - aNum;
			}

			return 0;
		});

		return filtered;
	}

	/**
	 * Helper to create a TreeItem from a formatted count string.
	 * @param line The formatted count string.
	 * @param regex Regex to extract label and description.
	 * @param suffix Suffix for the description (e.g., 'files', 'lines').
	 * @param icon The icon to use for the item.
	 * @returns A configured TreeItem.
	 */
	private createTreeItemFromLine(line: string, regex: RegExp, suffix: string, icon: ClocIcon): vscode.TreeItem {
		const match = line.match(regex);
		let label = line, description = '';

		if (match) {
			label = match[1];
			description = match[2] + ' ' + suffix;
		}

		const item = new vscode.TreeItem(label);
		item.description = description;
		item.command = undefined;

		if (label !== 'Total') {
			item.iconPath = new vscode.ThemeIcon(icon);
		}

		return item;
	}

	/**
	 * Helper to parse and populate fileCounts and lineCounts from cloc JSON result.
	 * @param result The parsed cloc JSON result.
	 */
	private parseClocResult(result: any): void {
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
	}

	/**
	 * Returns TreeItems for each language's file count, sorted descending, filtered if needed.
	 * @returns Array of TreeItems for file counts.
	 */
	getFileCountItems(): vscode.TreeItem[] {
		if (this.running || this.fileCounts.length === 0) {
			return [];
		}

		const filtered = this.filterAndSortCounts(
			this.fileCounts,
			this.filter,
			/^Total files:/i,
			/^(.*?): ([\d,]+) files?$/i
		);

		return filtered.map(line =>
			this.createTreeItemFromLine(line, /^(.*?): (.*?) files?$/i, 'files', ClocIcon.SymbolFile)
		);
	}

	/**
	 * Returns TreeItems for each language's line count, sorted descending, filtered if needed.
	 * @returns Array of TreeItems for line counts.
	 */
	getLineCountItems(): vscode.TreeItem[] {
		if (this.running || this.lineCounts.length === 0) {
			return [];
		}

		const filtered = this.filterAndSortCounts(
			this.lineCounts,
			this.filter,
			/^Total lines:/i,
			/^(.*?): ([\d,]+) lines?$/i
		);

		return filtered.map(line =>
			this.createTreeItemFromLine(line, /^(.*?): (.*?) lines?$/i, 'lines', ClocIcon.Note)
		);
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
	countLinesOfCode() {
		this.fileCounts = this.fileCounts.filter(l => !/^Total files:/i.test(l));
		this.lineCounts = this.lineCounts.filter(l => !/^Total lines:/i.test(l));
		this.fileCounts.push('Total files: 0');
		this.lineCounts.push('Total lines: 0');
		this.refresh();

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
			this.clocOutput = ['Counting lines of code...'];
			this.refresh();
		});

		proc.on('close', (code) => {
			this.running = false;
			try {
				const jsonEnd = stdout.lastIndexOf('}') + 1;
				const jsonStr = stdout.slice(0, jsonEnd);
				const result = JSON.parse(jsonStr);
				this.parseClocResult(result);
			} catch (e) {
				this.fileCounts = ['Error parsing counter:', e instanceof Error ? e.message : String(e), 'Raw output:', stdout];
				this.lineCounts = [];
			}

			this.refresh();
			vscode.window.showInformationMessage('Finished counting lines of code.');
		});

		proc.on('error', (err) => {
			this.running = false;
			this.clocOutput = ['Error running cloc:', err.message];
			this.refresh();
		});
	}
}
