import * as vscode from 'vscode';
import { CodeLensProvider } from './codeLensProvider';
import { NmStore } from './nmStore';
import { CurrentFileNmDataProvider, CurrentFileNmRunTreeItem } from './currentFileNmDataProvider';
import { GlobalNmDataProvider, GlobalNmRunTreeItem } from './globalNmDataProvider';
import { ObjdumpView } from './objdumpView';
import { NmRun } from './nmRun';
import { ObjdumpSection } from './objdumpSection';
import { ObjdumpSymbol } from './objdumpSymbol';
import { ObjdumpInstruction } from './objdumpInstruction';

export function decodeLocation(location: string): vscode.Location {
	const lineNumberRegex = /:\d+$/;
	let uri: vscode.Uri;
	let pos = new vscode.Position(0, 0);
	if (location.match(lineNumberRegex)) {
		uri = vscode.Uri.file(location.substring(0, location.lastIndexOf(':')));
		pos = new vscode.Position(parseInt(location.substring(location.lastIndexOf(':') + 1)) - 1, 0);
	}
	else {
		uri = vscode.Uri.file(location);
	}
	return new vscode.Location(uri, pos);
}


export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Nm tool');
	context.subscriptions.push(outputChannel);

	const nmStore = new NmStore(outputChannel);
	context.subscriptions.push(nmStore);

	const objDumpView = new ObjdumpView(nmStore, context.extensionUri);
	context.subscriptions.push(objDumpView);

	const codeLensProvider = new CodeLensProvider(nmStore);
	vscode.languages.registerCodeLensProvider({ language: 'cpp' }, codeLensProvider);
	vscode.languages.registerCodeLensProvider({ language: 'c' }, codeLensProvider);
	vscode.window.registerTreeDataProvider('nm-tool.global', new GlobalNmDataProvider(nmStore));
	vscode.window.registerTreeDataProvider('nm-tool.currentFile', new CurrentFileNmDataProvider(nmStore));

	context.subscriptions.push(
		vscode.commands.registerCommand('nm-tool.reload', () => {
			nmStore.update();
		}),
		vscode.commands.registerCommand('nm-tool.copyPath', (item: GlobalNmRunTreeItem | CurrentFileNmRunTreeItem) => {
			vscode.env.clipboard.writeText(item.nmRun.file.fsPath);
		}),
		vscode.commands.registerCommand('nm-tool.showObjdump', async (runPath?: string, addressOrSectionName?: number | string) => {
			if (!runPath) {
				if (nmStore.runs.length === 0) {
					return;
				} else if (nmStore.runs.length === 1) {
					runPath = nmStore.runs.at(0)!.file.fsPath;
				}
				else {
					runPath = await vscode.window.showQuickPick(nmStore.runs.as_array().map(r => r.file.fsPath), { title: "Select a file to show in objdump", canPickMany: false });
					if (!runPath) {
						return;
					}
				}
			}


			const run = nmStore.runs.get(runPath);

			if (run === undefined) {
				console.error("Could not find nmRun with path: " + runPath);
				return;
			}

			let showTarget: NmRun | ObjdumpSection | ObjdumpSymbol = run;
			let address: number | undefined;
			if (addressOrSectionName !== undefined) {
				if (typeof addressOrSectionName === 'number') {
					address = addressOrSectionName;
					const found = run.getFromAddress(address);
					if (found instanceof ObjdumpInstruction) {
						showTarget = found.symbol;
					}
					else if (found instanceof ObjdumpSymbol) {
						showTarget = found;
					}
					else if (found instanceof ObjdumpSection) {
						showTarget = found;
					}
					else {
						console.error(`Could not find something with address: ${address.toString(16)} in ${runPath}`);
						return;
					}
				}
				else if (typeof addressOrSectionName === 'string') {
					const sectionName = addressOrSectionName;
					const foundSection = run.sections.as_array().find(s => s.name === sectionName);
					if (foundSection) {
						showTarget = foundSection;
					}
					else {
						console.error(`Could not find section: ${sectionName} in ${runPath}`);
						return;
					}
				}
			}

			objDumpView.show();

			if (showTarget instanceof ObjdumpSymbol) {
				objDumpView.setSymbol(showTarget, address);
			}
			else if (showTarget instanceof ObjdumpSection) {
				objDumpView.setSection(showTarget);
			}
			else if (showTarget instanceof NmRun) {
				objDumpView.setBinary(showTarget);
			}
		}),
		vscode.commands.registerCommand('nm-tool.editorOpen', async (location: string, viewColumn?: vscode.ViewColumn) => {
			const decodedLocation = decodeLocation(location);
			await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(decodedLocation.uri), { selection: decodedLocation.range, preview: true, viewColumn: viewColumn });
		})
	);

	nmStore.update();
}
