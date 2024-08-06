// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CodeLensProvider } from './codeLensProvider';
import { NmStore } from './nmStore';
import { CurrentFileNmDataProvider } from './currentFileNmDataProvider';
import { GlobalNmDataProvider } from './globalNmDataProvider';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Extension "nm-tool" is now active!');

	const nmStore = new NmStore()
	context.subscriptions.push(nmStore);

	const codeLensProvider = new CodeLensProvider(nmStore)
	vscode.languages.registerCodeLensProvider({ language: 'cpp' }, codeLensProvider)
	vscode.languages.registerCodeLensProvider({ language: 'c' }, codeLensProvider)
	vscode.window.registerTreeDataProvider('nm-tool.globalNm', new GlobalNmDataProvider(nmStore))
	vscode.window.registerTreeDataProvider('nm-tool.currentFileNm', new CurrentFileNmDataProvider(nmStore))
	
	context.subscriptions.push(vscode.commands.registerCommand('nm-tool.updateNmStore', () => {
		nmStore.update()
	}));

	nmStore.update()
}
