// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CodeLensProvider } from './codeLensProvider';
import { search, NmStore } from './nmStore';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Extension "nm-tool" is now active!');

	const nmStore = new NmStore()
	context.subscriptions.push(nmStore);

	const watcher = vscode.workspace.createFileSystemWatcher(search);
	watcher.onDidCreate(uri => nmStore.onAddOrUpdate(uri))
	watcher.onDidChange(uri => nmStore.onAddOrUpdate(uri))
	watcher.onDidDelete(uri => nmStore.onDelete(uri))
	context.subscriptions.push(watcher);

	const codeLensProvider = new CodeLensProvider(nmStore)
	vscode.languages.registerCodeLensProvider({ language: 'cpp' }, codeLensProvider)
	vscode.languages.registerCodeLensProvider({ language: 'c' }, codeLensProvider)
	
	context.subscriptions.push(vscode.commands.registerCommand('nm-tool.updateNmStore', () => {
		nmStore.update()
	}));

	nmStore.update()
}
