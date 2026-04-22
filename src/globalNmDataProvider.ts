import * as vscode from 'vscode';
import { NmSymbol } from './nmSymbol';
import { NmStore } from './nmStore';
import { NmRun } from './nmRun';
import { ObjdumpView } from './objdumpView';
import { ObjdumpSymbol } from './objdumpSymbol';
import { ObjdumpInstruction } from './objdumpInstruction';

export class GlobalNmRunTreeItem extends vscode.TreeItem {
    constructor(public readonly nmRun: NmRun, nmStore: NmStore) {
        super(nmStore.getUniquePart(nmRun), vscode.TreeItemCollapsibleState.Expanded);
        this.tooltip = `${nmRun.file.fsPath}\n${nmRun.nmTool}`;
        this.resourceUri = nmRun.file;
        this.contextValue = 'nmRun';
    }
}

class GlobalNmTypeTreeItem extends vscode.TreeItem {
    constructor(public readonly nmRun: NmRun, public readonly type: string, public readonly sum: number) {
        super(`${type} ${sum}`, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'nmType';
    }
}

class GlobalNmLineTreeItem extends vscode.TreeItem {
    constructor(public readonly nmLine: NmSymbol) {
        const size = nmLine.size?.toString() ?? "?";
        super(`${nmLine.type} ${size}`, nmLine.objdumpSymbol === undefined ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);

        this.description = nmLine.name;
        this.tooltip = `${nmLine.addressStr} ${this.description}`;

        if (nmLine.file !== undefined) {
            let goTo = nmLine.file;
            if (nmLine.line !== undefined) {
                goTo += `:${nmLine.line}`;
            }
            this.command = {
                title: 'Jump to code', command: 'nm-tool.editorOpen', arguments: [goTo]
            };
            this.tooltip += '\n\n' + goTo;
        }
        else if (this.nmLine.objdumpSymbol) {
            const objDumpViewCommand = ObjdumpView.getObjdumpViewShowCommandFromAddress(this.nmLine.run.file, this.nmLine.objdumpSymbol.address);
            this.command = {
                title: 'Show objdump',
                command: objDumpViewCommand.command,
                arguments: objDumpViewCommand.arguments
            };
        }
        this.contextValue = 'nmLine';
    }
}

class ObjdumpInstructionRefTreeItem extends vscode.TreeItem {
    public get isRecursive(): boolean { return this.parents.some(l => l === this.instruction.symbol); }

    constructor(public readonly instruction: ObjdumpInstruction, public readonly parents: ObjdumpSymbol[]) {
        const isRecursive = parents.some(l => l === instruction.symbol);
        super(`Reference from ${instruction.addressStr}${isRecursive ? ' (recursive)' : ''}`, isRecursive ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `in ${instruction.symbol.addressStr} ${instruction.symbol.name}`;
        this.tooltip = instruction.location;

        this.contextValue = 'objdumpInstructionRef';

        if (instruction.location) {
            this.command = {
                title: 'Jump to code', command: 'nm-tool.editorOpen', arguments: [instruction.location]
            };
        }
        else {
            this.command = ObjdumpView.getObjdumpViewShowCommandFromAddress(instruction.symbol.section.nmRun.file, instruction.address);
        }
    }
}

type GlobalNmTreeItem = GlobalNmRunTreeItem | GlobalNmTypeTreeItem | GlobalNmLineTreeItem | ObjdumpInstructionRefTreeItem

export class GlobalNmDataProvider implements vscode.TreeDataProvider<GlobalNmTreeItem> {
    constructor(private readonly nmStore: NmStore) {
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
        if (element instanceof ObjdumpInstructionRefTreeItem) {
            if (element.isRecursive) {
                return [];
            }
            else {
                const childeren = element.instruction.symbol.section.nmRun.refsFromOtherLabels(element.instruction.symbol)
                    .map(r => new ObjdumpInstructionRefTreeItem(r.from, element.parents.splice(element.parents.length, 0, element.instruction.symbol)));
                if (childeren.length === 0) {
                    element.collapsibleState = vscode.TreeItemCollapsibleState.None;
                    this._onDidChangeTreeData.fire(element);
                }
                return childeren;
            }
        }

        if (element instanceof GlobalNmLineTreeItem) {
            if (element.nmLine.objdumpSymbol) {
                const childeren = element.nmLine.run.refsFromOtherLabels(element.nmLine.objdumpSymbol)
                    .map(r => new ObjdumpInstructionRefTreeItem(r.from, [element.nmLine.objdumpSymbol!]));
                if (childeren.length === 0) {
                    element.collapsibleState = vscode.TreeItemCollapsibleState.None;
                    this._onDidChangeTreeData.fire(element);
                }
                return childeren;
            }
            else {
                return [];
            }
        }

        if (element instanceof GlobalNmTypeTreeItem) {
            return element.nmRun.symbols.as_array().filter(l => l.type == element.type).sort((la, lb) => (lb.size ?? -1) - (la.size ?? -1)).slice(0, 100).map(l => new GlobalNmLineTreeItem(l));
        }

        let nmRun: NmRun | undefined;
        if (element === undefined) {
            if (this.nmStore.runs.length == 1) {
                nmRun = this.nmStore.runs.at(0)!;
            }
            else {
                return this.nmStore.runs.as_array().map((r) => new GlobalNmRunTreeItem(r, this.nmStore)).sort((a, b) => a.label! > b.label! ? 1 : -1);
            }
        } else if (element instanceof GlobalNmRunTreeItem) {
            nmRun = element.nmRun;
        }

        if (nmRun === undefined)
            return [];

        const types = new Map<string, number>();
        for (const line of nmRun.symbols) {
            types.set(line.type, (types.get(line.type) ?? 0) + (line.size ?? 0));
        }
        const typeTreeItems: GlobalNmTypeTreeItem[] = [];
        for (const type of types) {
            typeTreeItems.push(new GlobalNmTypeTreeItem(nmRun, type[0], type[1]));
        }
        typeTreeItems.sort((t0, t1) => {
            if (t0.type.toLowerCase() == t1.type.toLowerCase()) {
                return t0.type > t1.type ? 1 : -1;
            }
            else {
                return t0.type.toLowerCase() > t1.type.toLowerCase() ? 1 : -1;
            }
        });
        return typeTreeItems;
    }
}