# Dark Mode (as a Theme) — Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Feature:** A dark theme `claude-dark`, built via lightweight theme inheritance over a fully variable-driven Claude theme. Zero runtime JS.

---

## Goal

Offer a dark reading experience by adding a **`claude-dark`** theme (selected with
`--theme claude-dark`), a warm dark sibling of the reference Claude theme. Do it the way the
product is meant to grow — as a swappable theme — without duplicating Claude's stylesheet and
without any runtime JS, OS detection, or toggle.

## Summary of decisions

| Decision | Choice |
|---|---|
| Dark mode delivery | A new theme `claude-dark`, chosen via `--theme claude-dark` (default stays `claude`) |
| Trigger | Explicit theme selection — no `prefers-color-scheme`, no toggle, no JS |
| Reuse strategy | **Shared base + thin override**: make Claude fully variable-driven, add manifest `extends`, ship `claude-dark` as a thin palette override |
| Aesthetic | Warm dark essay (espresso bg, warm off-white ink, brightened clay accent) — a dark sibling, not a cold gray |

## Architecture

Three parts. The converter stays presentation-free throughout; all of this lives in the theme
layer plus a small loader/assemble change for inheritance.

### (a) Make the Claude theme fully variable-driven (output-identical)

Today `themes/claude/theme.css` declares 8 color vars in `:root` but hardcodes ~16 colors
inline: the heading ink (`#1a1915`), the callout palette (5 types × {edge, background, title} =
15), the table-header background (`#f7f3ea`), the checkbox border/face (`#c3b8a0`/`#fbf7ee`),
and the row-hover tint (`rgba(0,0,0,0.02)`). Route **all** of them through new `:root` custom
properties, replacing each inline usage with `var(...)`. **Values are unchanged**, so Claude
renders pixel-identical.

New variables (current values; names illustrative — finalize in plan):
- `--heading-ink: #1a1915`
- Callouts, per type `note|tip|important|warning|caution`:
  `--callout-<type>-edge`, `--callout-<type>-bg`, `--callout-<type>-title` (15 vars)
- `--table-head-bg: #f7f3ea`
- `--checkbox-border: #c3b8a0`, `--checkbox-face: #fbf7ee` (the face doubles as the checkmark
  color)
- `--row-hover: rgba(0,0,0,0.02)`
- The `pre.shiki` border currently `#e7e0d2` becomes `var(--rule)` (same value).

The masked-SVG icons and the checkmark already derive their visible color from `currentColor`
or `var(--checkbox-face)`, so they adapt automatically — no icon changes.

After this, the full palette (~28 vars) lives in `:root`; every structural rule references a
variable.

### (b) Lightweight theme inheritance

- `theme.json` gains an optional **`extends: string`** (a base theme name).
- `loadTheme(name)`: when the manifest has `extends`, load the base theme first, then set the
  returned theme's `css` to `base.css + "\n" + ownCss`, and its **`scopeClass`** to the base's
  `scopeClass`. For a non-extending theme, `scopeClass = name`. (`Theme` gains
  `scopeClass: string`.)
- Cascade: the base CSS (structural rules scoped to `.theme-claude`, plus the light `:root`)
  comes first; the child's CSS (a dark `:root { … }`) comes after, so the dark variables win
  globally. The body carries the base scope class (`theme-claude`), so the structural rules
  apply.
- `src/assemble.ts` switches `<body class="theme-${theme.name}">` to
  `<body class="theme-${theme.scopeClass}">`. Since `scopeClass` defaults to `name`, Claude's
  output is unchanged (`theme-claude`).
- Inheritance covers **CSS and scope class only**. Other manifest fields (`shikiTheme`/
  `shikiThemeFile`, `mermaid`, `fonts`, `description`, `name`) are the child's own — a dark
  theme ships its own dark code palette and Mermaid config.

### (c) `claude-dark` theme files

- `themes/claude-dark/theme.json`: `{ name: "claude-dark", description: "Warm Serif Essay — dark.",
  extends: "claude", shikiThemeFile: "code-theme.json", mermaid: { …dark… }, fonts: [] }`.
- `themes/claude-dark/theme.css`: a single dark `:root { … }` block redefining all ~28 palette
  variables with dark-warm values.
- `themes/claude-dark/code-theme.json`: a dark warm Shiki palette (dark editor background,
  light foreground, warm token colors readable on dark).

## The dark palette

Warm dark essay — a dark sibling of Claude, not a cold gray. Direction (exact values tuned
visually in implementation):
- `--bg` warm near-black / espresso; `--ink` warm off-white; `--muted` warm gray
- `--accent` / `--accent-strong` the clay accent brightened enough to read on dark (links must
  meet contrast)
- `--rule` low-contrast warm line; `--tint` / `--code-inline-bg` panels slightly lighter than bg
- `--heading-ink` near-white warm
- Callout hues: dark-tinted backgrounds, brighter edges, light titles — same five families
- `--table-head-bg`, checkbox vars, `--row-hover` (→ a light-on-dark tint) all darkened
- Dark Shiki code palette and a dark Mermaid config (dark node fills, light text, clay borders)

## Testing

- `listThemes()` includes `claude-dark`.
- `loadTheme('claude-dark')`: `name === 'claude-dark'`; `scopeClass === 'claude'`; `css`
  contains BOTH a structural rule (e.g. `.theme-claude .md-content`) AND a dark `:root` override
  (e.g. the dark `--bg` value); `shikiTheme` is a parsed object (dark code palette); `mermaid`
  is an object.
- `loadTheme('claude')`: `scopeClass === 'claude'` (unchanged); still renders as before.
- Claude refactor is output-preserving: regenerate `test/__snapshots__/snapshot.test.ts.snap`
  and confirm the change is ONLY the `:root` variable additions + inline→`var()` substitutions
  (no rendered color changed; `<body class="theme-claude">` and body markup unchanged). Each new
  var's value equals the hex it replaced.
- `assembleDocument` uses `theme.scopeClass` (Claude still emits `theme-claude`).
- **Visual verification** (controller): `node dist/cli.js samples/demo.md --theme claude-dark`
  (and the diagram sample) → dark, warm, readable; prose/links/headings, code block, all five
  callouts, table, checkboxes, TOC, math, and a Mermaid diagram are dark-themed and cohesive,
  with adequate contrast.

## Contract

`THEME-CONTRACT.md` documents:
- the optional `extends` manifest field (inherit base CSS + scope class; other fields are own),
- that a theme's body scope class is its base's when it extends (so structural selectors apply).

## Out of scope (v1, YAGNI)

- Automatic OS dark-mode detection (`prefers-color-scheme`)
- In-page light/dark toggle (would need JS)
- Light/dark `@media` blocks inside one theme
- More than the single `claude-dark` theme (the mechanism enables future ones)
- Multi-level inheritance chains (only one `extends` level needed now)

## Forward compatibility

- The `extends` mechanism + fully-variable Claude make any future theme (light or dark) a thin
  palette override.
