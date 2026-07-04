# Pawn Compiler (UMKa3XX)

Compile Pawn (`.p`) scripts with the **UMKa3XX `pawncc`** compiler directly from VS Code.
Compiler output is parsed and shown in the **Problems** panel, plus an **Output** channel and a **status bar** indicator.

## Features

- 🛠 **One-key compile** of the active `.p` file (default `F6` or `Ctrl+F6`).
- 🧯 **Problems panel** integration — `error` / `warning` / `fatal error` lines map to VS Code diagnostics.
- 📜 **Output channel** "Pawn Compiler" with the full compiler log + the exact command used.
- 🟢 **Status bar** showing last result (`OK`, `2 errs, 1 warn`, …).
- 💾 Optional **compile on save**.
- 🧩 Build **tasks** (`Ctrl+Shift+B`) of type `pawn` with a built-in `pawncc` problem matcher.
- ⚙️ Fully configurable: compiler path, include dirs, flags, output directory.

## Requirements

The `pawncc.exe` compiler installed at (default):

```
C:\Program Files (x86)\UMKa3XX\pawn\bin\pawncc.exe
```

If your install lives elsewhere, set `pawn.compilerPath` in Settings.

## Default behaviour

The default configuration reproduces the original working command:

```
pawncc.exe -d1 -O3 -v -V -o"<src>.amx" "<src>.p" \
  -i"<src dir>/" \
  -i"C:\Program Files (x86)\UMKa3XX\pawn\include\304\" \
  -i"C:\Program Files (x86)\UMKa3XX\pawn\include\"
```

## Platform / version selection

The compiler ships with multiple platform include sets under
`C:\Program Files (x86)\UMKa3XX\pawn\include\`: **302, 303, 304, 31X**.

Pick one in three ways:

1. **Status bar** — click the `$(layers) Pawn: 304` item at the bottom and choose from the quick-pick.
2. **Command Palette** → `Pawn: Select Platform / Version`.
3. **Setting** `pawn.platformVersion` (`302` | `303` | `304` | `31X` | `""`).

The selected platform's `-i` directory is injected automatically (right after the source dir), so you don't have to manage it in `pawn.includePaths`. Available platforms are auto-detected by scanning the include base directory.

## Commands

| Command | Title |
| --- | --- |
| `pawn.compile` | **Pawn: Compile File** |
| `pawn.clean` | **Pawn: Clear Diagnostics** |
| `pawn.showOutput` | **Pawn: Show Compiler Output** |

## Configuration (`pawn.*`)

| Setting | Default | Description |
| --- | --- | --- |
| `pawn.compilerPath` | `C:\Program Files (x86)\UMKa3XX\pawn\bin\pawncc.exe` | Path to `pawncc.exe`. |
| `pawn.includePaths` | `…\include\304\`, `…\include\` | `-i` include directories. |
| `pawn.addSourceDirToIncludes` | `true` | Add the source file's folder as the first `-i`. |
| `pawn.extraArgs` | `-d1 -O3 -v -V` | Extra compiler flags. |
| `pawn.outputDirectory` | `""` | Output folder; empty = source folder. |
| `pawn.compileOnSave` | `false` | Recompile on save. |
| `pawn.showStatusBar` | `true` | Show the status bar item. |
| `pawn.clearBeforeCompile` | `true` | Clear previous diagnostics before each run. |
| `pawn.quotePaths` | `false` | Force-quote every argument in the displayed command. |
| `pawn.platformVersion` | `304` | Target platform: `302` / `303` / `304` / `31X` / `""`. Picks the matching subdir of `pawn.platformIncludeBaseDir`. |
| `pawn.platformIncludeBaseDir` | `C:\Program Files (x86)\UMKa3XX\pawn\include\` | Base dir holding platform subfolders (auto-scanned for the picker). |

## Build tasks

Press `Ctrl+Shift+B` while editing a `.p` file — a `pawn` build task is offered automatically.

You can also author `tasks.json`:

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "pawn",
      "file": "${file}",
      "problemMatcher": ["$pawncc"],
      "group": { "kind": "build", "isDefault": true },
      "label": "Pawn: compile current file"
    }
  ]
}
```

## Building the VSIX from source

```pwsh
cd pawn-compiler
npm install
npm run build      # compiles TS and produces pawn-compiler-umka-0.1.0.vsix
```

Install into VS Code:

```pwsh
code --install-extension pawn-compiler-umka-0.1.0.vsix
```
