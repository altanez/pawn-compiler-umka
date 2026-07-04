import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface PawnConfig {
  compilerPath: string;
  includePaths: string[];
  addSourceDirToIncludes: boolean;
  extraArgs: string[];
  outputDirectory: string;
  compileOnSave: boolean;
  showStatusBar: boolean;
  clearBeforeCompile: boolean;
  quotePaths: boolean;
  /** Selected platform/version subdir under platformIncludeBaseDir, e.g. "304", "31X". "" = not injected. */
  platformVersion: string;
  /** Base include directory that holds the platform subfolders (302/303/304/31X). */
  platformIncludeBaseDir: string;
}

export function getConfig(): PawnConfig {
  const cfg = vscode.workspace.getConfiguration('pawn');
  return {
    compilerPath: cfg.get<string>('compilerPath', ''),
    includePaths: cfg.get<string[]>('includePaths', []),
    addSourceDirToIncludes: cfg.get<boolean>('addSourceDirToIncludes', true),
    extraArgs: cfg.get<string[]>('extraArgs', []),
    outputDirectory: cfg.get<string>('outputDirectory', ''),
    compileOnSave: cfg.get<boolean>('compileOnSave', false),
    showStatusBar: cfg.get<boolean>('showStatusBar', true),
    clearBeforeCompile: cfg.get<boolean>('clearBeforeCompile', true),
    quotePaths: cfg.get<boolean>('quotePaths', false),
    platformVersion: cfg.get<string>('platformVersion', '304'),
    platformIncludeBaseDir: cfg.get<string>(
      'platformIncludeBaseDir',
      'C:\\Program Files (x86)\\UMKa3XX\\pawn\\include\\'
    ),
  };
}

/**
 * Return the absolute path to the selected platform's include directory,
 * e.g. "C:\...\include\304\". Returns "" if platformVersion is empty or the
 * subdir does not exist on disk.
 */
export function getPlatformIncludeDir(config: PawnConfig): string {
  const ver = (config.platformVersion || '').trim();
  if (!ver) {
    return '';
  }
  const base = (config.platformIncludeBaseDir || '').trim();
  if (!base) {
    return '';
  }
  const dir = path.join(base, ver);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * Scan the platform include base directory and return the list of available
 * platform subfolders (e.g. ["302","303","304","31X"]). Returns [] on error.
 */
export function listAvailablePlatforms(config: PawnConfig): string[] {
  const base = (config.platformIncludeBaseDir || '').trim();
  if (!base) {
    return [];
  }
  try {
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/** Resolve a possibly-relative include/output path against the workspace. */
export function resolveMaybeWorkspace(p: string): string {
  const trimmed = p.trim();
  if (!trimmed) {
    return '';
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')) {
    return trimmed;
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return require('path').join(folders[0].uri.fsPath, trimmed);
  }
  return trimmed;
}
