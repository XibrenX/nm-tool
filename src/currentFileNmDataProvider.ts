import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmLine } from './nmLine';

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

export class CurrentFileNmDataProvider implements vscode.TreeDataProvider<CurrentFileNmLineTreeItem>
{
    private _onDidChangeTreeData = new vscode.EventEmitter<void>()

    constructor(private nmStore: NmStore) {
        this.nmStore.onFilesUpdated(() => this._onDidChangeTreeData.fire())
        vscode.window.onDidChangeActiveTextEditor(() => this._onDidChangeTreeData.fire())
    }

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    getTreeItem(element: CurrentFileNmLineTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }
    getChildren(element?: CurrentFileNmLineTreeItem | undefined): vscode.ProviderResult<CurrentFileNmLineTreeItem[]> {
        const activeTextEditor = vscode.window.activeTextEditor

        if (element || !activeTextEditor) {
            return []
        }
        const filename = activeTextEditor.document.fileName

        return this.nmStore.runs.flatMap(f => f.lines).filter(l => l.matchesFileName(filename)).sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).map(l => new CurrentFileNmLineTreeItem(l))
    }

    resolveTreeItem(item: vscode.TreeItem, element: CurrentFileNmLineTreeItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem>
    {
        let activeTextEditor = vscode.window.activeTextEditor
        if (activeTextEditor && element.nmLine.line)
        {
            item.command = { title: 'Jump to position', command: 'editor.action.goToLocations', arguments: [activeTextEditor.document.uri, activeTextEditor.selection.start, [new vscode.Location(activeTextEditor.document.uri, new vscode.Position(element.nmLine.line - 1, 0))], 'goto', 'Position not found'] }
        }

        return item
    }
}
