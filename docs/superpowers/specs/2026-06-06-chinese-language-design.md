# Chinese Language Support — Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Feature:** Comfortable Chinese (CJK) typography in the Claude theme, driven by automatic language detection — plus a Simplified-Chinese README.

---

## Goal

Make `md2html` render Chinese Markdown into HTML that is genuinely pleasant to read in
Chinese — proper serif characters, a comfortable measure, justified text, and correct
line-breaking — without the author having to configure anything. Ship a Simplified-Chinese
README so Chinese users can read the project docs in their language.

## Summary of decisions

| Decision | Choice |
|---|---|
| Language signal | **Auto-detect** from content (CJK-ideograph ratio), with frontmatter `lang:` as an explicit override |
| Where language lives | Converter sets `<html lang="…">` (semantic); the theme owns all CJK presentation via `:lang(zh)` |
| Chinese paragraph alignment | **Justified** (两端对齐) |
| CJK fonts | System serif stack, appended globally (per-glyph fallback); never embedded |
| README | `README.zh-CN.md`, full Simplified-Chinese translation, with a language switcher on both READMEs |

## Architecture

The product invariant — the parse/assemble layers emit **no presentation** — is preserved.
Determining a document's language and emitting `<html lang>` is *semantic metadata*, not
presentation, so it belongs in the converter. All visual CJK treatment lives in the theme,
gated on `:lang(zh)`. A new theme author gets Chinese support "for free" only if they choose
to add `:lang(...)` rules; the contract simply guarantees the `lang` attribute is set.

### Language detection (`src/lang.ts` — new)

A single pure function:

```
detectLang(content: string, metadata: Record<string, unknown>): string
```

- If `metadata.lang` is a non-empty string, return it verbatim (explicit author override).
- Otherwise count CJK ideographs and Latin letters in `content`:
  - CJK ideographs: characters matching `/[一-鿿㐀-䶿]/`
  - Latin letters: characters matching `/[A-Za-z]/`
  - Let `ratio = cjk / (cjk + latin)` (guard divide-by-zero → 0).
  - If `cjk > 0 && ratio >= 0.3`, return `'zh'`; otherwise return `'en'`.

The 0.3 threshold means a document is treated as Chinese once roughly a third or more of its
letters are Chinese — enough to ignore a few stray Chinese names in an English document, while
catching genuinely Chinese (or heavily bilingual) prose. The returned value is a sanitized
BCP-47-ish token; detection only ever produces `'zh'` or `'en'`, but an explicit frontmatter
`lang:` passes through (e.g. `ja`, `zh-Hant`).

### Conversion result (`src/convert.ts`)

`ConvertResult` gains `lang: string`, computed via `detectLang(content, metadata)`. This sits
alongside the existing `hasMath` flag.

### Assembly (`src/assemble.ts`)

`AssembleInput` gains `lang?: string` (default `'en'`). The document shell's hardcoded
`<html lang="en">` becomes `<html lang="${escaped lang}">`. The value is escaped for the HTML
attribute context (it flows into an attribute, so quotes/`<`/`>`/`&` are escaped exactly as the
title already is).

### CLI (`src/cli.ts`)

Destructure `lang` from the convert result and pass it into `assembleDocument({ … , lang })`.

## Theme typography (`themes/claude/theme.css`)

Two cleanly separated pieces.

### (a) CJK serif font stack — global, ungated

Because CSS font matching is per-glyph, CJK serif families are **appended** to the existing
body and heading font lists. Latin glyphs still resolve to Georgia; only CJK glyphs fall through
to the first CJK serif present on the system. This needs no language gating and benefits any
document containing CJK characters.

- Body & headings append (after the existing Latin serifs):
  `'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'STSong', SimSun, serif`

System fonts only — CJK font files are 5–15 MB, so they are never embedded; `--embed-fonts`
remains Latin-only and is unaffected.

### (b) Document-level Chinese reading adjustments — gated on `:lang(zh)`

Applied only when the whole document is Chinese (so an English document with a stray Chinese
character is untouched). Selectors are `.theme-claude:lang(zh) …`:

- **Justified body text:** `p`, list items → `text-align: justify;`
- **CJK measure:** `.md-content` → `max-width: 36em;` (≈ 36 full-width characters per line,
  overriding the Latin `64ch`)
- **Leading:** body → `line-height: 1.85;` (denser CJK glyphs read better with more leading)
- **Line-breaking:** `line-break: strict;` (correct Chinese punctuation line-break rules)
- **Headings:** `letter-spacing: normal;` (undo the Latin `-0.01em` tightening, wrong for CJK)

Deliberately **not** included: traditional 2em first-line indent (the theme uses paragraph
spacing, matching modern digital-Chinese convention such as 知乎 / 公众号).

### Contract

`THEME-CONTRACT.md` gains a short "Language" note: the converter sets `<html lang="…">` from an
explicit frontmatter `lang:` or, failing that, auto-detection (`zh` vs `en`); themes may key
presentation off `:lang(...)`. The `lang` attribute is the stable hook.

## Chinese README

`README.zh-CN.md` — a complete Simplified-Chinese translation of `README.md` (same structure:
intro, quick start, usage, what it renders, themes, architecture, development, license). Both
READMEs get a language-switcher line directly under the H1:

```
[English](README.md) · [简体中文](README.zh-CN.md)
```

The Chinese README doubles as a real-world CJK test document for visual verification.

## Testing

- `detectLang`:
  - pure Chinese content → `'zh'`
  - pure English content → `'en'`
  - ~30%+ Chinese (bilingual) → `'zh'`
  - English with a couple of Chinese characters (below threshold) → `'en'`
  - explicit frontmatter `lang: ja` overrides detection (content English) → `'ja'`
  - empty / no-letter content → `'en'` (no divide-by-zero)
- `convert()` returns the detected `lang` in its result.
- `assembleDocument` emits `<html lang="zh">` when given `lang: 'zh'`, and defaults to
  `<html lang="en">` when `lang` is omitted.
- CLI round-trip: a Chinese `.md` file produces output containing `<html lang="zh">`; an English
  file produces `<html lang="en">`.
- **Visual verification** (human/controller step): render a Chinese sample (and/or the Chinese
  README) and confirm it reads well — justified, proper serif, comfortable measure and leading.

## Out of scope (v1, YAGNI)

- Embedding CJK fonts (too large)
- Japanese / Korean-specific tuning (the `lang` mechanism is general; only Chinese typography ships)
- Automatic CJK–Latin spacing (`text-autospace` / pangu spacing)
- Traditional first-line-indent paragraph style
- Vertical writing mode (`writing-mode: vertical-rl`)
- Translating docs other than the README

## Forward compatibility

- **Dark mode** (later): independent — CJK rules are about layout/justification/measure, not color.
- **Math, TOC, diagrams:** orthogonal; CJK text coexists with all of them.
