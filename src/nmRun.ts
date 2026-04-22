import * as vscode from 'vscode';
import * as child_process from 'node:child_process';
import { NmSymbol } from './nmSymbol';
import * as fs from 'fs';
import { ObjdumpSection } from './objdumpSection';
import { ObjdumpSymbol, ObjdumpLabelFlags, SymbolBindingFlag, SymbolConstructorFlag, SymbolDebugDynamicFlag, SymbolIndirectionFlag, SymbolKindFlag, SymbolStrengthFlag, SymbolWarningFlag } from './objdumpSymbol';
import { ObjdumpInstruction } from './objdumpInstruction';
import { KeyedSortedSet } from './KeyedSortedSet';

const CMakeCacheFileName = 'CMakeCache.txt';

async function findAllParantCMakeCacheFiles(file: vscode.Uri): Promise<vscode.Uri[]> {
    let fileDirectory = vscode.Uri.joinPath(file, '../').fsPath;
    fileDirectory = fileDirectory.substring(vscode.workspace.getWorkspaceFolder(file)?.uri.fsPath.length ?? 0);
    const search = '{' + constructRecursiveSearch(fileDirectory.split('/'), CMakeCacheFileName).join(',') + '}';
    return await vscode.workspace.findFiles(search, null);
}

function constructRecursiveSearch(directories: string[], fileName: string, isTop = true): string[] {
    directories = directories.filter(s => s.length > 0);
    let subDirectoriesRecursiveSearch: string[] = [];

    if (directories.length > 0) {
        const directory = directories.shift();
        subDirectoriesRecursiveSearch = constructRecursiveSearch(directories, fileName, false).map(s => `${directory}/${s}`);
    }

    if (!isTop) {
        subDirectoriesRecursiveSearch.push(fileName);
    }
    return subDirectoriesRecursiveSearch;
}

export interface ObjdumpRef {
    from: ObjdumpInstruction
    to: ObjdumpInstruction
}

export class NmRun {
    public readonly symbols = new KeyedSortedSet<number, NmSymbol>(l => l.address);

    public readonly sections = new KeyedSortedSet<number, ObjdumpSection>(l => l.address);
    public refs: ObjdumpRef[] = [];

    constructor(public readonly file: vscode.Uri, public lastWritten: number = 0) {
    }

    public nmTool: string = 'nm';
    public objdumpTool: string = 'objdump';

    refsFromOtherLabels(callsTo: ObjdumpSymbol): ObjdumpRef[] {
        return this.refs.filter(r => r.to.symbol === callsTo && r.from.symbol !== callsTo);
    }

    async update(outputChannel: vscode.OutputChannel) {
        this.symbols.clear();
        this.sections.clear();
        this.refs.length = 0;
        this.nmTool = 'nm';
        this.objdumpTool = 'objdump';

        outputChannel.appendLine('Update: ' + this.file.fsPath);

        await this.detectCMakeCache(outputChannel);

        const nmRunResult = await this.runNmTool(outputChannel);
        if (nmRunResult) {
            await this.runObjdumpTableTool(outputChannel);

            await this.runObjdumpTool(outputChannel);

            // Resolve objdump instruction references
            for (const section of this.sections) {
                for (const symbol of section.symbols) {
                    for (const instruction of symbol.instructions) {
                        const ref = instruction.tryGetRef();
                        if (ref) {
                            this.refs.push({
                                from: instruction,
                                to: ref
                            } as ObjdumpRef);
                        }
                    }
                }
            }

            // Resolve nmLine vs objdumpLabel references
            for (const line of this.symbols) {
                const symbol = this.sections.as_array().find(s => s.contains(line.address))?.symbols.get(line.address);
                if (symbol) {
                    line.objdumpSymbol = symbol;
                    symbol.nmSymbol = line;
                }
            }
        }
    }

    getFromAddress(address: number): ObjdumpInstruction | ObjdumpSymbol | ObjdumpSection | unknown {
        const section = this.sections.as_array().find(s => s.contains(address));
        const symbol = section?.symbolFromAddress(address);
        const instruction = symbol?.instructionFromAddress(address);
        return instruction ?? symbol ?? section;
    }

