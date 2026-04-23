import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmSymbol } from './nmSymbol';
import { ObjdumpView } from './objdumpView';
import { ObjdumpInstruction } from './objdumpInstruction';
import { decodeLocation } from './extension';

export class NmLineCodeLens extends vscode.CodeLens {
    constructor(nmLine: NmSymbol, nmStore: NmStore) {
        if (nmLine.line === undefined)
            throw new Error();

        const range = new vscode.Range(nmLine.position!, nmLine.position!);

        let title = `Nm: ${nmLine.type} ${nmLine.size}`;
        if (nmStore.runs.length > 1)
            title += ` in ${nmStore.getUniquePart(nmLine.run)}`;

        let name = nmLine.name;
        if (nmLine.objdumpSymbol) {
            name += ` in ${nmLine.objdumpSymbol.section.name}`;
        }
        const tooltip = `${name}\n\n${nmLine.run.file.fsPath}:${nmLine.addressStr}`;

        const command: vscode.Command = {
            title: title, tooltip: tooltip, command: ''
        };

        if (nmLine.objdumpSymbol) {
            const objDumpViewCommand = ObjdumpView.getObjdumpViewShowCommandFromAddress(nmLine.objdumpSymbol);
            command.command = objDumpViewCommand.command;
            command.arguments = objDumpViewCommand.arguments;
        }

        super(range, command);
    }
}

export class RefsCodeLens extends vscode.CodeLens {
    constructor(documentUri: vscode.Uri, nmLine: NmSymbol, nmStore: NmStore, calls: ObjdumpInstruction[]) {
        let title = `Nm: ${calls.length} refs`;
        if (nmStore.runs.length > 1)
            title += ` in ${nmStore.getUniquePart(nmLine.run)}`;

        const tooltip = calls.map(i => `Referenced at ${i.addressStr} in ${i.symbol.addressStr} ${i.symbol.name}` + (i.location === undefined ? '' : `\n   ${i.location}`)).join('\n');

        const range = new vscode.Range(nmLine.position!, nmLine.position!);
        const locations = calls.filter(i => i.location !== undefined).map(i => decodeLocation(i.location!));

        const command: vscode.Command = {
            title: title,
            tooltip: tooltip,
            command: 'editor.action.goToLocations',
            arguments: [documentUri, nmLine.position!, locations, 'peek', 'No file results found']
        };

        super(range, command);
    }
}

type CodeLensItem = NmLineCodeLens | RefsCodeLens

export class CodeLensProvider implements vscode.CodeLensProvider<CodeLensItem> {
    constructor(private readonly nmStore: NmStore) {
        this.onDidChangeCodeLenses = this.nmStore.onFilesUpdated;
    }

    readonly onDidChangeCodeLenses: vscode.Event<void>;

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<CodeLensItem[]> {
        const codeLenses: CodeLensItem[] = [];
        const showRefs = vscode.workspace.getConfiguration('nmTool').get<boolean>('showRefs', true);

        for (const run of this.nmStore.runs) {
            for (const line of run.symbols) {
                if (!line.matchesFileName(document.fileName) || line.line === undefined)
                    continue;

                if (line.size !== undefined) {
                    codeLenses.push(new NmLineCodeLens(line, this.nmStore));
                }

                if (line.objdumpSymbol !== undefined && showRefs) {
                    const refs = run.refsFromOtherLabels(line.objdumpSymbol);
                    if (refs.length > 0) {
                        codeLenses.push(new RefsCodeLens(document.uri, line, this.nmStore, refs.map(r => r.from)));
                    }
                }
            }
        }

        return codeLenses;
    }


    resolveCodeLens?(codeLens: NmLineCodeLens, token: vscode.CancellationToken): vscode.ProviderResult<NmLineCodeLens> {
        return codeLens;
    }
}