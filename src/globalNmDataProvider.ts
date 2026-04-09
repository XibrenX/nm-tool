import * as vscode from 'vscode';
import { NmLine } from './nmLine';
import { NmStore } from './nmStore';
import { NmRun } from './nmRun';
import { ObjdumpView } from './objdumpView';
import { ObjdumpLabel } from './objdumpLabel';
import { ObjdumpInstruction } from './objdumpInstruction';

export class GlobalNmRunTreeItem extends vscode.TreeItem
{
    constructor(public readonly nmRun: NmRun, nmStore: NmStore)
    {
        super(nmStore.getUniquePart(nmRun), vscode.TreeItemCollapsibleState.Expanded);
        this.tooltip = `${nmRun.file.fsPath}\n${nmRun.nmTool}`;
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
        super(`${nmLine.type} ${size}`, nmLine.objdumpLabel === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);

        this.description = nmLine.name;
        this.tooltip = `${nmLine.address.toString(16)} ${this.description}`;

        if (nmLine.file !== undefined)
        {
            let goTo = nmLine.file;
            if (nmLine.line !== undefined)
            {
                goTo += `:${nmLine.line}`;
            }
            this.command = {
                title: 'Jump to code', command: 'nm-tool.editorOpen', arguments: [goTo]
            };
            this.tooltip += '\n\n' + goTo;
        } 
        else if (this.nmLine.objdumpLabel)
        {
            const objDumpViewCommand = ObjdumpView.getObjdumpViewShowCommand(this.nmLine.objdumpLabel);
            this.command = {
                title: 'Show objdump',
                command: objDumpViewCommand.command,
                arguments: objDumpViewCommand.arguments
            };
        }
        this.contextValue = 'nmLine';
    }
}

class ObjdumpInstructionRefTreeItem extends vscode.TreeItem
{
    public get isRecursive(): boolean { return this.parents.some(l => l === this.instruction.label); }

    constructor(public readonly instruction: ObjdumpInstruction, public readonly parents: ObjdumpLabel[])
    {
        const isRecursive = parents.some(l => l === instruction.label);
        super(`Called from ${instruction.addressStr}${isRecursive ? ' (recursive)' : ''}`, isRecursive ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `in ${instruction.label.addressStr} ${instruction.label.name}`;
        this.tooltip = instruction.location;
        
        this.contextValue = 'objdumpInstructionRef';

        if (instruction.location)
        {
            this.command = {
                title: 'Jump to code', command: 'nm-tool.editorOpen', arguments: [instruction.location]
            };
        }
        else
        {
            this.command = ObjdumpView.getObjdumpViewShowCommand(instruction.label);
        }
    }
}

type GlobalNmTreeItem = GlobalNmRunTreeItem | GlobalNmTypeTreeItem | GlobalNmLineTreeItem | ObjdumpInstructionRefTreeItem

export class GlobalNmDataProvider implements vscode.TreeDataProvider<GlobalNmTreeItem>
{
    constructor(private readonly nmStore: NmStore)
    {
        this.nmStore.onFilesUpdated(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    private _onDidChangeTreeData: vscode.EventEmitter<GlobalNmTreeItem | undefined | null | void> = new vscode.EventEmitter<GlobalNmTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<GlobalNmTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: GlobalNmTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: GlobalNmTreeItem | undefined): vscode.ProviderResult<GlobalNmTreeItem[]> {
        if (element instanceof ObjdumpInstructionRefTreeItem)
        {
            if (element.isRecursive)
            {
                return [];
            }
            else
            {
                const childeren = element.instruction.label.section.nmRun.refs
                    .filter(r => r.to.label === element.instruction.label && r.from.label !== element.instruction.label)
                    .map(r => new ObjdumpInstructionRefTreeItem(r.from, element.parents.splice(element.parents.length, 0, element.instruction.label)));
                if (childeren.length === 0)
                {
                   element.collapsibleState = vscode.TreeItemCollapsibleState.None;
                   this._onDidChangeTreeData.fire(element);
                }
                return childeren;
            }
        }

        if (element instanceof GlobalNmLineTreeItem)
        {
            if (element.nmLine.objdumpLabel)
            {
                const childeren = element.nmLine.run.refs
                    .filter(r => r.to.label === element.nmLine.objdumpLabel && r.from.label !== element.nmLine.objdumpLabel)
                    .map(r => new ObjdumpInstructionRefTreeItem(r.from, [element.nmLine.objdumpLabel!]));
                if (childeren.length === 0)
                {
                   element.collapsibleState = vscode.TreeItemCollapsibleState.None;
                   this._onDidChangeTreeData.fire(element);
                }
                return childeren;
            }
            else
            {
                return [];
            }
        }

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
                return this.nmStore.runs.map((r) => new GlobalNmRunTreeItem(r, this.nmStore)).sort((a, b) => a.label! > b.label! ? 1 : -1);
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