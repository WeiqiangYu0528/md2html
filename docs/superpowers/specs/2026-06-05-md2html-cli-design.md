# Design: `md2html` — Beautiful Markdown → HTML CLI

**Date:** 2026-06-05
**Status:** Approved (design); ready for implementation planning

## Summary

A Node.js command-line tool that converts a Markdown file into **one self-contained
HTML file** tuned for comfortable, delightful reading. The tool is theme-driven from
day one so the same Markdown can be rendered in different looks; the first and
reference theme is **Claude** — a warm, serif "essay" style modeled on the
Anthropic aesthetic.

The guiding quality bar: *would this output look at home on an Anthropic page?*

## Goals

- Convert a Markdown file to a single, portable, self-contained `.html` that reads beautifully.
- Make presentation fully theme-owned and interchangeable, with the parse layer theme-agnostic.
- Ship a reference-quality **Claude** theme that sets the bar for future themes.

## Non-goals (v1)

- No web app, server, library API, or static-site-generator mode (CLI only for v1).
- No math, diagrams, table-of-contents, or dark mode yet (see Roadmap).

## Form factor & usage

A CLI invoked per file:

```
md2html notes.md                    → notes.html   (next to the source)
md2html notes.md -o out.html        → explicit output path
md2html notes.md --theme claude     → choose theme (default: claude)
md2html notes.md --embed-fonts      → inline a branded webfont instead of system fonts
md2html --list-themes               → list available themes
```

**Output:** one self-contained HTML file with CSS (and optionally fonts) inlined.
Code-block colors are inlined by Shiki, so no sidecar stylesheet is ever required.

## Architecture — strict two-layer split

The product thesis is "same Markdown, swappable look," so the two layers must never
bleed into each other.

```
input.md
  │
  ▼  ① PARSE  (theme-agnostic — emits NO color/font/spacing)
  ├─ gray-matter        → split YAML frontmatter from body
  ├─ markdown-it        → CommonMark + GFM
  │    + markdown-it-footnote
  │    + markdown-it-anchor        (stable heading IDs)
  │    + markdown-it-github-alerts (callouts: > [!NOTE] …)
  ├─ Shiki              → fenced code highlighted with INLINE colors
  ▼
semantic HTML  (stable, documented class hooks — see Theme Contract)
  │
  ▼  ② ASSEMBLE  (the ONLY place a theme applies)
  ├─ load theme:  themes/<name>/{theme.json, theme.css}
  ├─ build <head>: <title> from frontmatter, inline <style> = theme.css
  ├─ inline fonts as base64 @font-face   (only when --embed-fonts)
  ▼
one self-contained .html
```

**Invariant:** any color/font/spacing logic appearing in the parse layer is an
architecture bug. All presentation lives in `theme.css`.

## Markdown support (v1)

- CommonMark + GFM: headings, lists, blockquotes, **tables**, task lists, strikethrough, autolinks
- Fenced code blocks highlighted with **Shiki**
- **Footnotes**
- **YAML frontmatter** — parsed for metadata (`title` → `<title>` and page header), never rendered as literal text
- **Heading anchors** — automatic `id`s so headings are linkable
- **Callouts / admonitions** — `> [!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`

## Theme contract (the heart of multi-theme)

The parse layer guarantees a documented, stable set of hooks. Themes style **only**
these. This contract is maintained in `THEME-CONTRACT.md` and is the only thing a new
theme author needs — never the parser internals.

Guaranteed structure / hooks:

- Root: `<body class="theme-<name>">` › `<article class="md-content">`
- Callouts: `<div class="callout callout-note|tip|warning|important|caution">` containing `.callout-title` + body
- Code: Shiki output `<pre class="shiki">…</pre>` (colors inline); inline `<code>`
- Headings: carry stable `id` attributes
- Footnotes: markdown-it-footnote's standard `.footnotes` structure
- Tables, blockquotes, lists, images, links, horizontal rules: plain semantic tags

**A theme is a folder.** `themes/<name>/`:

- `theme.json` — manifest: `name`, `description`, the Shiki code theme to use, font strategy + stack, (future) dark support
- `theme.css` — all presentation, written against the hooks above
- `fonts/` — optional embeddable font files (used only with `--embed-fonts`)

Adding a theme touches **no** parser code — only a new folder under `themes/`.

## Claude theme (reference / quality bar)

"Warm Serif Essay" direction:

- Background ivory `#faf9f5`, ink text `#2b2a26`
- Accent **clay-orange `#cc785c`** — links, callout rules, blockquote rule
- Serif throughout, system stack: **Georgia → Iowan Old Style → Tiempos Text → Times**
- Reading measure ~64ch, line-height ~1.75, generous heading scale (serif, tight tracking)
- **Dark code blocks** — a warm dark Shiki theme for contrast against the light page
- Fonts: 0KB system serif by default; `--embed-fonts` swaps in a free distinctive serif (e.g. Source Serif 4), inlined as base64

## Tech & project layout

- **TypeScript** (ESM), built with esbuild/tsup → shipped as a compiled `bin/md2html`
- Dependencies: `markdown-it` (+ `markdown-it-footnote`, `markdown-it-anchor`, `markdown-it-github-alerts`), `shiki`, `gray-matter`
- Argument parsing: Node's built-in `util.parseArgs` (no CLI-framework dependency)

```
mdHtml/
  package.json
  tsconfig.json
  bin/md2html                  CLI entry (thin shim → src/cli)
  src/
    cli.ts                     arg parsing + orchestration
    convert.ts                 markdown → semantic HTML (theme-agnostic)
    assemble.ts                wrap document, inline CSS/fonts
    themes.ts                  load/resolve theme by name
    markdown/
      setup.ts                 markdown-it instance + plugin config
      callouts.ts              callout handling/config
    types.ts
  themes/
    claude/
      theme.json
      theme.css
      fonts/                   (optional embedded serif)
  test/
    fixtures/                  sample .md inputs + expected output
    *.test.ts
  THEME-CONTRACT.md            documented class hooks for theme authors
```

## Testing strategy

- **Vitest**
- Unit tests per Markdown feature, asserting the correct semantic hooks are emitted
  (callouts, footnotes, frontmatter handling, heading IDs, code highlighting)
- **Snapshot tests** rendering fixture `.md` files to full HTML documents, so visual
  regressions surface in diffs
- A CLI smoke test (convert a fixture end-to-end, assert a self-contained file is written)

## Error handling

- Missing input file → friendly message, nonzero exit
- Unknown `--theme` → error listing available themes
- Malformed YAML frontmatter → warn and continue (treat as no metadata)
- Output write failure → clear error, nonzero exit

## Deferred / roadmap (do not forget)

These were considered and explicitly deferred past v1:

- **Math** rendering (KaTeX) — `$...$`, `$$...$$`
- **Diagrams** (Mermaid) — ` ```mermaid ` blocks
- **Table of contents** — auto-generated from headings
- **Dark mode** — either a separate dark theme or a `prefers-color-scheme` variant within Claude
- **Additional themes** beyond Claude (the whole point of the theme contract)
- **Folder / glob input** and `--assets external` (sidecar CSS) output mode
- **Other form factors** — web app (live theme switching), reusable library/API, static site generator
