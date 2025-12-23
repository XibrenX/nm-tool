import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmLine } from './nmLine';

export class CodeLensProvider implements vscode.CodeLensProvider
{
    constructor(private readonly nmStore: NmStore)
    {
    }

    readonly onDidChangeCodeLenses = this.nmStore.onFilesUpdated;

    private getTitle(line: NmLine): string{
        let title =  `Nm: ${line.type} ${line.size}`;
        if (this.nmStore.runs.length > 1)
            title += ` in ${this.nmStore.getUniquePart(line.run)}`;
        return title;
    }

    private getTooltip(line: NmLine): string{
        return `${line.name}\n\n${line.run.file.fsPath}:${line.inputPosition.toString(16)}`;
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        const lines = this.nmStore.runs.flatMap(r => r.lines).filter(l => l.matchesFileName(document.fileName)).filter(l => l.size !== undefined);

        const codeLenses: vscode.CodeLens[] = [];
        for (const line of lines)
        {
            if (line.line === undefined)
                continue;

            const postion = new vscode.Position(line.line - 1, 0);
            const range = new vscode.Range(postion, postion);
            codeLenses.push(new vscode.CodeLens(range, { title: this.getTitle(line), tooltip: this.getTooltip(line), command: ''}));
        }

        return codeLenses;
    }
    resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
        return codeLens;
    }
}