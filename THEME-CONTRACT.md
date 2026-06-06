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
- Code blocks: `<pre class="shiki" style="…">` with inline token colors (Shiki); inline code is `<code>`
- Task lists: `<li class="task-list-item">` containing an `<input type="checkbox">`
- Footnotes: a trailing `<section class="footnotes">`
- Tables are wrapped: `<div class="table-wrap"><table>…</table></div>` (the wrapper enables horizontal scroll on narrow screens)
- Blockquotes, lists, images, links, `<hr>`: plain semantic tags

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
