# TOC placement CLI flag — design

**Date:** 2026-07-09
**Status:** Approved (pending user review)

## Problem

The table of contents already renders in one of two forms, chosen purely by CSS
media query on viewport width:

- **card at the top of the article** on narrow viewports, and
- **sticky left side-rail** on wide viewports (≥1400px in the gpt theme).

Users have no way to *choose* which form they get — it is decided automatically
by screen width. This feature adds a CLI flag so the placement can be declared
explicitly, while keeping `auto` (the current adaptive behavior) as the default.

## Goal

Add a `--toc <mode>` CLI flag accepting `auto | sidebar | topbar | none`:

- `auto` (default) — current adaptive behavior, unchanged.
- `sidebar` — prefer the side-rail; fall back to the top card on viewports too
  narrow to hold it.
- `topbar` — always the top card, at any width.
- `none` — no table of contents.

**Non-goals.** The *appearance* of the TOC does not change. `sidebar` and
`topbar` are the two forms that already exist; this feature only lets the user
pick between them (and turn the TOC off) instead of leaving it to viewport
width. No new visual treatment is introduced.

## Architectural constraint

Per `CLAUDE.md`, the conversion layer must never bake in presentation. Placement
(where the TOC sits, at what breakpoint it floats) is a **theme** concern. The
CLI mode therefore must not become layout logic inside the converter — it must
become a **stable class hook** on `<body>`, and the theme CSS decides what that
hook looks like. This is the approved approach (path 1 of the brainstorm);
emitting different HTML structure or inline styles per mode from the conversion
layer was explicitly rejected as an architecture bug.

## CLI interface

New option in `src/cli.ts`:

```
--toc <mode>    Table-of-contents placement: auto | sidebar | topbar | none (default: auto)
```

- Parsed via `node:util` `parseArgs` as `type: 'string', default: 'auto'`.
- Validated against the four legal values. An invalid value (e.g. `--toc foo`)
  prints an error listing the legal values and exits with code 1, matching the
  existing error-handling style in `run()`.
- Single-file and folder-batch modes share one mode, exactly like `--theme` and
  `--embed-fonts`.

## Layer changes

Data flow: `CLI --toc` → conversion layer (decides *whether* a TOC exists) →
assemble layer (decides *what class* goes on `<body>`).

### Conversion layer (`src/convert.ts`, `src/toc.ts`) — visibility only

`convert()` and `buildToc()` take a new `tocMode: TocMode` argument. `buildToc`'s
decision becomes:

- `none` → no TOC (same as frontmatter `toc: false`).
- `sidebar` / `topbar` → force the TOC on whenever there is ≥1 heading. The
  "≥3 headings" threshold is bypassed because the user named a placement, so
  intent is explicit. Equivalent to `toc: true` today.
- `auto` → **fall back to the existing frontmatter `toc` logic** unchanged:
  `toc: false` suppresses, `toc: true` forces, otherwise the TOC appears only
  with 3+ headings. This preserves current behavior byte-for-byte when the flag
  is not passed.

Precedence (confirmed): **CLI wins over frontmatter.** When `--toc` is anything
other than `auto`, it overrides the frontmatter `toc` value. `auto` defers to
frontmatter.

The conversion layer never learns whether the placement is `sidebar` or
`topbar` — it emits the same `<nav class="toc">` markup in all cases.

### Assemble layer (`src/assemble.ts`) — mode → class hook

`assembleDocument` takes a new `tocMode: TocMode`. It adds a class to `<body>`:

- `sidebar` → `toc-sidebar`
- `topbar` → `toc-topbar`
- `auto` / `none` → no extra class

Result: `<body class="theme-gpt toc-sidebar">`. The class is only meaningful when
a TOC is actually present; for `none` there is no TOC so no class is needed.

### Theme layer (`themes/*/theme.css`) — all appearance

Each theme responds to the two hooks. Using gpt as the reference (claude and
claude-dark follow the same structure):

- **`auto`** (no class): unchanged — default top-card, floats to side-rail at
  `min-width: 1400px`.
- **`.toc-topbar`**: force the card form at all widths. Override the existing
  `≥1400px` float rules back to `float: none; position: static; width: auto`
  and restore the card border/padding/background. Specificity is carried by the
  extra `.toc-topbar` body class.
- **`.toc-sidebar`**: lower the float breakpoint to `min-width: 1000px` so
  medium widths get the rail; below that, no rule applies and it degrades to the
  default card form.

**Shared float styles.** The float/sticky rule set currently lives only inside
each theme's `1400px` block. `sidebar` needs the same set at `1000px`. Factor
the float styles so `auto` (≥1400) and `sidebar` (≥1000) share one definition
rather than copy-pasting the block. Exact CSS structuring is left to
implementation per theme, but the principle is no duplicated float block.

## Types

Add a shared `TocMode` type: `'auto' | 'sidebar' | 'topbar' | 'none'` (in
`src/types.ts` or alongside the CLI). Thread it through `run` → `runSingle` /
`runDirectory` → `renderMarkdown` → `convert` → `buildToc`, and into
`assembleDocument`.

## Testing

Unit tests (Vitest, matching existing style):

- **`toc.ts`** — `buildToc` visibility decision per mode: `none` suppresses;
  `sidebar`/`topbar` force-on with ≥1 heading; `auto` defers to frontmatter
  (including the unchanged ≥3-heading threshold).
- **`assemble.ts`** — `<body>` class is correct: `sidebar`→`toc-sidebar`,
  `topbar`→`toc-topbar`, `auto`/`none`→no toc class.
- **`cli.ts`** — `--toc foo` errors and exits non-zero, listing legal values;
  default mode is `auto`.

**Regression (most important safety net).** Existing snapshot tests
(kitchen-sink etc.) must not change. With no `--toc` flag, output must be
**byte-for-byte identical** to current output.

## Visual verification (required by CLAUDE.md)

Run the real Chinese sample document through all four modes and confirm in a
browser:

- `sidebar` — floats left on a wide window, falls back to the top card on a
  narrow window.
- `topbar` — top card at any width.
- `auto` — identical to current behavior.
- `none` — no TOC.

## Documentation

`THEME-CONTRACT.md` gains one clause: a theme must respond to the
`.toc-sidebar` and `.toc-topbar` body-class hooks. This is a formal extension of
the theme contract — a new theme author needs to know these hooks exist.
