import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmLine } from './nmLine';
import { ObjdumpView } from './objdumpView';

export class NmLineCodeLens extends vscode.CodeLens
{
    constructor(public readonly nmLine: NmLine, nmStore: NmStore)
    {
        if (nmLine.line === undefined)
            throw new Error();

        const postion = new vscode.Position(nmLine.line - 1, 0);
        const range = new vscode.Range(postion, postion);

        let title =  `Nm: ${nmLine.type} ${nmLine.size}`;
        if (nmStore.runs.length > 1)
            title += ` in ${nmStore.getUniquePart(nmLine.run)}`;

        let name = nmLine.name;
        if (nmLine.objdumpLabel)
        {
            name += ` in ${nmLine.objdumpLabel.section.section}`;
        }
        const tooltip = `${name}\n\n${nmLine.run.file.fsPath}:${nmLine.address.toString(16)}`;

        const command: vscode.Command = {
            title: title, tooltip: tooltip, command: ''
        };

        if (nmLine.objdumpLabel)
        {
            const objDumpViewCommand = ObjdumpView.getObjdumpViewShowCommand(nmLine.objdumpLabel);
            command.command = objDumpViewCommand.command;
            command.arguments = objDumpViewCommand.arguments;
        }

        super(range, command);
    }
}


export class CodeLensProvider implements vscode.CodeLensProvider<NmLineCodeLens>
{
    constructor(private readonly nmStore: NmStore)
    {
        this.onDidChangeCodeLenses = this.nmStore.onFilesUpdated;
    }

    readonly onDidChangeCodeLenses: vscode.Event<void>;

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<NmLineCodeLens[]> {
        const lines = this.nmStore.runs.flatMap(r => r.lines).filter(l => l.matchesFileName(document.fileName)).filter(l => l.size !== undefined);

        const codeLenses: NmLineCodeLens[] = [];
        for (const line of lines)
        {
            if (line.line === undefined)
                continue;

            codeLenses.push(new NmLineCodeLens(line, this.nmStore));
        }

        return codeLenses;
    }


    resolveCodeLens?(codeLens: NmLineCodeLens, token: vscode.CancellationToken): vscode.ProviderResult<NmLineCodeLens> {
        return codeLens;
    }
}