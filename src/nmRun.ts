import * as vscode from 'vscode';
import * as child_process from 'node:child_process';
import { NmLine } from './nmLine';

export class NmRun {
    private readonly _lines: NmLine[] = [];

    public get lines(): NmLine[] {
        return this._lines;
    }

    constructor(public readonly file: vscode.Uri, public lastWritten: number = 0) {
        this._lines = [];
    }

    async update() {
        this.lines.length = 0;
        const command = `nm -lSC ${this.file.fsPath}`;

        let stderr = '';
        try
        {
            const exitCode = await new Promise((resolve, reject) => {
                const process = child_process.spawn('nm', ['-lSC', this.file.fsPath]);

                let stdout = '';
                const processStdOut = () => {
                    const lines = stdout.split('\n');
                    stdout = lines.pop() ?? '';
                    this._lines.push(...lines.filter((line) => line.length > 0).map((line) => new NmLine(line, this)));
                };

                process.stdout.on('data', (data) => {
                    if (data)
                    {
                        stdout += data;
                        processStdOut();
                    }
                });

                process.stderr.on('data', (data) => {
                    if (data)
                    {
                        stderr += data;
                    }
                });

                process.on('close', (code) => {
                    stdout = stdout.trim();
                    if (stdout != '')
                    {
                        this._lines.push(new NmLine(stdout, this));
                    }

                    resolve(code);
                });
                process.on('error', (err) => {
                    reject(err);
                });
            });
        
            if (exitCode != 0) {
                vscode.window.showErrorMessage(`Nm-tool: Command '${command}' exited with ${exitCode}. Output: ${stderr}`);
            }
        }
        catch(error)
        {
            console.dir(error);
            vscode.window.showErrorMessage(`Nm-tool: Could not run command '${command}'. Error: ${error}`);
        }
    }

    onDelete() {
        this.lines.length = 0;
    }
}