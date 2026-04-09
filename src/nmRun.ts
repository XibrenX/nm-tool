import * as vscode from 'vscode';
import * as child_process from 'node:child_process';
import { NmLine } from './nmLine';
import * as fs from 'fs';
import { ObjdumpSection } from './objdumpSection';
import { ObjdumpLabel } from './objdumpLabel';
import { ObjdumpInstruction } from './objdumpInstruction';

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
};

export class NmRun {
    private readonly _lines: NmLine[] = [];

    public get lines(): NmLine[] {
        return this._lines;
    }

    public sections: ObjdumpSection[] = [];
    public refs: ObjdumpRef[] = [];

    constructor(public readonly file: vscode.Uri, public lastWritten: number = 0) {
        this._lines = [];
    }

    public nmTool: string = 'nm';
    public objdumpTool: string = 'objdump';

    async update(outputChannel: vscode.OutputChannel) {
        this.lines.length = 0;
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
            this.refs.push(...this.sections.flatMap(s => s.labels).flatMap(i => i.instructions).map(i => {
                const ref = i.tryGetRef();
                if (ref) {
                    return {
                        from: i,
                        to: ref
                    } as ObjdumpRef;
                }
                else {
                    return undefined;
                }
            }).filter(i => i !== undefined));

            // Resolve nmLine vs objdumpLbael references
            for(const line of this._lines)
            {
                const label = this.sections.filter(s => s.contains(line.address)).flatMap(s => s.labels).filter(l => l.address === line.address).at(0);
                if (label)
                {
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
                    else
                    {
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
                    else
                    {
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

    private async runNmTool(outputChannel: vscode.OutputChannel): Promise<boolean> {
        const args = ['-lSC', this.file.fsPath];
        const command = [this.nmTool].concat(args).join(' ');

        const processLine = (line: string) => {
            if (line.length == 0)
                return;

            this._lines.push(new NmLine(line, this));
        };

        let stderr = '';
        try {
            const exitCode = await new Promise((resolve, reject) => {
                const process = child_process.spawn(this.nmTool, args);

                let stdout = '';
                const processStdOut = () => {
                    const lines = stdout.split('\n');
                    stdout = lines.pop() ?? '';

                    for (const line of lines) {
                        processLine(line);
                    }
                };

                process.stdout.on('data', (data) => {
                    if (data) {
                        stdout += data;
                        processStdOut();
                    }
                });

                process.stderr.on('data', (data) => {
                    if (data) {
                        stderr += data;
                    }
                });

                process.on('close', (code) => {
                    stdout = stdout.trim();
                    if (stdout != '') {
                        processLine(stdout);
                    }

                    resolve(code);
                });
                process.on('error', (err) => {
                    reject(err);
                });
            });

            if (exitCode != 0) {
                vscode.window.showErrorMessage(`Nm-tool: Command '${command}' exited with ${exitCode}. Output: ${stderr}`);
                return false;
            }
            else {
                outputChannel.appendLine(`Command '${command}' resulted in ${this._lines.length} lines`);
                return true;
            }
        }
        catch (error) {
            console.error(`Nm-tool: Could not run command '${command}'`, error);
            vscode.window.showErrorMessage(`Nm-tool: Could not run command '${command}'. Error: ${error}`);
            return false;
        }
    }

    private async runObjdumpTool(outputChannel: vscode.OutputChannel): Promise<boolean> {
        const args = ['-dCl', this.file.fsPath];
        const command = [this.objdumpTool].concat(args).join(' ');

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
                if (discriminatorMatch)
                {
                    lastLocation = line.substring(0, line.length - discriminatorMatch[0].length);
                }
                else
                {
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
                    lastSection.labels.push(new ObjdumpLabel(parseInt(labelMatch[1], 16), labelMatch.at(2) ?? '<no name>', lastSection));
                    lastLocation = undefined;
                    return;
                }

                const lastLabel = lastSection.labels[lastSection.labels.length - 1];
                if (lastLabel) {
                    const instructionMatch = line.match(instructionRegex);
                    if (instructionMatch) {
                        lastLabel.instructions.push(new ObjdumpInstruction(parseInt(instructionMatch[1], 16), instructionMatch[3], lastLocation, lastLabel));
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

        let stderr = '';
        try {
            const exitCode = await new Promise((resolve, reject) => {
                const process = child_process.spawn(this.objdumpTool, args);

                let stdout = '';
                const processStdOut = () => {
                    const lines = stdout.split('\n');
                    stdout = lines.pop() ?? '';

                    for (const line of lines) {
                        processLine(line);
                    }
                };

                process.stdout.on('data', (data) => {
                    if (data) {
                        stdout += data;
                        processStdOut();
                    }
                });

                process.stderr.on('data', (data) => {
                    if (data) {
                        stderr += data;
                    }
                });

                process.on('close', (code) => {
                    stdout = stdout.trim();
                    if (stdout != '') {
                        processLine(stdout);
                    }

                    resolve(code);
                });
                process.on('error', (err) => {
                    reject(err);
                });
            });

            if (exitCode != 0) {
                outputChannel.appendLine(`Error: Command '${command}' exited with ${exitCode}. Output: ${stderr}`);
                return false;
            }
            else {
                outputChannel.appendLine(`Command '${command}' resulted in ${this.sections.length} sections`);
                return true;
            }
        }
        catch (error) {
            console.dir(error);
            outputChannel.appendLine(`Error: Cloud not run command '${command}' Error: ${error}`);
            return false;
        }
    }

    onDelete() {
        this.lines.length = 0;
        this.sections.length = 0;
        this.refs.length = 0;
    }
}