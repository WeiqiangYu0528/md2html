# GPT Theme — Design Spec

**Date:** 2026-06-17
**Status:** Approved
**Feature:** A new `gpt` theme inspired by the OpenAI article page at `https://openai.com/zh-Hans-CN/index/chatgpt-memory-dreaming/`.

---

## Goal

Add a new `gpt` theme that gives Markdown documents a clean OpenAI-inspired editorial reading experience. The theme should feel crisp, white, modern, and sparse while still supporting the full md2html document surface: prose, code, tables, callouts, task lists, math, footnotes, Mermaid diagrams, and the table of contents.

This is not a pixel clone of OpenAI's page. It adapts the observed UI language for technical Markdown output.

## Summary of decisions

| Decision | Choice |
|---|---|
| Theme name | `gpt`, selected with `--theme gpt` |
| Aesthetic | OpenAI-inspired technical editorial theme |
| Structure | Standalone theme under `themes/gpt`, not an extension of `claude` |
| Conversion changes | None — use the existing theme contract and semantic hooks |
| Primary layout | Centered article column with a quiet left TOC rail on wide screens |
| Mobile layout | Full-width article with TOC as an in-flow card |

## Reference insights

The OpenAI reference page uses a restrained black-on-white editorial system:

- White page background with near-black body text.
- Sans-serif typography with medium-weight headings.
- Large, calm title treatment around `56px` on desktop.
- Body prose around `17px` with generous line height.
- A narrow text column around `560px`, with larger media allowed to break wider.
- A quiet left navigation rail on desktop.
- Very subtle surfaces using low-alpha black fills and small radii.
- Minimal decorative color; hierarchy comes from type, spacing, and contrast.

The `gpt` theme should borrow these principles without depending on OpenAI assets, remote fonts, or page-specific layout.

## Visual system

Use a neutral light palette:

- `--bg`: pure or near-pure white.
- `--ink`: near-black text.
- `--muted`: medium neutral gray for secondary text.
- `--rule`: low-contrast neutral border.
- `--surface`: very light gray panel, roughly a 4% black tint.
- `--surface-strong`: slightly stronger neutral panel for table heads and code blocks.
- `--accent`: black or deep neutral; links remain understated and high-contrast.

Avoid the Claude theme's warm serif palette. The theme should feel modern, spare, and product-editorial rather than printed-book-like.

## Typography

Use a system sans stack that approximates the OpenAI page without requiring bundled or remote fonts:

- Body: `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, plus common CJK sans fonts.
- Code: `ui-monospace`, `SF Mono`, `Menlo`, monospace.
- Headings: same sans stack as body, with medium weight.

Desktop direction:

- Body copy: `17px` to `18px`, around `1.65` line height.
- `h1`: large editorial title, approximately `3.25rem`, medium weight, tight line height.
- `h2`: around `1.75rem`, medium weight, with spacing rather than heavy decoration.
- `h3`: around `1.3rem`, medium weight.

Chinese text should remain readable with CJK sans fonts, strict line breaking, and a comfortable measure. Do not force italics on Chinese blockquotes.

## Layout

The theme uses the existing md2html structure:

- `<body class="theme-gpt">`
- `<article class="md-content">`
- optional `.md-header`
- optional `.toc`

Main layout:

- Article max width around `620px` for prose.
- Generous top and bottom padding.
- Paragraph rhythm driven by whitespace, not borders.
- Images and Mermaid diagrams may use full content width but remain contained and rounded subtly.

TOC behavior:

- Mobile and narrow screens: the TOC is an in-flow card with full text.
- Wide screens: the TOC floats or sticks as a quiet left rail, matching the existing Claude behavior conceptually.
- Wide-screen TOC links use one-line ellipsis so long Chinese headings do not create a crowded rail.
- The in-flow TOC card keeps full link text.

## Markdown elements

### Links

Links should be understated and editorial: near-black or deep neutral, underlined with a thin underline and a slightly stronger hover state.

### Code

Inline code uses a subtle neutral pill. Code blocks use a light neutral Shiki palette with:

- white or near-white background,
- thin neutral border,
- small radius,
- readable syntax colors that stay calm and product-like.

Ship a `themes/gpt/code-theme.json` file rather than naming a built-in theme, so the theme owns its code palette.

### Callouts

Callouts should be restrained panels rather than colorful alert boxes:

- light neutral background,
- thin border,
- small left accent or title color per type,
- existing masked icons can be reused through CSS variables or equivalent per-type rules.

Keep the five existing callout types visually distinct but subtle: note, tip, important, warning, caution.

### Tables

Tables should be minimal:

- no heavy grid,
- subtle row separators,
- light gray header background,
- restrained hover tint.

### Task lists

Checkboxes should match the neutral system: small rounded squares, neutral border, black or near-black checked state.

### Blockquotes

Blockquotes use a quiet left rule, muted text, and no ornate treatment. Chinese blockquotes stay upright.

### Math and diagrams

Math inherits text color and keeps overflow protection. Mermaid diagrams use a light neutral config: white/gray nodes, near-black text, neutral lines, and subtle accents.

## Theme files

Add:

- `themes/gpt/theme.json`
- `themes/gpt/theme.css`
- `themes/gpt/code-theme.json`

The manifest should set:

- `name: "gpt"`
- a concise description
- `fonts: []`
- `shikiThemeFile: "code-theme.json"`
- a light neutral Mermaid config

No `extends` field is needed because this theme has a distinct structural aesthetic from `claude`.

## Testing

Add theme-loader coverage:

- `listThemes()` includes `gpt`.
- `loadTheme('gpt')` returns `name === 'gpt'`.
- `loadTheme('gpt').scopeClass === 'gpt'`.
- GPT CSS includes `.theme-gpt .md-content`.
- GPT CSS includes desktop TOC ellipsis inside a wide-screen media query.
- `shikiTheme` resolves to a parsed object from `code-theme.json`.
- `mermaid` resolves to an object from `theme.json`.

Update snapshots only for intentional fixture additions or theme selection coverage.

## Visual verification

After implementation:

1. Build the CLI.
2. Render the current Flink Markdown file with `--theme gpt`.
3. Open the generated HTML in a browser.
4. Check at desktop and mobile widths:
   - prose rhythm,
   - heading hierarchy,
   - left TOC truncation,
   - code blocks,
   - tables,
   - callouts,
   - task lists,
   - math,
   - Mermaid diagrams if present.

The theme is complete only when the output feels intentionally designed, not merely valid.

## Out of scope

- Remote OpenAI fonts or assets.
- Pixel-perfect reproduction of the OpenAI page.
- JavaScript interactions.
- Parser or renderer changes.
- Changing the default theme away from `claude`.
- Dark mode for `gpt`.
