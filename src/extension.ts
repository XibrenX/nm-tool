import * as vscode from 'vscode';
import { CodeLensProvider } from './codeLensProvider';
import { NmStore } from './nmStore';
import { CurrentFileNmDataProvider, CurrentFileNmRunTreeItem } from './currentFileNmDataProvider';
import { GlobalNmDataProvider, GlobalNmRunTreeItem } from './globalNmDataProvider';


export function activate(context: vscode.ExtensionContext) {

	const nmStore = new NmStore();
	context.subscriptions.push(nmStore);

	const codeLensProvider = new CodeLensProvider(nmStore);
	vscode.languages.registerCodeLensProvider({ language: 'cpp' }, codeLensProvider);
	vscode.languages.registerCodeLensProvider({ language: 'c' }, codeLensProvider);
	vscode.window.registerTreeDataProvider('nm-tool.globalNm', new GlobalNmDataProvider(nmStore));
	vscode.window.registerTreeDataProvider('nm-tool.currentFileNm', new CurrentFileNmDataProvider(nmStore));
	
	context.subscriptions.push(
		vscode.commands.registerCommand('nm-tool.updateNmStore', () => {
			nmStore.update();
		}), 
		vscode.commands.registerCommand('nm-tool.copyPath', (item: GlobalNmRunTreeItem | CurrentFileNmRunTreeItem) => {
			vscode.env.clipboard.writeText(item.nmRun.file.fsPath);
		})
	);

	nmStore.update();
}
