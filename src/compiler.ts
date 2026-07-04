import { spawn } from 'child_process';
import * as path from 'path';
import { PawnConfig, resolveMaybeWorkspace, getPlatformIncludeDir } from './config';

export interface ParsedProblem {
  file: string;
  line: number;
  endLine: number;
  severity: 'error' | 'warning';
  code?: string;
  message: string;
}

export interface CompileResult {
  success: boolean;
  exitCode: number | null;
  output: string;
  problems: ParsedProblem[];
  args: string[];
  commandLine: string;
  outAmxPath: string;
  durationMs: number;
  errorMessage?: string;
}

const LINE_RE = /^(.+?)\((\d+)(?:-(\d+))?\)\s*:\s*(fatal error|error|warning)\s*(\d+)?\s*:\s*(.*)$/;

/** Parse pawncc text output into structured problems. */
export function parseCompilerOutput(output: string): ParsedProblem[] {
  const problems: ParsedProblem[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = raw.match(LINE_RE);
    if (!m) {
      continue;
    }
    const [, file, lineStr, endLineStr, sev, code, message] = m;
    const line = parseInt(lineStr, 10);
    problems.push({
      file: file.trim(),
      line,
      endLine: endLineStr ? parseInt(endLineStr, 10) : line,
      severity: sev === 'warning' ? 'warning' : 'error',
      code: code || undefined,
      message: message.trim(),
    });
  }
  return problems;
}

/** Compute the output .amx path for a given source file. */
export function getOutputAmxPath(sourcePath: string, config: PawnConfig): string {
  const dir = resolveMaybeWorkspace(config.outputDirectory) || path.dirname(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(dir, base + '.amx');
}

/** Build the argument list for pawncc, matching the original working command. */
export function buildArgs(sourcePath: string, config: PawnConfig): string[] {
  const args: string[] = [];

  for (const a of config.extraArgs) {
    if (a && a.trim()) {
      args.push(a);
    }
  }

  const outAmx = getOutputAmxPath(sourcePath, config);
  args.push('-o' + outAmx);
  args.push(sourcePath);

  const includes: string[] = [];
  if (config.addSourceDirToIncludes) {
    includes.push(path.dirname(sourcePath));
  }
  // Platform-specific include dir (e.g. ...\include\304\), injected right after
  // the source dir and before the user include paths — matches the original
  // working command order: -i<src> -i<304> -i<include>.
  const platformDir = getPlatformIncludeDir(config);
  if (platformDir) {
    includes.push(platformDir);
  }
  for (const inc of config.includePaths) {
    const resolved = resolveMaybeWorkspace(inc);
    if (resolved) {
      includes.push(resolved);
    }
  }
  for (const inc of includes) {
    args.push('-i' + inc);
  }

  return args;
}

function smartQuote(arg: string): string {
  return /\s/.test(arg) && !/^".*"$/.test(arg) ? `"${arg}"` : arg;
}

/** Human-readable command line for the output channel. */
export function buildCommandLine(
  compilerPath: string,
  args: string[],
  quoteAll: boolean
): string {
  const parts = args.map((a) => (quoteAll ? `"${a}"` : smartQuote(a)));
  return [quoteAll ? `"${compilerPath}"` : smartQuote(compilerPath), ...parts].join(' ');
}

/** Run the compiler for a single source file. Never throws. */
export function runCompiler(
  compilerPath: string,
  sourcePath: string,
  config: PawnConfig
): Promise<CompileResult> {
  const args = buildArgs(sourcePath, config);
  const outAmxPath = getOutputAmxPath(sourcePath, config);
  const commandLine = buildCommandLine(compilerPath, args, config.quotePaths);
  const start = Date.now();

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(compilerPath, args, { windowsHide: true });
    } catch (e: any) {
      resolve({
        success: false,
        exitCode: null,
        output: '',
        problems: [],
        args,
        commandLine,
        outAmxPath,
        durationMs: Date.now() - start,
        errorMessage: String(e?.message || e),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer | string) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer | string) => (stderr += d.toString()));

    const fail = (errorMessage: string) => {
      resolve({
        success: false,
        exitCode: null,
        output: (stdout + stderr) || errorMessage,
        problems: [],
        args,
        commandLine,
        outAmxPath,
        durationMs: Date.now() - start,
        errorMessage,
      });
    };

    child.on('error', (err) => fail(err.message));

    child.on('close', (code) => {
      const output = stdout + stderr;
      const problems = parseCompilerOutput(output);
      const hasErrors = problems.some((p) => p.severity === 'error');
      resolve({
        success: !hasErrors && code === 0,
        exitCode: code,
        output,
        problems,
        args,
        commandLine,
        outAmxPath,
        durationMs: Date.now() - start,
      });
    });
  });
}
