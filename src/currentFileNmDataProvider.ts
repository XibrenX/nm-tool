import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmLine } from './nmLine';
import { NmRun } from './nmRun';
import * as path from 'path'

class CurrentFileNmRunTreeItem extends vscode.TreeItem {
    constructor(public readonly nmRun: NmRun) {
        super(nmRun.file.fsPath.split(path.sep).at(-1) ?? nmRun.file.fsPath, vscode.TreeItemCollapsibleState.Expanded)
        this.tooltip = nmRun.file.fsPath
    }
}

class CurrentFileNmLineTreeItem extends vscode.TreeItem {
    constructor(public readonly nmLine: NmLine) {
        const size = nmLine.size?.toString() ?? "?"
        super(`${nmLine.type} ${size}`)

        this.description = nmLine.name
        this.tooltip = this.description

        if (this.nmLine.line !== undefined)
        {
            this.tooltip += '\n\nLine ' + this.nmLine.line
        }
    }
}

type CurrentFileNmTreeItem = CurrentFileNmRunTreeItem | CurrentFileNmLineTreeItem


export class CurrentFileNmDataProvider implements vscode.TreeDataProvider<CurrentFileNmTreeItem>
{
    private _onDidChangeTreeData = new vscode.EventEmitter<void>()

    constructor(private nmStore: NmStore) {
        this.nmStore.onFilesUpdated(() => this._onDidChangeTreeData.fire())
        vscode.window.onDidChangeActiveTextEditor(() => this._onDidChangeTreeData.fire())
    }

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    getTreeItem(element: CurrentFileNmTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }
    getChildren(element?: CurrentFileNmTreeItem | undefined): vscode.ProviderResult<CurrentFileNmTreeItem[]> {
        const activeTextEditor = vscode.window.activeTextEditor
        if (!activeTextEditor) {
            return []
        }
        const filename = activeTextEditor.document.fileName

        let nmRun: NmRun | undefined = undefined
        if (element === undefined) {
            if (this.nmStore.runs.length == 1) {
                nmRun = this.nmStore.runs[0]
            } else {
                return this.nmStore.runs.filter((r) => r.lines.some(l => l.matchesFileName(filename))).map((r) => new CurrentFileNmRunTreeItem(r))
            }
        } else if (element instanceof CurrentFileNmRunTreeItem ) {
            nmRun = element.nmRun as NmRun
        } else {
            return []
        }

        return nmRun.lines.filter(l => l.matchesFileName(filename)).sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).map(l => new CurrentFileNmLineTreeItem(l))
    }

    resolveTreeItem(item: vscode.TreeItem, element: CurrentFileNmTreeItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem>
    {
        if (element instanceof CurrentFileNmLineTreeItem)
        {
            let activeTextEditor = vscode.window.activeTextEditor
            if (activeTextEditor && element.nmLine.line) {
                item.command = { title: 'Jump to position', command: 'editor.action.goToLocations', arguments: [activeTextEditor.document.uri, activeTextEditor.selection.start, [new vscode.Location(activeTextEditor.document.uri, new vscode.Position(element.nmLine.line - 1, 0))], 'goto', 'Position not found'] }
            }
        }
        return item
    }
}