    private async detectCMakeCache(outputChannel: vscode.OutputChannel) {
        try {
            const cmakeCaches = await findAllParantCMakeCacheFiles(this.file);
            if (cmakeCaches.length > 0) {
                const mostMatchingUrl = cmakeCaches.reduce((p, c) => p.fsPath.length > c.fsPath.length ? p : c, cmakeCaches[0]);
                outputChannel.appendLine("Found CMakeCache.txt: " + mostMatchingUrl.fsPath);
                const mostMatchingTextDocument = await vscode.workspace.openTextDocument(mostMatchingUrl);
                const nmToolRegex = /CMAKE_NM:FILEPATH=(.*)/g;
                for (const nmToolMatch of mostMatchingTextDocument.getText().matchAll(nmToolRegex)) {
                    if (fs.existsSync(nmToolMatch[1])) {
                        this.nmTool = nmToolMatch[1];
                        outputChannel.appendLine("Found nm path: " + this.nmTool);
                        break;
                    }
                    else {
                        outputChannel.appendLine("Warning found nm path does not exists: " + nmToolMatch[1]);
                    }
                }

                const objdumpToolRegex = /CMAKE_OBJDUMP:FILEPATH=(.*)/g;
                for (const objdumpToolMatch of mostMatchingTextDocument.getText().matchAll(objdumpToolRegex)) {
                    if (fs.existsSync(objdumpToolMatch[1])) {
                        this.objdumpTool = objdumpToolMatch[1];
                        outputChannel.appendLine("Found objdump path: " + this.objdumpTool);
                        break;
                    }
                    else {
                        outputChannel.appendLine("Warning found objdump path does not exists: " + objdumpToolMatch[1]);
                    }
                }
            }
            else {
                outputChannel.appendLine("Did not found CMakeCache.txt");
            }
        }
        catch (err) {
            outputChannel.appendLine("Error during CMakeCache discovery");
            console.error("Error during CMakeCache discovery", err);
        }
    }

    private static async run(command: string, args: string[], processStdLine: (line: string) => void, onError: (command: string, error: any, exitCode?: number, stdErr?: string) => void): Promise<boolean> {
        let stderr = '';
        try {
            const exitCode = await new Promise<number>((resolve, reject) => {
                const process = child_process.spawn(command, args);

                let stdout = '';
                const processStdOut = () => {
                    const lines = stdout.split('\n');
                    stdout = lines.pop() ?? '';

                    for (const line of lines) {
                        processStdLine(line);
                    }
                };

                process.stdout.on('data', (data: string) => {
                    if (data) {
                        stdout += data;
                        processStdOut();
                    }
                });

                process.stderr.on('data', (data: string) => {
                    if (data) {
                        stderr += data;
                    }
                });

                process.on('close', (code: number) => {
                    stdout = stdout.trim();
                    if (stdout != '') {
                        processStdLine(stdout);
                    }

                    resolve(code);
                });
                process.on('error', (err: any) => {
                    reject(err);
                });
            });

            if (exitCode != 0) {
                onError([command, ...args].join(' '), undefined, exitCode, stderr);
                return false;
            }
            else {
                return true;
            }
        }
        catch (error) {
            onError([command, ...args].join(' '), error);
            return false;
        }
    }

    private async runNmTool(outputChannel: vscode.OutputChannel): Promise<boolean> {
        const args = ['-lSC', this.file.fsPath];

        const processLine = (line: string) => {
            if (line.length == 0)
                return;

            this.symbols.push(new NmSymbol(line, this), (newItem, oldItem) => (newItem.size ?? 0) >= (oldItem.size ?? 0) ? newItem : oldItem);
        };

        const onError = (command: string, error: any, exitCode?: number, stdErr?: string) => {
            if (exitCode) {
                outputChannel.appendLine(`Command '${command}' exited with ${exitCode}. Output: ${stdErr}`);
                vscode.window.showErrorMessage(`Nm-tool: Command '${command}' exited with ${exitCode}. Output: ${stdErr}`);
            }
            else {
                outputChannel.appendLine(`Error: Cloud not run command '${command}' Error: ${error}`);
                console.error(`Nm-tool: Could not run command '${command}'`, error);
                vscode.window.showErrorMessage(`Nm-tool: Could not run command '${command}'. Error: ${error}`);
            }
        };

        const result = await NmRun.run(this.nmTool, args, processLine, onError);
        if (result) {
            const command = [this.nmTool, ...args].join(' ');
            outputChannel.appendLine(`Command '${command}' resulted in ${this.symbols.length} lines`);
        }
        return result;
    }

