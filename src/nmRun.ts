import * as vscode from 'vscode';
import * as util from 'util'
import * as child_process from 'child_process';
import { NmLine } from './nmLine';
const exec = util.promisify(child_process.exec);

export class NmRun {
    private readonly _lines: NmLine[] = []

    public get lines(): NmLine[] {
        return this._lines
    }

    constructor(public readonly file: vscode.Uri, public lastWritten: number = 0) {
        this._lines = []
    }

    async update() {
        this.lines.length = 0
        const command = `nm -lSC ${this.file.fsPath}`
        console.log('nm-tool: Will run ' + command)
        const promise = exec(command, { maxBuffer: 10 * 1024 * 1024 })
        const cp = promise.child
        const { stdout, stderr } = await promise
        if (cp.exitCode != 0) {
            console.error(`nm-tool: Command ${command} exited with ${cp.exitCode}.\nOutput: ${stderr}`)
            return
        }

        this._lines.push(...stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).map((line) => new NmLine(line, this)))
    }

    onDelete() {
        this.lines.length = 0
    }
}