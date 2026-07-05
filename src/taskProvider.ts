import * as vscode from 'vscode';
import { getConfig } from './config';
import { buildArgs, getOutputAmxPath } from './compiler';

export const PAWN_TASK_TYPE = 'pawn';

interface PawnTaskDefinition extends vscode.TaskDefinition {
  file: string;
  output?: string;
  includes?: string[];
  args?: string[];
}

/**
 * Provides "pawn" type build tasks so users can use
 * Run Build Task (Ctrl+Shift+B) and tasks.json.
 */
export class PawnTaskProvider implements vscode.TaskProvider {
  static taskType = PAWN_TASK_TYPE;

  async provideTasks(): Promise<vscode.Task[]> {
    const file = this.activePawnFile();
    if (!file) {
      return [];
    }
    const task = this.makeTask(file, `Compile ${basename(file)}`);
    return task ? [task] : [];
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const def = task.definition as PawnTaskDefinition;
    if (!def || !def.file) {
      return undefined;
    }
    return this.makeTask(def.file, task.name, task);
  }

  private makeTask(file: string, name: string, existing?: vscode.Task): vscode.Task | undefined {
    const config = getConfig();
    // Guard against an empty compiler path — otherwise ShellExecution('') is
    // built and `new Task(...)` throws "Illegal argument: command can't be
    // undefined or null", breaking Ctrl+Shift+B / Run Task entirely.
    if (!config.compilerPath || !config.compilerPath.trim()) {
      return undefined;
    }
    const args = buildArgs(file, config);
    const amxPath = getOutputAmxPath(file, config);

    const execution = new vscode.ShellExecution(config.compilerPath, args, {});
    const definition: PawnTaskDefinition = existing
      ? (existing.definition as PawnTaskDefinition)
      : { type: PAWN_TASK_TYPE, file };

    const task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      name,
      'pawn',
      execution,
      ['$pawncc']
    );
    task.detail = `pawncc -> ${amxPath}`;
    task.group = vscode.TaskGroup.Build;
    return task;
  }

  private activePawnFile(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor && /\.(p|inc|pwn)$/i.test(editor.document.fileName)) {
      return editor.document.fileName;
    }
    return undefined;
  }
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
