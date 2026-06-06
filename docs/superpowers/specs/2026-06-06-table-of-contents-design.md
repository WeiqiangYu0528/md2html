# Table of Contents — Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Feature:** Auto-generated, responsive table of contents (inline on narrow screens, sticky side-rail on wide), zero runtime JS.

---

## Goal

Give long Markdown documents a navigable table of contents that reads beautifully — an
inline "Contents" block on narrow screens, a sticky side-rail on wide screens — generated
automatically, with no author effort and no runtime JavaScript.

## Summary of decisions

| Decision | Choice |
|---|---|
| Depth | h2 and h3 headings (h1 is the page title; h4+ too granular) |
| Trigger | Auto when ≥3 h2/h3 headings; frontmatter `toc: false` suppresses, `toc: true` forces |
| Placement | Responsive: inline block (narrow) / sticky gutter side-rail (wide) |
| Numbering | None — plain links |
| Title | Localized from detected language: `Contents` (en) / `目录` (zh) |
| Runtime JS | None (CSS smooth-scroll; no scroll-spy active-highlight) |

## Architecture

Consistent with the product invariant: the **converter emits a semantic `<nav>` with stable
class hooks**; the **theme owns all placement and appearance**. Where the nav sits in document
order (after the title, before the body) is structural/semantic, not presentation — so it
belongs in the converter. How it looks and whether it becomes a sidebar is the theme's job
(CSS only).

### `src/toc.ts` (new)

Two pure functions:

- `collectHeadings(tokens: Token[]): Heading[]` — walks the markdown-it token stream for
  `heading_open` tokens at levels h2/h3, reading the heading level from the tag (`h2`/`h3`),
  the `id` from the anchor attribute (markdown-it-anchor already set it), and the text from the
  immediately-following `inline` token's content. Returns `{ level: number; id: string; text: string }[]`.
  - `Heading` interface: `{ level: number; id: string; text: string }`.
- `renderToc(headings: Heading[], lang: string): string` — builds the nested nav HTML, or
  returns `''` if `headings` is empty. Nesting: h2 items at the top level, each followed by a
  nested `<ul>` of its h3 children (until the next h2). Heading text is HTML-escaped; ids go into
  `href="#id"`. The title comes from a small map: `zh → 目录`, else `Contents`.

Markup produced:
```html
<nav class="toc" aria-label="Table of contents">
<p class="toc-title">Contents</p>
<ul>
<li><a href="#intro">Intro</a></li>
<li><a href="#usage">Usage</a>
<ul>
<li><a href="#flags">Flags</a></li>
</ul>
</li>
</ul>
</nav>
```

### `src/convert.ts`

- Switch from `md.render(content)` to `md.parse(content, env)` + `md.renderer.render(tokens, md.options, env)` so the same pass yields both the body HTML and the heading tokens. (Use a fresh `env = {}`.)
- Compute the TOC:
  - `headings = collectHeadings(tokens)` filtered to h2/h3.
  - Decide whether to emit, via `shouldEmitToc(metadata.toc, headings.length)`:
    - `metadata.toc === false` → never.
    - `metadata.toc === true` → always (if there is at least one heading).
    - otherwise → only when `headings.length >= 3`.
  - `toc = shouldEmitToc(...) ? renderToc(headings, lang) : ''`.
- `ConvertResult` gains `toc: string` (alongside `bodyHtml`, `hasMath`, `lang`).

### `src/assemble.ts`

- `AssembleInput` gains `toc?: string` (default `''`).
- The article becomes `<article class="md-content">\n${header}${toc}${bodyHtml}\n</article>` — the
  TOC is injected after the optional header and before the body, so narrow-screen stacking is
  *Title → Contents → body* with no layout code.

### `src/cli.ts`

Destructure `toc` from the convert result; pass it into `assembleDocument({ …, toc })`.

## Theme (Claude) — `themes/claude/theme.css`

Mobile-first, zero-JS:

- **Default (narrow):** `.toc` is a calm block under the title — a bordered/tinted "Contents"
  panel within the reading measure. `.toc-title` styled like a small heading; `.toc ul` with
  comfortable list spacing; nested `<ul>` indented; `.toc a` in the muted/ink color, accent on
  hover; markers removed (it's a nav, not a bullet list).
- **Wide screens (`@media (min-width: ~1100px)`):** promote `.toc` to a sticky side-rail —
  `position: sticky; top: …;` pulled into the left gutter via `float: left` + a negative
  left margin sized to the gutter, with a fixed rail width (~200px). It stays visible while the
  centered column scrolls. Below the breakpoint none of this applies (plain inline block).
- **Smooth scroll & anchor offset:** `html { scroll-behavior: smooth; }` and a `scroll-margin-top`
  on headings so a jumped-to heading isn't clipped.
- No scroll-spy / active-section highlight (would require JS).

`THEME-CONTRACT.md` documents the `.toc` and `.toc-title` hooks (a converter-emitted nav the
theme styles and may reposition).

## Testing

- `collectHeadings`: extracts level/id/text for h2/h3 from a parsed token stream; ignores h1 and
  h4+.
- `renderToc`: correct nested structure (h3 nested under preceding h2); links use `#id`; text is
  escaped; title is `Contents` for en and `目录` for zh; returns `''` for empty input.
- Trigger logic: 2 headings → no TOC; 3 headings → TOC; `toc: false` with many headings → none;
  `toc: true` with 1 heading → TOC.
- `convert()` returns the expected `toc` string (present / empty) for representative inputs.
- `assembleDocument` injects the TOC between the header and the body when provided, and omits it
  when empty.
- CLI end-to-end: a multi-heading document's output contains `<nav class="toc">`; a 1-heading
  document's output does not.
- **Visual verification** (controller): inline "Contents" block on a narrow viewport; sticky
  side-rail on a wide viewport; links jump to the right headings; reads well in the Claude theme.

## Out of scope (v1, YAGNI)

- Scroll-spy / active-section highlighting (needs JS)
- Heading numbering
- Configurable depth (fixed h2–h3) or a `[[toc]]` placement marker
- Collapsible/expandable TOC sections
- TOC for h1-only documents (use h2 for sections)

## Forward compatibility

- **Dark mode** (later): independent — TOC colors come from theme variables, so it adapts for free.
- **Math / CJK:** orthogonal; a Chinese document gets a `目录` panel; math headings appear like any other.
