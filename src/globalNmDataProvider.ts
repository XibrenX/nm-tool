import * as vscode from 'vscode';
import { NmLine } from './nmLine';
import { NmStore } from './nmStore';
import { NmRun } from './nmRun';
import * as path from 'path'

class GlobalNmRunTreeItem extends vscode.TreeItem
{
    constructor(public readonly nmRun: NmRun)
    {
        super(nmRun.file.fsPath.split(path.sep).at(-1) ?? nmRun.file.fsPath, vscode.TreeItemCollapsibleState.Expanded)
        this.tooltip = nmRun.file.fsPath
    }
}

class GlobalNmLineTreeItem extends vscode.TreeItem
{
    constructor(public readonly nmLine: NmLine)
    {
        const size = nmLine.size?.toString() ?? "?" 
        super(`${nmLine.type} ${size}`)

        this.description = nmLine.name
        this.tooltip = this.description

        if (nmLine.file !== undefined)
        {
            let goTo = nmLine.file
            if (nmLine.line !== undefined)
            {
                goTo += `:${nmLine.line}`
            }
            this.command = {
                title: 'Jump to code', command: 'workbench.action.quickOpen', arguments: [goTo]
            }
            this.tooltip += '\n\n' + goTo
        }
    }
}

type GlobalNmTreeItem = GlobalNmRunTreeItem | GlobalNmLineTreeItem

export class GlobalNmDataProvider implements vscode.TreeDataProvider<GlobalNmTreeItem>
{
    constructor(private nmStore: NmStore)
    {}

    readonly onDidChangeTreeData = this.nmStore.onFilesUpdated

    getTreeItem(element: GlobalNmTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }
    getChildren(element?: GlobalNmTreeItem | undefined): vscode.ProviderResult<GlobalNmTreeItem[]> {
        let nmRun: NmRun | undefined = undefined
        if (element === undefined) {
            if (this.nmStore.runs.length == 1)
            {
                nmRun = this.nmStore.runs[0]
            }
            else
            {
                return this.nmStore.runs.map((r) => new GlobalNmRunTreeItem(r))
            }
        } else if (element instanceof GlobalNmRunTreeItem ) {
            nmRun = element.nmRun as NmRun
        } else {
            return []
        }

        return nmRun.lines.sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).slice(0, 100).map(l => new GlobalNmLineTreeItem(l))
    }
}