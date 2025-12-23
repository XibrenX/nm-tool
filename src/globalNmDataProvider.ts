import * as vscode from 'vscode';
import { NmLine } from './nmLine';
import { NmStore } from './nmStore';
import { NmRun } from './nmRun';

export class GlobalNmRunTreeItem extends vscode.TreeItem
{
    constructor(public readonly nmRun: NmRun, nmStore: NmStore)
    {
        super(nmStore.getUniquePart(nmRun), vscode.TreeItemCollapsibleState.Expanded);
        this.tooltip = nmRun.file.fsPath;
        this.resourceUri = nmRun.file;
        this.contextValue = 'nmRun';
    }
}

class GlobalNmTypeTreeItem extends vscode.TreeItem
{
    constructor(public readonly nmRun: NmRun, public readonly type: string, public readonly sum: number)
    {
        super(`${type} ${sum}`, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'nmType';
    }
}

class GlobalNmLineTreeItem extends vscode.TreeItem
{
    constructor(public readonly nmLine: NmLine)
    {
        const size = nmLine.size?.toString() ?? "?" ;
        super(`${nmLine.type} ${size}`);

        this.description = nmLine.name;
        this.tooltip = `${nmLine.inputPosition.toString(16)} ${this.description}`;

        if (nmLine.file !== undefined)
        {
            let goTo = nmLine.file;
            if (nmLine.line !== undefined)
            {
                goTo += `:${nmLine.line}`;
            }
            this.command = {
                title: 'Jump to code', command: 'workbench.action.quickOpen', arguments: [goTo]
            };
            this.tooltip += '\n\n' + goTo;
        }
        this.contextValue = 'nmLine';
    }
}

type GlobalNmTreeItem = GlobalNmRunTreeItem | GlobalNmLineTreeItem

export class GlobalNmDataProvider implements vscode.TreeDataProvider<GlobalNmTreeItem>
{
    constructor(private readonly nmStore: NmStore)
    {}

    readonly onDidChangeTreeData = this.nmStore.onFilesUpdated;

    getTreeItem(element: GlobalNmTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: GlobalNmTreeItem | undefined): vscode.ProviderResult<GlobalNmTreeItem[]> {
        if (element instanceof GlobalNmTypeTreeItem) {
            return element.nmRun.lines.filter(l => l.type == element.type).sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).slice(0, 100).map(l => new GlobalNmLineTreeItem(l));
        }

        let nmRun: NmRun | undefined;
        if (element === undefined) {
            if (this.nmStore.runs.length == 1)
            {
                nmRun = this.nmStore.runs[0];
            }
            else
            {
                return this.nmStore.runs.map((r) => new GlobalNmRunTreeItem(r, this.nmStore));
            }
        } else if (element instanceof GlobalNmRunTreeItem ) {
            nmRun = element.nmRun;
        }

        if (nmRun === undefined)
            return [];

        const types = new Map<string, number>();
        for (const line of nmRun.lines) {
            types.set(line.type, (types.get(line.type) ?? 0) + (line.size ?? 0));
        }
        const typeTreeItems: GlobalNmTypeTreeItem[] = [];
        for (const type of types) {
            typeTreeItems.push(new GlobalNmTypeTreeItem(nmRun, type[0], type[1]));
        }
        typeTreeItems.sort((t0, t1) => {
            if (t0.type.toLowerCase() == t1.type.toLowerCase())
            {
                return t0.type > t1.type ? 1 : -1;
            }
            else
            {
                return t0.type.toLowerCase() > t1.type.toLowerCase() ? 1 : -1;
            }
        });
        return typeTreeItems;
    }
}