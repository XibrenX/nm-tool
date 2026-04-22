import * as vscode from 'vscode';
import { ObjdumpSymbol } from './objdumpSymbol';
import { ObjdumpInstruction } from './objdumpInstruction';
import { NmStore } from './nmStore';
import escapeHTML = require('escape-html');
import path = require('path');
import { ObjdumpSection } from './objdumpSection';
import { NmRun } from './nmRun';
import { decodeLocation } from './extension';

export class ObjdumpView implements vscode.Disposable {
    private view: vscode.WebviewPanel | null = null;

    constructor(private readonly nmStore: NmStore, private readonly extensionUri: vscode.Uri) { }

    show() {
        if (this.view == null) {
            this.view = vscode.window.createWebviewPanel('nmtool-objdumpview', 'Objdump', vscode.ViewColumn.Two, { enableCommandUris: ['nm-tool.viewObjDump', 'nm-tool.editorOpen'], enableScripts: true });
            this.view.onDidDispose(() => {
                this.view = null;
            });
        }
    }

    public static getObjdumpViewShowCommandFromAddress(file: vscode.Uri, address: number): vscode.Command {
        return {
            title: 'Show objdumpLabel',
            command: 'nm-tool.viewObjDump',
            arguments: [file.fsPath, address]
        };
    }

    public static getObjdumpViewShowCommandFromSection(file: vscode.Uri, section: string): vscode.Command {
        return {
            title: 'Show objdumpLabel',
            command: 'nm-tool.viewObjDump',
            arguments: [file.fsPath, section]
        };
    }

    setSymbol(symbol: ObjdumpSymbol, address: number | undefined) {
        this.view!.title = `Objdump ${symbol.addressStr}: ${escapeHTML(symbol.name)}`;

        const locationLink = this.parseLocation(symbol.location) ?? '';
        let info = `Defined in ${symbol.section.name}`;
        if (symbol.nmSymbol?.size) {
            const sectionRef = `<a href="${ObjdumpView.vscodeCommandToUri(ObjdumpView.getObjdumpViewShowCommandFromSection(symbol.section.nmRun.file, symbol.section.name))}" title="To ${escapeHTML(symbol.section.name)}">${escapeHTML(symbol.section.name)}</a>`;
            info = `Spans ${symbol.nmSymbol.size} bytes in ${sectionRef}`;
        }

        let referencesHtml: string = '';
        const references = symbol.section.nmRun.refsFromOtherLabels(symbol);
        if (references.length > 0) {
            referencesHtml = '<h2>Referenced from</h2>\n<p>';
            referencesHtml += references.map(r =>
                `<a href="${ObjdumpView.vscodeCommandToUri(ObjdumpView.getObjdumpViewShowCommandFromAddress(r.from.symbol.section.nmRun.file, r.from.address))}" title="To ${r.from.addressStr}">${r.from.addressStr}</a>`
                + ' in '
                + `<a href="${ObjdumpView.vscodeCommandToUri(ObjdumpView.getObjdumpViewShowCommandFromAddress(r.from.symbol.section.nmRun.file, r.from.symbol.address))}" title="To ${r.from.symbol.addressStr} ${escapeHTML(r.from.symbol.name)}">${r.from.symbol.addressStr} (${escapeHTML(ObjdumpView.truncateLargeString(r.from.symbol.name, 32))})</a>`
            ).join('<br />\n');
            referencesHtml += '</p>';
        }

        const instructionTable = symbol.instructions.as_array().map((i) => this.parseInstruction(i)).join('\n');

        this.view!.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.view!.title}</title>
    <link rel="stylesheet" href="${this.includeStyleCss()}">
    <script>
        const startAddress = ${address};

        function onLoad()
        {
            if (startAddress)
            {
                select(startAddress);
            }
        }

        function select(address)
        {
            for(const selectedElement of document.getElementsByClassName('selected'))
            {
                selectedElement.classList.remove('selected');
            }

            const targetElement = document.getElementById(address.toString(16));
            if (targetElement)
            {
                targetElement.classList.add('selected');
                targetElement.scrollIntoView({behavior: 'smooth', block: 'nearest'});
            }
        }

