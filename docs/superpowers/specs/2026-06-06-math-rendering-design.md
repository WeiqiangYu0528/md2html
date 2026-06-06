# Math Rendering — Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Feature:** LaTeX math in Markdown → static, self-contained HTML (KaTeX, build-time)

---

## Goal

Let authors write LaTeX math in their Markdown and have it render beautifully in the
output HTML — staying true to the product's core promise: **one self-contained file**
that renders identically anywhere, offline, with no runtime JavaScript.

## Summary of decisions

| Decision | Choice |
|---|---|
| Library | **KaTeX**, rendered at build time (server-side) |
| Output | Static HTML + CSS; **no runtime JS** |
| Font strategy | Inline KaTeX CSS + base64 woff2 fonts **only when the document contains math** |
| Syntax | **Both** delimiter families: `$…$` / `$$…$$` and `\(…\)` / `\[…\]` |
| Error handling | `throwOnError: false` — bad LaTeX renders flagged, never crashes conversion |
| Theme coupling | KaTeX inherits `currentColor` + em sizing; theme adds spacing/overflow only |

## Approach — why KaTeX, build-time

Three options were considered:

1. **KaTeX, build-time (chosen).** The converter bakes each formula into static
   HTML+CSS during conversion. No JavaScript in the output, deterministic, fast. KaTeX
   covers the overwhelming majority of real-world LaTeX math. Aligns with the
   self-contained, zero-runtime ethos.
2. **MathJax at runtime.** Broader LaTeX coverage, but ships runtime JS, causes a flash
   of unrendered math on open, and adds weight. Rejected — violates the static ethos.
3. **MathJax server-side.** Full coverage, SSR like KaTeX, but heavier output and a
   larger dependency. Rejected as overkill for v1.

## Architecture

The two-layer architecture is preserved. Math fits the existing pattern set by Shiki:
the **parse layer emits semantic markup**, and a required **correctness asset** (glyph
metrics CSS + fonts) is inlined at **assemble** time. The theme only tweaks appearance.

### Parse layer (`src/markdown/`)

- A markdown-it math plugin (KaTeX-backed) is registered in `createRenderer`. It
  tokenizes math and renders each formula to KaTeX's static HTML at build time.
- **Delimiter normalization:** all four delimiters map onto a single KaTeX rendering
  path. `\(…\)` is treated as inline, `\[…\]` as display, alongside the native
  `$…$` / `$$…$$`. This is done with markdown-it inline/block rules (not raw-string
  preprocessing), so math delimiters **inside code spans and fenced code blocks are
  never rewritten**.
- The parse layer remains presentation-free: it emits KaTeX class markup only — no
  colors, fonts, or spacing of its own.

### Conversion result (`src/convert.ts`)

- `ConvertResult` gains **`hasMath: boolean`** — true when at least one math token was
  rendered during conversion. This flag is the mechanism for staying lean: it tells the
  assemble layer whether the KaTeX asset needs to be inlined.

### Assemble layer (`src/assemble.ts`)

- KaTeX's stylesheet — with its woff2 fonts **base64-embedded** as data URIs — is a
  shared, **theme-agnostic** asset bundled with the converter (not part of any theme).
- `assembleDocument` inlines this asset into the `<style>` block **only when `hasMath`
  is true**. Non-math documents are byte-for-byte unaffected.
- This is independent of the `--embed-fonts` flag, which governs the *theme's text
  fonts*. Math fonts always embed when math is present, because without them the math is
  not merely unstyled — it is broken. The two font concerns do not interact.

### Where the KaTeX asset comes from

The KaTeX CSS shipped by the `katex` package references external font files. We produce
a **self-contained variant** where each `url(fonts/KaTeX_*.woff2)` is replaced by an
inline `url(data:font/woff2;base64,…)`. This transformed CSS string is what gets inlined
when `hasMath` is true. (Exact build-vs-runtime generation of this string is an
implementation detail for the plan; the woff2-only subset keeps size to roughly a few
hundred KB.)

## Syntax (authoring)

- **Inline math:** `$ … $` or `\( … \)`
- **Display math:** `$$ … $$` or `\[ … \]`
- `\$` produces a literal dollar sign.
- `$…$` only matches with sane boundaries (no match across blank lines; not triggered by
  prose like "it cost $5, then $10"), following the plugin's standard dollar-math rules.

## Theme integration

- KaTeX output inherits `currentColor` and uses em-based sizing, so math automatically
  takes the theme's ink color and matches surrounding text size. When **dark mode**
  arrives, math adapts with no extra work.
- **Theme-contract addition:** display math is wrapped in KaTeX's `.katex-display` block.
  Themes may give it vertical spacing and `overflow-x: auto` so wide equations scroll on
  narrow screens — the same treatment tables (`.table-wrap`) and code blocks already get.
  The Claude theme adds a small, tasteful rule (display-math margin + horizontal scroll);
  the feature renders correctly even with no theme rule at all.
- `THEME-CONTRACT.md` is updated to document the `.katex` / `.katex-display` hooks and to
  note that the KaTeX correctness asset is converter-owned, not theme-owned.

## Error handling

- KaTeX runs with `throwOnError: false`. A malformed formula renders the offending
  source inline in KaTeX's flagged error style (themeable via `.katex-error`) instead of
  aborting the conversion. A document with one bad formula still converts successfully.

## Testing

- Inline math renders (both `$…$` and `\(…\)`).
- Display math renders (both `$$…$$` and `\[…\]`).
- Math delimiters inside inline code and fenced code blocks are left untouched.
- `hasMath` is `true` for a document with math and `false` for one without.
- The KaTeX asset is inlined into output **only** when the document contains math.
- A document with invalid LaTeX converts without throwing and emits a flagged error.
- Snapshot of a math fixture (inline + display) for stable-output regression.

## Out of scope (v1, YAGNI)

- Custom macros / KaTeX config files
- Automatic equation numbering and `\label` / `\ref`
- MathML output
- Per-document font subsetting (we embed the woff2 subset wholesale)

## Forward compatibility

- **Dark mode:** no changes needed — KaTeX inherits color.
- **Chinese / CJK:** independent; math and CJK text coexist without interaction.
