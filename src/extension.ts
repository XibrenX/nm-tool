import * as vscode from 'vscode';
import { CodeLensProvider } from './codeLensProvider';
import { NmStore } from './nmStore';
import { CurrentFileNmDataProvider, CurrentFileNmRunTreeItem } from './currentFileNmDataProvider';
import { GlobalNmDataProvider, GlobalNmRunTreeItem } from './globalNmDataProvider';
import { ObjdumpView } from './objdumpView';


export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Nm tool');
	context.subscriptions.push(outputChannel);

	const nmStore = new NmStore(outputChannel);
	context.subscriptions.push(nmStore);

	const objDumpView = new ObjdumpView(nmStore);
	context.subscriptions.push(objDumpView);

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
		}),
		vscode.commands.registerCommand('nm-tool.viewObjDump', (runPath: string, address: number) => {
			objDumpView.show(runPath, address);
		}),
		vscode.commands.registerCommand('nm-tool.editorOpen', async(location: string, viewColumn?: vscode.ViewColumn) => {
			const lineNumberRegex = /:\d+$/;
			let uri: vscode.Uri;
			let pos = new vscode.Position(0, 0);
			if (location.match(lineNumberRegex))
			{
				uri = vscode.Uri.file(location.substring(0, location.lastIndexOf(':')));
				pos = new vscode.Position(parseInt(location.substring(location.lastIndexOf(':') + 1)) - 1, 0);
			}
			else
			{
				uri = vscode.Uri.file(location);
			}

			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true, viewColumn: viewColumn });
		})
	);

	nmStore.update();
}