    private async runObjdumpTableTool(outputChannel: vscode.OutputChannel): Promise<boolean> {
        const args = ['-htC', this.file.fsPath];

        enum Mode {
            None,
            Sections,
            SymbolTable,
        }

        let currentMode = Mode.None;

        const sectionRegex = /^\s*\d+\s+(\S+)\s+([0-9A-Fa-f]+)\s+([0-9A-Fa-f]+)/;
        let flagThisSection: ObjdumpSection | undefined = undefined;
        const processLineSections = (line: string) => {
            const sectionMatch = line.match(sectionRegex);
            if (sectionMatch) {
                const addressStr = sectionMatch[3];
                flagThisSection = new ObjdumpSection(this, sectionMatch[1], parseInt(addressStr, 16), parseInt(sectionMatch[2], 16));
                this.sections.push(flagThisSection, (newItem, oldItem) => {
                    if (oldItem.size === 0) {
                        outputChannel.appendLine(`Warning: Ignoring section ${oldItem.name} at ${addressStr}, without size in favour of ${newItem.name} with size ${newItem.size} at the same address`);
                        return newItem;
                    }
                    else {
                        outputChannel.appendLine(`Warning: Ignoring section ${newItem.name} at ${addressStr}, size ${newItem.size}. Has already ${oldItem.name} with size ${oldItem.size} at the same address`);
                        return oldItem;
                    }
                });
            } else if (flagThisSection) {
                flagThisSection.flags = line.split(',').map(s => s.trim());
                flagThisSection = undefined;
            } else if (line.startsWith("Idx")) {
                // Ignore
            } else {
                outputChannel.appendLine("Warning: Could not parse objdump section line: " + line);
            }
        };

        const symbolTableLabelRegex = /^([0-9A-Fa-f]+)\s([lgu! ][w ][C ][W ][Ii ][dD ][FfO ])\s([^\t]+)\t([0-9A-Fa-f]+)\s+(.*)$/;
        const processLineSymbolTable = (line: string) => {
            const symbolTableLabelMatch = line.match(symbolTableLabelRegex);
            if (symbolTableLabelMatch) {
                const flags = symbolTableLabelMatch[2];
                const flagsDecoded = new ObjdumpLabelFlags(
                    SymbolBindingFlag[flags[0] as keyof typeof SymbolBindingFlag],
                    SymbolStrengthFlag[flags[1] as keyof typeof SymbolStrengthFlag],
                    SymbolConstructorFlag[flags[2] as keyof typeof SymbolConstructorFlag],
                    SymbolWarningFlag[flags[3] as keyof typeof SymbolWarningFlag],
                    SymbolIndirectionFlag[flags[4] as keyof typeof SymbolIndirectionFlag],
                    SymbolDebugDynamicFlag[flags[5] as keyof typeof SymbolDebugDynamicFlag],
                    SymbolKindFlag[flags[6] as keyof typeof SymbolKindFlag],
                );
                if (flagsDecoded.debugDynamic === SymbolDebugDynamicFlag.Debugging || flagsDecoded.warning === SymbolWarningFlag.Warning) {
                    // skip debugging symbols
                    return;
                }
                const sectionName = symbolTableLabelMatch[3];
                if (sectionName === '*ABS*' || sectionName === '*UND*') {
                    // ignore absolute, undefined or debug sections
                    return;
                }

                const addressStr = symbolTableLabelMatch[1];
                const address = parseInt(addressStr, 16);
                const foundSectionByAddress = this.sections.as_array().find(s => s.contains(address) && s.name === sectionName);
                if (foundSectionByAddress) {
                    const size = parseInt(symbolTableLabelMatch[4], 16);
                    const name = symbolTableLabelMatch[5];
                    foundSectionByAddress.symbols.push(new ObjdumpSymbol(address, name, size, flagsDecoded, foundSectionByAddress), (newItem, oldItem) => {
                        outputChannel.appendLine(`Warning duplicate symbol ${addressStr}. 1: ${oldItem.name} in ${oldItem.section.name} size ${oldItem.size}, 2: ${newItem.name} in ${newItem.section.name} size ${newItem.size}`);
                        return newItem;
                    });
                }
                else {
                    outputChannel.appendLine(`Error: Could not find section from address ${addressStr} and name ${sectionName}`);
                }
            } else {
                outputChannel.appendLine("Warning: Could not parse objdump symbol table line: " + line);
            }
        };

        const processLine = (line: string) => {
            if (line === 'Sections:') {
                currentMode = Mode.Sections;
                return;
            }
            else if (line === 'SYMBOL TABLE:') {
                currentMode = Mode.SymbolTable;
                return;
            } else {
                if (line.match(/^\s*$/)) {
                    return;
                }
            }

            switch (currentMode) {
                case Mode.None:
                    return;
                case Mode.Sections:
                    processLineSections(line);
                    return;
                case Mode.SymbolTable:
                    processLineSymbolTable(line);
                    return;

            }
        };

        const onError = (command: string, error: any, exitCode?: number, stdErr?: string) => {
            if (exitCode) {
                outputChannel.appendLine(`Error: Command '${command}' exited with ${exitCode}. Output: ${stdErr}`);
            }
            else {
                outputChannel.appendLine(`Error: Cloud not run command '${command}' Error: ${error}`);
                console.error(`Nm-tool: Could not run command '${command}'`, error);
            }
        };

        const result = await NmRun.run(this.objdumpTool, args, processLine, onError);
        if (result) {
            const command = [this.objdumpTool, ...args].join(' ');
            outputChannel.appendLine(`Command '${command}' resulted in ${this.sections.length} sections`);
        }
        return result;
    }

