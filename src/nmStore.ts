import * as vscode from 'vscode';
import { AsyncOperationsStore } from './asyncOperationsStore';
import { NmRun } from './nmRun';

export const search = '**/*.elf'

export class NmStore
{
    private readonly _asyncOperationsStore = new AsyncOperationsStore()
    private readonly _nmRuns = new Map<String, NmRun>()

    public get onFilesUpdated(): vscode.Event<void> { return this._asyncOperationsStore.onAllOperationsDone }
    public get runs(): NmRun[] { return Array.from(this._nmRuns.values()) }

    update() {
        this._asyncOperationsStore.addOperation(async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                cancellable: false,
                title: 'Running nm'
            }, async (progress) => {

                progress.report({ increment: 0 });
                for (const run of this.runs) {
                    run.onDelete()
                }

                let uris = await vscode.workspace.findFiles(search, null)
                await Promise.all(uris.map(async uri => {
                    let suFile = this._nmRuns.get(uri.fsPath) ?? new NmRun(uri)
                    this._nmRuns.set(uri.fsPath, suFile)

                    await suFile.update()
                }))
                console.log(`Found ${this._nmRuns.size} files matching ${search}`)

                progress.report({ increment: 100 });

                if (this._nmRuns.size == 0) {
                    vscode.window.showWarningMessage(`No files found matching ${search}`)
                }
            })
        })
    }

    onAddOrUpdate(uri: vscode.Uri) {
        this._asyncOperationsStore.addOperation(async () => {
            console.log(`On add or update ${uri.fsPath}`)
            let suFile = this._nmRuns.get(uri.fsPath) ?? new NmRun(uri)
            this._nmRuns.set(uri.fsPath, suFile)
            await suFile.update()
        })
    }

    onDelete(uri: vscode.Uri) {
        this._asyncOperationsStore.addOperation(async () => {
            console.log(`On delete ${uri.fsPath}`)
            let suFile = this._nmRuns.get(uri.fsPath)
            if (suFile) {
                suFile.onDelete()
            }
        })
    }

    dispose() {
        this._asyncOperationsStore.dispose()
        this._nmRuns.clear()
    }
}