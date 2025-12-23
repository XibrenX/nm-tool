import * as vscode from 'vscode';
import { AsyncOperationsStore } from './asyncOperationsStore';
import { NmRun } from './nmRun';
import path = require('path');

const DEFAULT_INPUT_FILES: string = '**/*.elf';

export class NmStore
{
    private readonly _asyncOperationsStore = new AsyncOperationsStore();
    private readonly _nmRuns = new Map<string, NmRun>();
    private _watcher: vscode.FileSystemWatcher;
    private readonly _changeConfigurationListener: vscode.Disposable;

    private _inputFiles: string;

    public get onFilesUpdated(): vscode.Event<void> { return this._asyncOperationsStore.onAllOperationsDone; }
    public get runs(): NmRun[] { return Array.from(this._nmRuns.values()); }

    constructor()
    {
        this._inputFiles = vscode.workspace.getConfiguration('nmTool').get<string>('inputFiles') ?? DEFAULT_INPUT_FILES;

        this._watcher = vscode.workspace.createFileSystemWatcher(this._inputFiles);
        this._watcher.onDidCreate(uri => this.onAddOrUpdate(uri));
        this._watcher.onDidChange(uri => this.onAddOrUpdate(uri));
        this._watcher.onDidDelete(uri => this.onDelete(uri));

        this._changeConfigurationListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('nmTool'))
            {
                this._inputFiles = vscode.workspace.getConfiguration('nmTool').get<string>('inputFiles') ?? DEFAULT_INPUT_FILES;

                this._watcher.dispose();
                this._watcher = vscode.workspace.createFileSystemWatcher(this._inputFiles);
                this._watcher.onDidCreate(uri => this.onAddOrUpdate(uri));
                this._watcher.onDidChange(uri => this.onAddOrUpdate(uri));
                this._watcher.onDidDelete(uri => this.onDelete(uri));

                this.update();
            }
        });
    }

    update() {
        this._asyncOperationsStore.addOperation(async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                cancellable: false,
                title: 'Running nm'
            }, async (progress) => {

                progress.report({ increment: 0 });
                for (const run of this.runs) {
                    run.onDelete();
                }
                this._nmRuns.clear();

                const uris = await vscode.workspace.findFiles(this._inputFiles, null);
                await Promise.all(uris.map(async uri => {
                    const suFile = this._nmRuns.get(uri.fsPath) ?? new NmRun(uri);
                    this._nmRuns.set(uri.fsPath, suFile);

                    await suFile.update();
                }));

                progress.report({ increment: 100 });

                if (this._nmRuns.size == 0) {
                    vscode.window.showWarningMessage(`Nm-tool: No files found matching ${this._inputFiles}. This pattern can be changed in the settings under #nmTool.inputFiles#`);
                }
            });
        });
    }

    onAddOrUpdate(uri: vscode.Uri) {
        this._asyncOperationsStore.addOperation(async () => {
            const suFile = this._nmRuns.get(uri.fsPath) ?? new NmRun(uri);
            this._nmRuns.set(uri.fsPath, suFile);
            await suFile.update();
        });
    }

    onDelete(uri: vscode.Uri) {
        this._asyncOperationsStore.addOperation(async () => {
            const suFile = this._nmRuns.get(uri.fsPath);
            if (suFile) {
                suFile.onDelete();
            }
            this._nmRuns.delete(uri.fsPath);
        });
    }

    dispose() {
        this._asyncOperationsStore.dispose();
        this._watcher.dispose();
        this._changeConfigurationListener.dispose();
        this._nmRuns.clear();
    }

    getUniquePart(nmRun: NmRun): string
    {
        const nmRunPath = nmRun.file.fsPath;
        const otherNmRunPaths: string[] = [];
        for (const otherNmRun of this._nmRuns.values())
        {
            const otherNmRunPath = otherNmRun.file.fsPath;
            if (otherNmRunPath != nmRunPath)
            {
                otherNmRunPaths.push(otherNmRunPath);
            }
        }

        let pathPartIndex = nmRunPath.lastIndexOf(path.sep);
        while (pathPartIndex >= 0)
        {          
            const pathPart = nmRunPath.substring(pathPartIndex + 1);
            if (!otherNmRunPaths.some((otherNmRunPath)=> otherNmRunPath.endsWith(pathPart)))
                return pathPart;
            pathPartIndex = nmRunPath.lastIndexOf(path.sep, pathPartIndex - 1);
        }
        return nmRunPath;
    }
}