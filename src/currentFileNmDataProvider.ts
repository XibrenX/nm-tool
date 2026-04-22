import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmSymbol } from './nmSymbol';
import { NmRun } from './nmRun';

export class CurrentFileNmRunTreeItem extends vscode.TreeItem {
    constructor(public readonly nmRun: NmRun, nmStore: NmStore) {
        super(nmStore.getUniquePart(nmRun), vscode.TreeItemCollapsibleState.Expanded);
        this.tooltip = `${nmRun.file.fsPath}\n${nmRun.nmTool}`;
        this.resourceUri = nmRun.file;
        this.contextValue = 'nmRun';
    }
}

class CurrentFileNmLineTreeItem extends vscode.TreeItem {
    constructor(public readonly nmLine: NmSymbol) {
        const size = nmLine.size?.toString() ?? "?";
        super(`${nmLine.type} ${size}`);

        this.description = nmLine.name;

        if (this.nmLine.line !== undefined) {
            this.description = `Line ${this.nmLine.line} ${this.description}`;
        }
    }
}

type CurrentFileNmTreeItem = CurrentFileNmRunTreeItem | CurrentFileNmLineTreeItem


export class CurrentFileNmDataProvider implements vscode.TreeDataProvider<CurrentFileNmTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();

    constructor(private readonly nmStore: NmStore) {
        this.nmStore.onFilesUpdated(() => this._onDidChangeTreeData.fire());
        vscode.window.onDidChangeActiveTextEditor(() => this._onDidChangeTreeData.fire());
    }

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    getTreeItem(element: CurrentFileNmTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: CurrentFileNmTreeItem | undefined): vscode.ProviderResult<CurrentFileNmTreeItem[]> {
        const activeTextEditor = vscode.window.activeTextEditor;
        if (!activeTextEditor) {
            return [];
        }
        const filename = activeTextEditor.document.fileName;

        let nmRun: NmRun | undefined = undefined;
        if (element === undefined) {
            if (this.nmStore.runs.length == 1) {
                nmRun = this.nmStore.runs.at(0)!;
            } else {
                return this.nmStore.runs.as_array().filter((r) => r.symbols.as_array().some(l => l.matchesFileName(filename))).map((r) => new CurrentFileNmRunTreeItem(r, this.nmStore));
            }
        } else if (element instanceof CurrentFileNmRunTreeItem) {
            nmRun = element.nmRun;
        } else {
            return [];
        }

        return nmRun.symbols.as_array().filter(l => l.matchesFileName(filename)).sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).map(l => new CurrentFileNmLineTreeItem(l));
    }

    resolveTreeItem(item: vscode.TreeItem, element: CurrentFileNmTreeItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        if (element instanceof CurrentFileNmLineTreeItem) {
            const activeTextEditor = vscode.window.activeTextEditor;
            if (activeTextEditor && element.nmLine.line) {
                item.command = { title: 'Jump to position', command: 'editor.action.goToLocations', arguments: [activeTextEditor.document.uri, activeTextEditor.selection.start, [new vscode.Location(activeTextEditor.document.uri, new vscode.Position(element.nmLine.line - 1, 0))], 'goto', 'Position not found'] };
            }
        }
        return item;
    }
}
