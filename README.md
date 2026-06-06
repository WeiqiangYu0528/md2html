# md2html

[English](README.md) · [简体中文](README.zh-CN.md)

> Turn any Markdown file into a single, self-contained HTML page that's genuinely a pleasure to read.

`md2html` is a small CLI that renders Markdown into **one** HTML file — CSS (and
optionally fonts) inlined — so you can open it anywhere, email it, or drop it on a
static host with zero dependencies. It's **theme-driven**: the same Markdown can wear
different looks. The reference theme is **Claude** — a warm serif essay style built for
long-form reading comfort.

<sub>Node ≥ 18.3 · TypeScript · zero runtime config · MIT licensed</sub>

---

## Quick start

```bash
git clone https://github.com/WeiqiangYu0528/md2html.git
cd md2html
npm install
npm run build
```

Then convert a file:

```bash
node dist/cli.js notes.md          # → notes.html, right next to the source
```

Prefer an `md2html` command on your PATH? Link it once:

```bash
npm link            # now `md2html notes.md` works anywhere
```

## Usage

```bash
md2html <file.md> [options]
```

| Option | Description |
|---|---|
| `-o, --output <path>` | Output file (default: `<input>.html`, next to the source) |
| `--theme <name>` | Theme to render with (default: `claude`) |
| `--embed-fonts` | Inline the theme's fonts into the HTML (otherwise system fonts) |
| `--list-themes` | Print available themes and exit |
| `-h, --help` | Show help |

```bash
md2html notes.md                 # → notes.html
md2html notes.md -o public/n.html # explicit output path
md2html notes.md --embed-fonts    # fully portable, fonts and all
md2html --list-themes             # see what's installed
```

The result is a single file with everything inlined — no `<link>` tags, no asset
folder, nothing to break when you move it.

## What it renders

CommonMark + GitHub-Flavored Markdown, plus the extras you actually use in docs:

- **Tables**, **task lists**, **strikethrough**, and **autolinks** (GFM)
- **Fenced code** with syntax highlighting ([Shiki](https://shiki.style))
- **Callouts** — `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`
- **Footnotes**, **YAML frontmatter** (the `title` becomes the page header), and
  automatic **heading anchors**

## Themes

A theme owns *all* presentation — colors, fonts, spacing, the syntax palette, even
per-element flourishes like callout icons. The converter stays theme-agnostic: it emits
semantic HTML with stable class hooks and never bakes in a single visual decision.

The bundled **Claude** theme (a "Warm Serif Essay") sets the quality bar: a calm ivory
page, a clay accent, serif typography, parchment-toned code blocks, earthy color-coded
callouts, and a custom checkbox — every element tuned to feel native to the page.

Adding a theme is dropping a folder under `themes/<name>/` (a `theme.json` manifest +
`theme.css`, with an optional custom code palette and fonts). No converter changes. The
full set of hooks a theme may style is documented in
[`THEME-CONTRACT.md`](THEME-CONTRACT.md).

## Architecture

Two strictly separated layers:

1. **Parse** — Markdown → semantic HTML with stable class hooks. Theme-agnostic; emits
   no color, font, or spacing.
2. **Assemble** — wraps that HTML in a document shell and inlines the chosen theme's CSS
   (and fonts).

The whole product thesis is *"same Markdown, swappable look,"* so that boundary is the
invariant: presentation logic in the parse layer is a bug. See the design spec in
[`docs/superpowers/specs/`](docs/superpowers/specs/) for the full rationale.

## Development

```bash
npm test          # run the Vitest suite
npm run typecheck # tsc --noEmit
npm run build     # bundle to dist/cli.js
```

Single test file: `npx vitest run test/<name>.test.ts`.

## License

[MIT](LICENSE) © Weiqiang Yu
