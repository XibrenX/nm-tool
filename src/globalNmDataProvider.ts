import * as vscode from 'vscode';
import { NmLine } from './nmLine';
import { NmStore } from './nmStore';

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

export class GlobalNmDataProvider implements vscode.TreeDataProvider<GlobalNmLineTreeItem>
{
    constructor(private nmStore: NmStore)
    {}

    readonly onDidChangeTreeData = this.nmStore.onFilesUpdated

    getTreeItem(element: GlobalNmLineTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }
    getChildren(element?: GlobalNmLineTreeItem | undefined): vscode.ProviderResult<GlobalNmLineTreeItem[]> {
        if (element)
        {
            return []
        }

        return this.nmStore.runs.flatMap(v => v.lines).sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).slice(0, 100).map(l => new GlobalNmLineTreeItem(l))
    }
}