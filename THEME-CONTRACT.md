# Theme Contract

The parse layer guarantees the stable HTML hooks below. A theme styles **only**
these — it never needs to read parser internals. Adding a theme is adding a folder
under `themes/<name>/` with `theme.json` + `theme.css`; no parser code changes.

## Document shape
- `<body class="theme-<name>">` › `<article class="md-content">`
- Optional `<header class="md-header"><h1>…</h1></header>` (only when frontmatter has a `title`)

## Element hooks
- Headings `<h1>`–`<h6>` carry stable `id` attributes (slugified text)
- Callouts: `<div class="callout callout-note|tip|important|warning|caution">` with a leading `<p class="callout-title">`. The title opens with a presentation-free icon hook `<span class="callout-icon" aria-hidden="true"></span>`; the theme supplies the glyph and color via CSS (e.g. a masked SVG), so iconography is theme-owned.
- Code blocks: each fenced block is `<div class="code-card">` wrapping `<pre class="shiki" style="…">` (inline token colors from Shiki). When the fence info string carries a label after the language (GFM `` ```bash cURL `` → `cURL`, or a bare `` ```js `` → `js`), the card is preceded by a `<div class="code-card-header">` holding that label; a plain ` ``` ` fence emits no header. The theme owns the card chrome (border, radius, header bar); `pre.shiki` should be styled as a flush, transparent body so the card supplies its background. Inline code is `<code>`.
- Math: inline math is `<eq>…</eq>`; display math is `<section><eqn>…</eqn></section>`. Inside each, KaTeX emits its own `.katex` / `.katex-display` markup (glyph metrics — a converter-owned correctness asset, like Shiki tokens, not theme-owned). A theme styles the `<eq>` / `<eqn>` wrappers and may set `.katex` color/size; the KaTeX stylesheet (with fonts inlined) is added to the document automatically, and only when the document contains math.
- Task lists: `<li class="task-list-item">` containing an `<input type="checkbox">`
- Footnotes: a trailing `<section class="footnotes">`
- Tables are wrapped: `<div class="table-wrap"><table>…</table></div>` (the wrapper enables horizontal scroll on narrow screens)
- Table of contents (when generated): `<nav class="toc" aria-label="Table of contents">` containing a `<p class="toc-title">` and a nested `<ul>` of `<a href="#slug">` links. Emitted by the converter after the header (auto when the doc has 3+ h2/h3 headings, or via frontmatter `toc: true`/`toc: false`); the theme styles it and may reposition it (the Claude theme makes it a sticky side-rail on wide screens). The title is localized (`Contents` / `目录`). The CLI `--toc <mode>` flag (auto|sidebar|topbar|none) controls placement by adding a body-class hook: `sidebar` → `<body class="… toc-sidebar">`, `topbar` → `<body class="… toc-topbar">`; `auto` and `none` add no class. A theme SHOULD respond to `.toc-sidebar` (prefer the side-rail, at a lower viewport threshold than auto) and `.toc-topbar` (force the top-card form at all widths); `auto` keeps the theme's own default adaptive behavior.
- Diagrams (Mermaid): a rendered diagram is `<figure class="mermaid">` containing inline `<svg>`; when rendering isn't possible (no browser / invalid syntax) it degrades to `<figure class="mermaid-fallback">` wrapping the source. Diagram colors come from the theme manifest's optional `mermaid` config (a Mermaid init object with `theme`/`themeVariables`), the way the code palette comes from `shikiThemeFile` — the converter only plumbs it.
- Blockquotes, lists, images, links, `<hr>`: plain semantic tags

## Language

The document shell carries `<html lang="…">`. The converter sets it from an explicit
frontmatter `lang:` field, or — when absent — auto-detects Chinese vs English from the
content (`zh` / `en`). Themes may key presentation off `:lang(...)` (the Claude theme uses
`:lang(zh)` for CJK typography). The `lang` attribute is the stable hook; detection lives
entirely in the converter.

## theme.json
A theme manifest declares its name, description, the Shiki code theme, and any
embeddable fonts (used only with `--embed-fonts`; an empty array means system fonts).
Fields: `name`, `description`, the code theme, and `fonts` (array of
`{ family, weight, style, file }` where `file` is relative to the theme directory).

The code theme is given **one of two ways**:
- `shikiTheme`: the name of a built-in Shiki theme (e.g. `"vitesse-dark"`), or
- `shikiThemeFile`: a path (relative to the theme directory) to a custom Shiki/TextMate
  theme JSON the theme ships itself. This lets a theme own its syntax palette so code
  blocks stay native to the theme. The Claude theme uses `"shikiThemeFile": "code-theme.json"`.

A theme may also declare an optional `mermaid` object (a Mermaid init config:
`theme`/`themeVariables`) so diagrams match the theme's palette.

A theme may set `extends` to the name of a base theme. It then inherits the base's CSS
(prepended) and the base's body scope class (`<body class="theme-<base>">`), so the base's
structural rules apply; the extending theme's own `theme.css` comes last, so a `:root` palette
override wins. Other fields (`shikiThemeFile`/`shikiTheme`, `mermaid`, `fonts`) are the
extending theme's own — e.g. `claude-dark` extends `claude` and supplies only a dark palette,
a dark code theme, and a dark Mermaid config.