    private async runObjdumpTool(outputChannel: vscode.OutputChannel): Promise<boolean> {
        const args = ['-dCl', this.file.fsPath];

        const sectionRegex = /^Disassembly of section ([^:]+):$/;
        const symbolRegex = /^([0-9A-Fa-f]+)(?:\s+<(.+)>)?:$/;
        const instructionRegex = /^\s*([0-9A-Fa-f]+):\s*((?:[0-9A-Fa-f][0-9A-Fa-f])+(?:\s(?:[0-9A-Fa-f][0-9A-Fa-f])+)*)\s+(.*)$/;
        const locationRegex = /^\/[^/].*$/;
        const discrimatorRegex = /\s+\(discriminator\s+(\d+)\)$/;

        let lastLocation: string | undefined = undefined;
        let lastSection: ObjdumpSection | undefined = undefined;
        let lastLabel: ObjdumpSymbol | undefined = undefined;

        const processLine = (line: string) => {
            if (line.length == 0)
                return;

            if (line.trim() === '...')
                return;

            const locationMatch = line.match(locationRegex);
            if (locationMatch) {
                const discriminatorMatch = line.match(discrimatorRegex);
                if (discriminatorMatch) {
                    lastLocation = line.substring(0, line.length - discriminatorMatch[0].length);
                }
                else {
                    lastLocation = line;
                }
                return;
            }

            const sectionMatch = line.match(sectionRegex);
            if (sectionMatch) {
                lastSection = this.sections.as_array().find(s => s.name === sectionMatch[1]);
                lastLocation = undefined;
                lastLabel = undefined;
                if (lastSection === undefined) {
                    outputChannel.appendLine(`Error: Could not find objdump section with name '${sectionMatch[1]}'`);
                }
                return;
            }

            if (lastSection) {
                const symbolMatch = line.match(symbolRegex);
                if (symbolMatch) {
                    lastLabel = lastSection.symbols.get(parseInt(symbolMatch[1], 16));
                    lastLocation = undefined;
                    if (lastLabel === undefined) {
                        outputChannel.appendLine(`Error: Could not find objdump symbol at address ${symbolMatch[1]} with name '${symbolMatch[2]}'`);
                    }
                    return;
                }

                if (lastLabel) {
                    const instructionMatch = line.match(instructionRegex);
                    if (instructionMatch) {
                        const addressStr = instructionMatch[1];
                        lastLabel.instructions.push(new ObjdumpInstruction(parseInt(addressStr, 16), instructionMatch[3], lastLocation, lastLabel), (newItem, oldItem) => {
                            outputChannel.appendLine(`Warning: dropped instruction at ${addressStr}: ${oldItem.assembly} because of duplicate address with ${newItem.assembly}`);
                            return newItem;
                        });
                        return;
                    }
                }
            }

            if (line.endsWith(':')) {
                //probally just function name
                return;
            }

            outputChannel.appendLine("Warning: Could not parse objdump line: " + line);
        };

        const onError = (command: string, error: any, exitCode?: number, stdErr?: string) => {
            if (exitCode) {
                outputChannel.appendLine(`Error: Command '${command}' exited with ${exitCode}. Output: ${stdErr}`);
            }
            else {
                outputChannel.appendLine(`Error: Cloud not run command '${command}' Error: ${error}`);
                console.error(`Nm-tool: Could not run command '${command}'`, error);
            }
        };

        const result = await NmRun.run(this.objdumpTool, args, processLine, onError);
        if (result) {
            const command = [this.objdumpTool, ...args].join(' ');
            const instructionsCount = this.sections.as_array().reduce((counter, section) => counter + section.symbols.as_array().reduce((counter, symbol) => counter + symbol.instructions.length, 0), 0);
            outputChannel.appendLine(`Command '${command}' resulted in ${instructionsCount} instructions`);
        }
        return result;
    }

    onDelete() {
        this.symbols.clear();
        this.sections.clear();
        this.refs.length = 0;
    }
}