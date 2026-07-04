import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig } from './config';
import { listAvailablePlatforms } from './config';
import { runCompiler, CompileResult, ParsedProblem } from './compiler';
import { PawnTaskProvider, PAWN_TASK_TYPE } from './taskProvider';

let outputChannel: vscode.OutputChannel;
let diagnostics: vscode.DiagnosticCollection;
let statusItem: vscode.StatusBarItem;
let platformItem: vscode.StatusBarItem;
let compiling = false;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Pawn Compiler');
  diagnostics = vscode.languages.createDiagnosticCollection('pawn');

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusItem.command = 'pawn.showOutput';
  statusItem.tooltip = 'Pawn compiler — click to show output';
  setStatusIdle();

  platformItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 51);
  platformItem.command = 'pawn.selectPlatform';
  refreshPlatformStatusBar();

  context.subscriptions.push(outputChannel, diagnostics, statusItem, platformItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('pawn.compile', (uri?: vscode.Uri) =>
      compileCommand(uri)
    ),
    vscode.commands.registerCommand('pawn.clean', () => {
      diagnostics.clear();
      setStatusIdle();
      outputChannel.clear();
    }),
    vscode.commands.registerCommand('pawn.showOutput', () => outputChannel.show(true)),
    vscode.commands.registerCommand('pawn.selectPlatform', () => selectPlatform()),

    vscode.tasks.registerTaskProvider(PAWN_TASK_TYPE, new PawnTaskProvider()),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (getConfig().compileOnSave && /\.(p|inc|pwn)$/i.test(doc.fileName)) {
        compileFile(doc.fileName, { revealOnErrors: false, showInfo: false });
      }
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const cfg = getConfig();
      const isPawn = !!editor && /\.(p|inc|pwn)$/i.test(editor.document.fileName);
      if (!cfg.showStatusBar) {
        statusItem.hide();
        platformItem.hide();
        return;
      }
      if (isPawn) {
        statusItem.show();
        platformItem.show();
      } else {
        statusItem.hide();
        platformItem.hide();
      }
    })
  );

  // Show the status bar immediately if a Pawn file is open.
  const active = vscode.window.activeTextEditor;
  if (active && /\.(p|inc|pwn)$/i.test(active.document.fileName) && getConfig().showStatusBar) {
    statusItem.show();
    platformItem.show();
  }
}

export function deactivate(): void {
  /* disposed via subscriptions */
}

/** If the given file is open in an editor and dirty, save it before compiling. */
async function saveIfOpenAndDirty(filePath: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const docs = vscode.workspace.textDocuments.filter(
    (d) => d.uri.fsPath === uri.fsPath
  );
  for (const doc of docs) {
    if (doc.isDirty) {
      await doc.save();
    }
  }
}

async function compileCommand(uri?: vscode.Uri): Promise<void> {
  let filePath: string | undefined;

  if (uri && uri.fsPath) {
    filePath = uri.fsPath;
    await saveIfOpenAndDirty(uri.fsPath);
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Open a Pawn (.p) file to compile.');
      return;
    }
    if (editor.document.isDirty) {
      await editor.document.save();
    }
    filePath = editor.document.fileName;
  }

  if (!filePath) {
    return;
  }
  if (!/\.(p|inc|pwn)$/i.test(filePath)) {
    vscode.window.showWarningMessage('Not a Pawn source file (.p/.inc/.pwn).');
    return;
  }

  await compileFile(filePath, { revealOnErrors: true, showInfo: true });
}

interface CompileOptions {
  revealOnErrors: boolean;
  showInfo: boolean;
}

async function compileFile(
  filePath: string,
  opts: CompileOptions
): Promise<CompileResult | undefined> {
  if (compiling) {
    if (opts.showInfo) {
      vscode.window.showInformationMessage('Pawn compile already in progress.');
    }
    return undefined;
  }

  const config = getConfig();
  if (!config.compilerPath) {
    vscode.window.showErrorMessage(
      'Pawn compiler path is not set. Configure "pawn.compilerPath" in Settings.'
    );
    return undefined;
  }

  compiling = true;
  setStatusCompiling();

  if (config.clearBeforeCompile) {
    diagnostics.clear();
  }

  outputChannel.appendLine('');
  outputChannel.appendLine(
    `${new Date().toLocaleTimeString()}  Compiling ${path.basename(filePath)}` +
      (config.platformVersion ? `  [platform: ${config.platformVersion}]` : '')
  );
  outputChannel.appendLine(`> ${path.basename(config.compilerPath)} ${relArgs(filePath, config)}`);
  outputChannel.appendLine('');

  const result = await runCompiler(config.compilerPath, filePath, config);

  applyDiagnostics(result.problems);

  const errs = result.problems.filter((p) => p.severity === 'error').length;
  const warns = result.problems.filter((p) => p.severity === 'warning').length;

  outputChannel.appendLine(result.output.trimEnd());
  outputChannel.appendLine('');

  if (result.success) {
    outputChannel.appendLine(
      `✔ Compiled in ${result.durationMs} ms → ${result.outAmxPath}  (${warns} warning${warns === 1 ? '' : 's'})`
    );
  } else {
    outputChannel.appendLine(
      `✘ Failed (${errs} error${errs === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'})` +
        (result.errorMessage ? ` — ${result.errorMessage}` : '')
    );
  }

  setStatusResult(result.success, errs, warns);

  if (opts.showInfo) {
    if (result.success) {
      vscode.window.setStatusBarMessage(
        `Pawn: compiled ${path.basename(filePath)} (${warns} warning${warns === 1 ? '' : 's'})`,
        4000
      );
    } else {
      vscode.window.showErrorMessage(
        `Pawn compile failed: ${errs} error${errs === 1 ? '' : 's'}, ${warns} warning${
          warns === 1 ? '' : 's'
        }`
      );
    }
  }

  if (!result.success && opts.revealOnErrors) {
    outputChannel.show(true);
  }

  compiling = false;
  return result;
}