        document.addEventListener("DOMContentLoaded", onLoad);
    </script>
</head>
<body>
    <h1>${symbol.addressStr}: ${escapeHTML(symbol.name)}</h1>
    <p>${info}</p>
    <p>${locationLink}</p>
    ${referencesHtml}
    <h2>Disassembly</h2>
    <table class="disassembly">
        ${instructionTable}
    </table>
</body>
</html>`;
    }

    private parseInstruction(instruction: ObjdumpInstruction): string {
        const ref = instruction.tryGetRef();

        let assemblyArguments = instruction.assembly.substring(instruction.assemblyInstruction.length).trim();
        if (ref) {
            let refA: string;
            if (ref.symbol === instruction.symbol) {
                refA = `<a href="#${ref.addressStr}" onclick="select(0x${ref.addressStr}); return false;" title="To ${ref.addressStr}">${ref.addressStr}</a>`;
            }
            else {
                refA = `<a href="${ObjdumpView.vscodeCommandToUri(ObjdumpView.getObjdumpViewShowCommandFromAddress(ref.symbol.section.nmRun.file, ref.address))}" title="To ${ref.addressStr} ${escapeHTML(ref.symbol.name)}">${ref.addressStr} (${escapeHTML(ObjdumpView.truncateLargeString(ref.symbol.name, 32))})</a>`;
            }

            const assemblyArgumentsLower = assemblyArguments.toLowerCase();
            const refIndex = assemblyArgumentsLower.indexOf(ref.addressStr);
            if (refIndex >= 0) {
                let endIndex = refIndex + ref.addressStr.length;
                let index = endIndex;
                for (; index < assemblyArguments.length; index++) {
                    if (!assemblyArguments[index].match(/^\s$/))
                        break;
                }
                if (assemblyArguments[index] === '<') {
                    let bracheDepth = 1;
                    index += 1;
                    for (; index < assemblyArguments.length && bracheDepth > 0; index++) {
                        if (assemblyArguments[index] === '<') {
                            bracheDepth += 1;
                        }
                        else if (assemblyArguments[index] === '>') {
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
            <td class="sourcefile">${this.parseLocation(instruction.location) ?? ''}</td>
        </tr>`;
    }

    private parseLocation(location: string | undefined): string | undefined {
        if (location === undefined)
            return undefined;

        const isExtern = vscode.workspace.getWorkspaceFolder(decodeLocation(location).uri) === undefined;

        const clickText = location.substring(location.lastIndexOf(path.sep) + 1);

        const command = {
            title: 'Jump to code',
            command: 'nm-tool.editorOpen',
            arguments: [location, vscode.ViewColumn.One]
        } as vscode.Command;
        return `<a class="${isExtern ? 'extern' : ''}" href="${ObjdumpView.vscodeCommandToUri(command)}" title="${escapeHTML(location)}">${escapeHTML(clickText)}</a>`;
    }

    private static vscodeCommandToUri(command: vscode.Command): vscode.Uri {
        let uri = 'command:' + command.command;
        if (command.arguments) {
            if (command.arguments.length > 0) {
                uri += '?' + encodeURIComponent(JSON.stringify(command.arguments));
            }
        }
        return vscode.Uri.parse(uri);
    }

    private static truncateLargeString(input: string, maxLength: number) {
        if (input.length > maxLength) {
            return input.substring(0, maxLength - 3) + '...';
        }
        else {
            return input;
        }
    }

    setSection(section: ObjdumpSection) {
        this.view!.title = `Objdump ${escapeHTML(section.name)}`;

        const symbolTable = section.symbols.as_array().map(s => this.parseSymbol(s)).join('\n');

        this.view!.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.view!.title}</title>
    <link rel="stylesheet" href="${this.includeStyleCss()}">
    <script>
    </script>
</head>
<body>
    <h1>${escapeHTML(section.name)}</h1>
    <p>From ${section.address.toString(16)} to ${(section.address + section.size).toString(16)}, ${section.size} large.</p>

    <h2>Symbols</h2>
    <table class="symbols">
        <tr>
            <th>Start address</th>
            <th>Up to address</th>
            <th>Size</th>
            <th>Symbol name</th>
            <th>Source file</th>
        </tr>
        ${symbolTable}
    </table>
</body>
</html>`;
    }

    private parseSymbol(symbol: ObjdumpSymbol): string {
        const symbolRef = `<a href="${ObjdumpView.vscodeCommandToUri(ObjdumpView.getObjdumpViewShowCommandFromAddress(symbol.section.nmRun.file, symbol.address))}" title="To ${symbol.addressStr} ${escapeHTML(symbol.name)}">${escapeHTML(ObjdumpView.truncateLargeString(symbol.name, 64))}</a>`;

        return `<tr id="${symbol.addressStr}">
            <td class="address">${symbol.addressStr}</td>
            <td class="address">${(symbol.address + symbol.size).toString(16)}</td>
            <td class="address">${symbol.size}</td>
            <td>${symbolRef}</td>
            <td class="sourcefile">${this.parseLocation(symbol.location) ?? ''}</td>
        </tr>`;
    }

    setBinary(binary: NmRun) {
        // TODO
    }

    private includeStyleCss(): string {
        return this.view!.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'style.css')).toString();
    }

    dispose() {
        if (this.view) {
            this.view.dispose();
        }
    }
}