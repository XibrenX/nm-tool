import * as vscode from 'vscode';
import { NmStore } from './nmStore';
import { NmLine } from './nmLine';

export class CodeLensProvider implements vscode.CodeLensProvider
{
    constructor(private nmStore: NmStore)
    {
    }

    readonly onDidChangeCodeLenses = this.nmStore.onFilesUpdated

    private getTitle(line: NmLine): string{
        return `Nm: ${line.type} ${line.size}`
    }

    private getTooltip(line: NmLine): string{
        return `${line.name} at ${line.run.file.fsPath}:${line.inputPosition.toString(16)}`
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        let lines = this.nmStore.runs.flatMap(r => r.lines).filter(l => l.matchesFileName(document.fileName))

        let codeLenses = []
        for (const line of lines)
        {
            if (line.line === undefined)
                continue

            const postion = new vscode.Position(line.line - 1, 0)
            const range = new vscode.Range(postion, postion)
            codeLenses.push(new vscode.CodeLens(range, { title: this.getTitle(line), tooltip: this.getTooltip(line), command: ''}))
        }

        console.log(`Nm-tool: Created ${codeLenses.length} for ${lines.length} lines for ${document.fileName}`)

        return codeLenses
    }
    resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
        return codeLens
    }
}