function applyDiagnostics(problems: ParsedProblem[]): void {
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const p of problems) {
    const uri = vscode.Uri.file(p.file);
    let arr = byFile.get(uri.fsPath);
    if (!arr) {
      arr = [];
      byFile.set(uri.fsPath, arr);
    }
    const startLine = Math.max(0, p.line - 1);
    const endLine = Math.max(startLine, p.endLine - 1);
    const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
    const diag = new vscode.Diagnostic(
      range,
      (p.code ? `[${p.code}] ` : '') + p.message,
      p.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error
    );
    diag.source = 'pawncc';
    if (p.code) {
      diag.code = p.code;
    }
    arr.push(diag);
  }
  for (const [fsPath, arr] of byFile) {
    diagnostics.set(vscode.Uri.file(fsPath), arr);
  }
}

function relArgs(filePath: string, config: ReturnType<typeof getConfig>): string {
  // Shortened, readable version of the args for the output header.
  const incFlags: string[] = [];
  if (config.addSourceDirToIncludes) {
    incFlags.push('-i…');
  }
  if (config.platformVersion) {
    incFlags.push(`-i${config.platformVersion}`);
  }
  const args = [
    ...config.extraArgs,
    '-o' + stripDir(getOutputAmx(filePath)),
    path.basename(filePath),
    ...incFlags,
    ...config.includePaths.map((i) => '-i' + path.basename(i.replace(/[\\/]+$/, ''))),
  ];
  return args.join(' ');
}

function getOutputAmx(filePath: string): string {
  const config = getConfig();
  const dir = config.outputDirectory.trim() ? config.outputDirectory : path.dirname(filePath);
  return path.join(dir, path.basename(filePath, path.extname(filePath)) + '.amx');
}

function stripDir(p: string): string {
  return path.basename(p);
}

/** Quick-pick to choose the target platform/version (302/303/304/31X). */
async function selectPlatform(): Promise<void> {
  const config = getConfig();
  const detected = listAvailablePlatforms(config);
  const current = (config.platformVersion || '').trim();

  // Build the pick list from detected subfolders; fall back to enum defaults.
  const candidates =
    detected.length > 0
      ? detected
      : ['302', '303', '304', '31X'];

  const items: (vscode.QuickPickItem & { value: string })[] = [];
  // "None" option to disable platform injection.
  items.push({
    label: '$(circle-slash) None (no platform subdir)',
    value: '',
    description: current === '' ? 'current' : undefined,
  });
  for (const p of candidates) {
    const exists = detected.length > 0; // already verified on disk
    items.push({
      label: p,
      value: p,
      description: p === current ? 'current' : undefined,
      detail: exists ? path.join(config.platformIncludeBaseDir, p) : undefined,
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Select Pawn platform / version (current: ${current || 'none'})`,
    title: 'Pawn: Select Platform',
  });
  if (!pick) {
    return;
  }

  const target = vscode.ConfigurationTarget.Workspace;
  await vscode.workspace
    .getConfiguration('pawn')
    .update('platformVersion', pick.value, target);

  refreshPlatformStatusBar();
  vscode.window.setStatusBarMessage(
    pick.value ? `Pawn platform set to ${pick.value}` : 'Pawn platform: none',
    3000
  );
}

/** Update the platform status bar item text and visibility. */
function refreshPlatformStatusBar(): void {
  const config = getConfig();
  const ver = (config.platformVersion || '').trim();
  if (ver) {
    platformItem.text = `$(layers) Pawn: ${ver}`;
    platformItem.tooltip = `Pawn platform/version: ${ver}\nClick to change.\nDir: ${path.join(
      config.platformIncludeBaseDir,
      ver
    )}`;
  } else {
    platformItem.text = '$(layers) Pawn: no platform';
    platformItem.tooltip = 'No platform subdir injected. Click to select.';
  }
  const active = vscode.window.activeTextEditor;
  const isPawn = !!active && /\.(p|inc|pwn)$/i.test(active.document.fileName);
  if (config.showStatusBar && isPawn) {
    platformItem.show();
  } else {
    platformItem.hide();
  }
}

function setStatusIdle(): void {
  if (!getConfig().showStatusBar) {
    statusItem.hide();
    return;
  }
  statusItem.text = '$(symbol-misc) Pawn: ready';
  statusItem.backgroundColor = undefined;
  statusItem.show();
}

function setStatusCompiling(): void {
  statusItem.text = '$(loading~spin) Pawn: compiling…';
  statusItem.backgroundColor = undefined;
  statusItem.show();
}

function setStatusResult(success: boolean, errors: number, warnings: number): void {
  if (!getConfig().showStatusBar) {
    statusItem.hide();
    return;
  }
  if (success) {
    statusItem.text = `$(check) Pawn: OK${warnings ? ` (${warnings}⚠)` : ''}`;
    statusItem.backgroundColor = undefined;
  } else {
    statusItem.text = `$(error) Pawn: ${errors} err${errors === 1 ? '' : 's'}, ${warnings} warn`;
    statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
  statusItem.show();
}
