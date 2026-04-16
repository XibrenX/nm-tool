import * as vscode from 'vscode';
import * as child_process from 'node:child_process';
import { NmLine } from './nmLine';
import * as fs from 'fs';
import { ObjdumpSection } from './objdumpSection';
import { ObjdumpLabel } from './objdumpLabel';
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
    public readonly lines = new KeyedSortedSet<number, NmLine>(l => l.address);

    public sections: ObjdumpSection[] = [];
    public refs: ObjdumpRef[] = [];

    constructor(public readonly file: vscode.Uri, public lastWritten: number = 0) {
    }

    public nmTool: string = 'nm';
    public objdumpTool: string = 'objdump';

    refsFromOtherLabels(callsTo: ObjdumpLabel): ObjdumpRef[]
    {
        return this.refs.filter(r => r.to.label === callsTo && r.from.label !== callsTo);
    }

    async update(outputChannel: vscode.OutputChannel) {
        this.lines.clear();
        this.sections.length = 0;
        this.refs.length = 0;
        this.nmTool = 'nm';
        this.objdumpTool = 'objdump';

        outputChannel.appendLine('Update: ' + this.file.fsPath);

        await this.detectCMakeCache(outputChannel);

        const nmRunResult = await this.runNmTool(outputChannel);
        if (nmRunResult) {
            await this.runObjdumpTool(outputChannel);

            // Resolve objdump instruction references
            for (const section of this.sections) {
                for (const label of section.labels) {
                    for (const instruction of label.instructions) {
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

            // Resolve nmLine vs objdumpLbael references
            for (const line of this.lines) {
                const label = this.sections.filter(s => s.contains(line.address)).flatMap(s => s.labels.get(line.address)).at(0);
                if (label) {
                    line.objdumpLabel = label;
                    label.nmLine = line;
                }
            }
        }
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

            this.lines.push(new NmLine(line, this), (newItem, oldItem) => (newItem.size ?? 0) >= (oldItem.size ?? 0) ? newItem : oldItem);
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
            outputChannel.appendLine(`Command '${command}' resulted in ${this.lines.length} lines`);
        }
        return result;
    }

    private async runObjdumpTool(outputChannel: vscode.OutputChannel): Promise<boolean> {
        const args = ['-dCl', this.file.fsPath];

        const sectionRegex = /^Disassembly of section ([^:]+):$/;
        const labelRegex = /^([0-9A-Fa-f]+)(?: <(.+)>)?:$/;
        const instructionRegex = /^\s*([0-9A-Fa-f]+):\s+((?:[0-9A-Fa-f][0-9A-Fa-f])+(?:\s(?:[0-9A-Fa-f][0-9A-Fa-f])+)*)\s+(.*)$/;
        const locationRegex = /^\/[^/].*$/;
        const discrimatorRegex = /\s+\(discriminator\s+(\d+)\)$/;

        let lastLocation: string | undefined = undefined;

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
                this.sections.push(new ObjdumpSection(sectionMatch[1], this));
                lastLocation = undefined;
                return;
            }
            const lastSection = this.sections[this.sections.length - 1];
            if (lastSection) {
                const labelMatch = line.match(labelRegex);
                if (labelMatch) {
                    lastSection.labels.push(new ObjdumpLabel(parseInt(labelMatch[1], 16), labelMatch.at(2) ?? '<no name>', lastSection), (newItem, oldItem) => newItem);
                    lastLocation = undefined;
                    return;
                }

                const lastLabel = lastSection.labels.last;
                if (lastLabel) {
                    const instructionMatch = line.match(instructionRegex);
                    if (instructionMatch) {
                        lastLabel.instructions.push(new ObjdumpInstruction(parseInt(instructionMatch[1], 16), instructionMatch[3], lastLocation, lastLabel), (newItem, oldItem) => newItem);
                        return;
                    }
                }
            }

            if (line.endsWith(':')) {
                //probally just function name
                return;
            }

            outputChannel.appendLine("Could not parse objdump line: " + line);
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

    onDelete() {
        this.lines.clear();
        this.sections.length = 0;
        this.refs.length = 0;
    }
}