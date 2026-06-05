# md2html

Render any Markdown file into a single, self-contained, beautiful HTML file.
Theme-driven — ships with the **Claude** theme (a warm serif essay style).

## Install

```bash
npm install
npm run build
```

## Usage

```bash
md2html notes.md                 # → notes.html (next to source)
md2html notes.md -o out.html     # explicit output path
md2html notes.md --theme claude  # choose a theme (default: claude)
md2html notes.md --embed-fonts   # inline the theme's fonts
md2html --list-themes            # list available themes
```

Output is one HTML file with the theme's CSS (and optionally fonts) inlined —
open it anywhere, email it, or host it as a static file.

## Supported Markdown

CommonMark + GFM (tables, task lists, strikethrough, autolinks), fenced code with
Shiki highlighting, footnotes, YAML frontmatter, heading anchors, and callouts
(`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`).

## Development

```bash
npm test          # run the test suite
npm run typecheck # type-check without emitting
npm run build     # bundle to dist/cli.js
```

## Architecture

Two strictly separated layers: a theme-agnostic **parse** layer (Markdown → semantic
HTML with stable class hooks) and an **assemble** layer (wraps the HTML and inlines a
theme's CSS/fonts). See `THEME-CONTRACT.md` for the hooks a theme may style.
