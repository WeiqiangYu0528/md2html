# Theme Contract

The parse layer guarantees the stable HTML hooks below. A theme styles **only**
these — it never needs to read parser internals. Adding a theme is adding a folder
under `themes/<name>/` with `theme.json` + `theme.css`; no parser code changes.

## Document shape
- `<body class="theme-<name>">` › `<article class="md-content">`
- Optional `<header class="md-header"><h1>…</h1></header>` (only when frontmatter has a `title`)

## Element hooks
- Headings `<h1>`–`<h6>` carry stable `id` attributes (slugified text)
- Callouts: `<div class="callout callout-note|tip|important|warning|caution">` with a leading `<p class="callout-title">`
- Code blocks: `<pre class="shiki" style="…">` with inline token colors (Shiki); inline code is `<code>`
- Task lists: `<li class="task-list-item">` containing an `<input type="checkbox">`
- Footnotes: a trailing `<section class="footnotes">`
- Tables, blockquotes, lists, images, links, `<hr>`: plain semantic tags

## theme.json
A theme manifest declares its name, description, the Shiki code theme, and any
embeddable fonts (used only with `--embed-fonts`; an empty array means system fonts).
Fields: `name`, `description`, `shikiTheme`, `fonts` (array of `{ family, weight, style, file }`
where `file` is relative to the theme directory).
