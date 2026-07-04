# Change Log

## 0.2.0

- **Platform/version selection**: choose between `302`, `303`, `304`, `31X` (or none) via the new `Pawn: Select Platform / Version` command, the `pawn.platformVersion` setting, or by clicking the platform status bar item.
- New settings `pawn.platformVersion` and `pawn.platformIncludeBaseDir`.
- Available platforms are auto-detected by scanning the include base directory.
- Dedicated platform indicator in the status bar (`$(layers) Pawn: 304`).
- Default `pawn.includePaths` now contains only the base include dir; the platform subdir is injected automatically.

## 0.1.0

- Initial release.
- Compile active `.p`/`.inc`/`.pwn` file with `pawncc`.
- Problems panel diagnostics for `error` / `warning` / `fatal error`.
- Output channel, status bar, compile-on-save.
- `pawn` build task provider + `$pawncc` problem matcher.
