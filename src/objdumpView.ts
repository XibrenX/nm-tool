import * as vscode from 'vscode';
import { ObjdumpLabel } from './objdumpLabel';
import { ObjdumpInstruction } from './objdumpInstruction';
import { NmStore } from './nmStore';
import escapeHTML = require('escape-html');
import path = require('path');

export class ObjdumpView implements vscode.Disposable
{
    private view: vscode.WebviewPanel | null = null;

    constructor(private readonly nmStore: NmStore)
    {}

    show(runPath: string, address: number) {
        const label = this.nmStore.runs
            .find(r => r.file.fsPath == runPath)?.sections
            .filter(s => s.contains(address))
            .flatMap(s => s.labels)
            .find(l => l.contains(address));
        if (label === undefined)
        {
            console.error(`Could not find objdumpLabel in ${runPath} at address ${address.toString(16)}`);
            return;
        }

        if (this.view == null)
        {
            this.view = vscode.window.createWebviewPanel('nmtool-objdumpview', 'Objdump', vscode.ViewColumn.Two, {enableCommandUris: ['nm-tool.viewObjDump', 'nm-tool.editorOpen']});
            this.view.onDidDispose(() => {
                this.view = null;
            });
        }

        this.set(label);
    }

    public static getObjdumpViewShowCommand(objdumpLabel: ObjdumpLabel): vscode.Command
    {
        return {
            title: 'Show objdumpLabel',
            command: 'nm-tool.viewObjDump',
            arguments: [objdumpLabel.section.nmRun.file.fsPath, objdumpLabel.address]
        };
    }

    private set(label: ObjdumpLabel)
    {
        const instructionTable = label.instructions.map((i) => this.parseInstruction(i)).join('\n');
        const locationLink = this.parseLocation(label.location) ?? '';
        let info = `Defined in ${label.section.section}`;
        if (label.nmLine?.size)
        {
            info = `Spans ${label.nmLine.size} bytes in ${label.section.section}`;
        }

        this.view!.title = `Objdump ${label.addressStr}: ${escapeHTML(label.name)}`;

        this.view!.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.view!.title}</title>
    <style>
        .disassembly
        {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            width: 100%;
            white-space: nowrap;
        }
        .address
        {
            color: var(--vscode-editorLineNumber-foreground);
            text-align: right;
            padding-right: 2em;
        }
        tr:hover > .address
        {
            color: var(--vscode-editorLineNumber-activeForeground);
        }
        .comment
        {
            white-space: normal;
            padding-left: 2em;
        }
        tr:target
        {
            background: var(--vscode-editor-selectionHighlightBackground);
        }
    </style>
</head>
<body>
    <h1>${label.addressStr}: ${escapeHTML(label.name)}</h1>
    <p>${info}</p>
    <p>${locationLink}</p>
    <h2>Disassembly</h2>
    <table class="disassembly">
        ${instructionTable}
    </table>
</body>
</html>`;
    }

    private parseInstruction(instruction: ObjdumpInstruction): string
    {
        const ref = instruction.tryGetRef();

        let assemblyArguments = instruction.assembly.substring(instruction.assemblyInstruction.length).trim();
        if (ref)
        {
            let refA: string;
            if (ref.label === instruction.label)
            {
                refA = `<a href="#${ref.addressStr}" title="To ${ref.addressStr}">${ref.addressStr}</a>`;
            }
            else
            {
                refA = `<a href="${ObjdumpView.vscodeCommandToUri(ObjdumpView.getObjdumpViewShowCommand(ref.label))}" title="To ${ref.addressStr} ${escapeHTML(ref.label.name)}">${ref.addressStr} (${escapeHTML(ObjdumpView.truncateLargeString(ref.label.name, 32))})</a>`;
            }

            const assemblyArgumentsLower = assemblyArguments.toLowerCase();
            const refIndex = assemblyArgumentsLower.indexOf(ref.addressStr);
            if (refIndex >= 0)
            {
                let endIndex = refIndex + ref.addressStr.length;
                let index = endIndex;
                for(;index < assemblyArguments.length; index++)
                {
                    if (!assemblyArguments[index].match(/^\s$/))
                        break;
                }
                if (assemblyArguments[index] === '<')
                {
                    let bracheDepth = 1;
                    index += 1;
                    for(; index < assemblyArguments.length && bracheDepth > 0; index++)
                    {
                        if (assemblyArguments[index] === '<')
                        {
                            bracheDepth += 1;
                        }
                        else if (assemblyArguments[index] === '>')
                        {
                            bracheDepth -= 1;
                        }
                    }
                    endIndex = index;
                }

                assemblyArguments = assemblyArguments.substring(0, refIndex) + refA + assemblyArguments.substring(endIndex);
            }
        }

        return `<tr id="${instruction.addressStr}">
            <td class="address">${instruction.addressStr}</td>
            <td>${escapeHTML(instruction.assemblyInstruction)}</td>
            <td>${assemblyArguments}</td>
            <td class="comment">${this.parseLocation(instruction.location)}</td>
        </tr>`;
    }

    private parseLocation(location: string | undefined): string | undefined
    {
        if (location === undefined)
            return undefined;

        const clickText = location.substring(location.lastIndexOf(path.sep) + 1);

        const command = {
            title: 'Jump to code',
            command: 'nm-tool.editorOpen',
            arguments: [location, vscode.ViewColumn.One]
        } as vscode.Command;
        return `<a href="${ObjdumpView.vscodeCommandToUri(command)}" title="${escapeHTML(location)}">${escapeHTML(clickText)}</a>`;
    }

    private static vscodeCommandToUri(command: vscode.Command): vscode.Uri
    {
        let uri = 'command:' + command.command;
        if (command.arguments)
        {
            if (command.arguments.length > 0)
            {
                uri += '?' + encodeURIComponent(JSON.stringify(command.arguments));
            }
        }    
        return vscode.Uri.parse(uri);
    }

    private static truncateLargeString(input: string, maxLength: number)
    {
        if (input.length > maxLength)
        {
            return input.substring(0, maxLength - 3) + '...';
        }
        else
        {
            return input;
        }
    }

    dispose() {
        if (this.view)
        {
            this.view.dispose();
        }
    }
}