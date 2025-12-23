import * as vscode from 'vscode';

const DEFAULT_TIMEOUT_MS = 1000;

export class AsyncOperationsStore
{
    private _timerRunning: boolean = false;
    private _timerId: NodeJS.Timeout | null = null;
    private _timerInvalidated: boolean = false;
    private readonly _store: Array<() => Promise<any>> = [];
    private _disposed: boolean = false;

    private readonly _onAllOperationsDone: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onAllOperationsDone: vscode.Event<void> = this._onAllOperationsDone.event;

    addOperation(operation: () => Promise<any>)
    {
        this._store.push(operation);
        if (this._timerRunning)
        {
            this._timerInvalidated = true;
        }
        else
        {
            this.startTimer();
        }
    }

    private startTimer()
    {
        if (!this._disposed)
        {
            this._timerRunning = true;
            this._timerInvalidated = false;
            this._timerId = setTimeout(() => this.onTimer(), DEFAULT_TIMEOUT_MS);
        }
    }

    private async onTimer()
    {
        this._timerId = null;

        while (this._store.length > 0 && !this._timerInvalidated && !this._disposed)
        {
            const operation = this._store.shift();
            if (operation)
            {
                await operation();
            }
        }

        if (this._store.length > 0) {
            this.startTimer();
        } 
        else
        {
            this._timerRunning = false;
            this._onAllOperationsDone.fire();
        }
    }

    dispose()
    {
        this._disposed = true;
        if (this._timerId)
        {
            clearTimeout(this._timerId);
        }
    }
}