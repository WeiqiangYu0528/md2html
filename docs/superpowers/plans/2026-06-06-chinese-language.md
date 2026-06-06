# Chinese Language Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Chinese Markdown into HTML with comfortable CJK typography, driven by automatic language detection, and ship a Simplified-Chinese README.

**Architecture:** The converter detects the document language (frontmatter `lang:` override, else a CJK-ideograph ratio) and sets `<html lang="…">` — purely semantic. All Chinese presentation lives in the Claude theme, gated on `:lang(zh)`; CJK serif fonts are appended to the global font stacks (per-glyph fallback). The parse/assemble layers stay presentation-free.

**Tech Stack:** TypeScript (ESM, strict). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-06-chinese-language-design.md`

---

## Key facts (current code, verified)

- `src/convert.ts` returns `{ metadata, bodyHtml, hasMath }`; parses via `parseFrontmatter(raw)` giving `{ metadata, content }`.
- `src/assemble.ts` `AssembleInput` has `{ title, bodyHtml, theme, headerTitle?, fontFaceCss?, katexCss? }`; the shell hardcodes `<html lang="en">` (line 21); it already has an `escapeHtml()` helper.
- `src/cli.ts` destructures `const { metadata, bodyHtml, hasMath } = await convert(...)` and calls `assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss })`.
- `themes/claude/theme.css`: body font is `font: 18px/1.75 Georgia, 'Iowan Old Style', 'Tiempos Text', 'Times New Roman', serif;` (line 24); `.theme-claude .md-content { max-width: 64ch; … }` (line 30); heading `font-family: Georgia, 'Tiempos Headline', serif;` (line 40) with `letter-spacing: -0.01em` (line 43).
- The kitchen-sink snapshot (`test/__snapshots__/snapshot.test.ts.snap`) inlines the FULL `theme.css`, so ANY theme.css edit requires regenerating it (Task 5). The kitchen-sink fixture is English, so `<html lang="en">` in that snapshot will not change.

## File structure

- **Create** `src/lang.ts` — `detectLang(content, metadata): string` (single responsibility: language detection).
- **Modify** `src/convert.ts` — add `lang` to `ConvertResult`.
- **Modify** `src/assemble.ts` — add `lang?: string`, emit it in `<html lang>`.
- **Modify** `src/cli.ts` — thread `lang` from convert to assemble.
- **Modify** `themes/claude/theme.css` — CJK font stack + `:lang(zh)` rules.
- **Modify** `THEME-CONTRACT.md` — a Language note.
- **Create** `README.zh-CN.md`; **Modify** `README.md` — switcher line.
- **Create** `samples/sample.zh.md` — Chinese visual-verification sample.
- **Create** `test/lang.test.ts`; **Modify** `test/convert.test.ts`, `test/assemble.test.ts`, `test/cli.test.ts`.

---

### Task 1: `detectLang` module

**Files:** Create `src/lang.ts`; Create `test/lang.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `test/lang.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { detectLang } from '../src/lang'

describe('detectLang', () => {
  it('detects predominantly Chinese content as zh', () => {
    expect(detectLang('这是一篇用中文写成的文章，讲述排版之美。', {})).toBe('zh')
  })

  it('detects English content as en', () => {
    expect(detectLang('This is an English document about typography.', {})).toBe('en')
  })

  it('treats heavily bilingual (>=30% CJK) content as zh', () => {
    // ~12 CJK chars vs ~16 latin letters -> ratio ~0.43 -> zh
    expect(detectLang('Markdown 转换为 HTML 的中文排版示例 demo', {})).toBe('zh')
  })

  it('treats English with a few stray Chinese characters as en', () => {
    expect(detectLang('A long English sentence that merely mentions 你好 once.', {})).toBe('en')
  })

  it('lets an explicit frontmatter lang override detection', () => {
    expect(detectLang('All English content here.', { lang: 'ja' })).toBe('ja')
  })

  it('returns en for empty / letter-free content (no divide-by-zero)', () => {
    expect(detectLang('   123 !!! ---', {})).toBe('en')
    expect(detectLang('', {})).toBe('en')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/lang.test.ts` → expect FAIL (module missing).

- [ ] **Step 3: Implement** — Create `src/lang.ts`:
```ts
/**
 * Determine a document's language for the `<html lang>` attribute.
 *
 * An explicit frontmatter `lang:` always wins. Otherwise we auto-detect by
 * comparing CJK ideographs to Latin letters: if at least 30% of the letters are
 * Chinese, the document reads as Chinese ('zh'). This ignores a few stray
 * Chinese names in an English document while catching genuinely Chinese or
 * heavily bilingual prose. Detection only ever yields 'zh' or 'en'.
 *
 * This is semantic metadata, not presentation — the theme owns all CJK styling.
 */
export function detectLang(content: string, metadata: Record<string, unknown>): string {
  if (typeof metadata.lang === 'string' && metadata.lang.trim() !== '') {
    return metadata.lang.trim()
  }
  const cjk = (content.match(/[一-鿿㐀-䶿]/g) ?? []).length
  const latin = (content.match(/[A-Za-z]/g) ?? []).length
  const total = cjk + latin
  if (cjk > 0 && total > 0 && cjk / total >= 0.3) return 'zh'
  return 'en'
}
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/lang.test.ts` → expect PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lang.ts test/lang.test.ts
git commit -m "feat(i18n): detectLang — auto-detect document language (zh/en) with frontmatter override"
```

---

### Task 2: `convert()` returns `lang`

**Files:** Modify `src/convert.ts`; Modify `test/convert.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/convert.test.ts` (inside its existing `describe`):
```ts
  it('reports the detected language', async () => {
    const zh = await convert('这是一篇中文文档，用于测试语言检测。', 'vitesse-dark')
    expect(zh.lang).toBe('zh')
    const en = await convert('A plain English document.', 'vitesse-dark')
    expect(en.lang).toBe('en')
  })

  it('honors an explicit frontmatter lang', async () => {
    const { lang } = await convert('---\nlang: zh\n---\nMostly English body.', 'vitesse-dark')
    expect(lang).toBe('zh')
  })
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/convert.test.ts` → expect FAIL (`lang` undefined).

- [ ] **Step 3: Implement** — In `src/convert.ts`:

(a) Add the import after the existing imports:
```ts
import { detectLang } from './lang'
```
(b) Add `lang` to the interface — change:
```ts
export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
}
```
to:
```ts
export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
  /** Document language for <html lang> (frontmatter lang, else auto-detected). */
  lang: string
}
```
(c) Compute and return it — change the function body's tail:
```ts
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  return { metadata, bodyHtml, hasMath }
```
to:
```ts
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  const lang = detectLang(content, metadata)
  return { metadata, bodyHtml, hasMath, lang }
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/convert.test.ts` → expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/convert.ts test/convert.test.ts
git commit -m "feat(i18n): convert() reports detected document language"
```

---

### Task 3: `assembleDocument` sets `<html lang>`

**Files:** Modify `src/assemble.ts`; Modify `test/assemble.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/assemble.test.ts` (inside its existing `describe`):
```ts
  it('sets <html lang> from the lang input', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme, lang: 'zh' })
    expect(html).toContain('<html lang="zh">')
  })

  it('defaults <html lang> to en when lang is omitted', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme })
    expect(html).toContain('<html lang="en">')
  })
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/assemble.test.ts` → expect FAIL (`lang: 'zh'` ignored; `<html lang="zh">` absent).

- [ ] **Step 3: Implement** — In `src/assemble.ts`:

(a) Add a field to `AssembleInput` after `katexCss`:
```ts
  /** Document language for the <html lang> attribute (default "en"). */
  lang?: string
```
(b) Update the destructuring line:
```ts
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '', katexCss = '', lang = 'en' } = input
```
(c) Change the shell line `<html lang="en">` to:
```ts
<html lang="${escapeHtml(lang)}">
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/assemble.test.ts` → expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/assemble.ts test/assemble.test.ts
git commit -m "feat(i18n): assembleDocument emits <html lang> from the lang input"
```

---

### Task 4: CLI threads `lang` through

**Files:** Modify `src/cli.ts`; Modify `test/cli.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/cli.test.ts` (inside the `describe('cli run()', …)` block; it already imports `readFileSync` and has the `tmpFile` helper):
```ts
  it('sets <html lang="zh"> for a Chinese document and en for English', async () => {
    const zhIn = tmpFile('zh.md', '# 标题\n\n这是一篇用于测试的中文文档，内容足够多以触发语言检测。')
    expect(await run([zhIn])).toBe(0)
    const zhHtml = readFileSync(zhIn.replace(/\.md$/, '.html'), 'utf8')
    expect(zhHtml).toContain('<html lang="zh">')

    const enIn = tmpFile('en.md', '# Title\n\nThis is an ordinary English document.')
    expect(await run([enIn])).toBe(0)
    const enHtml = readFileSync(enIn.replace(/\.md$/, '.html'), 'utf8')
    expect(enHtml).toContain('<html lang="en">')
  })
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/cli.test.ts` → expect FAIL (zh output still `<html lang="en">`).

- [ ] **Step 3: Implement** — In `src/cli.ts`:

(a) Add `lang` to the convert destructure — change:
```ts
  const { metadata, bodyHtml, hasMath } = await convert(raw, theme.shikiTheme)
```
to:
```ts
  const { metadata, bodyHtml, hasMath, lang } = await convert(raw, theme.shikiTheme)
```
(b) Add `lang` to the `assembleDocument({ … })` call — change:
```ts
  const html = assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss })
```
to:
```ts
  const html = assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang })
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/cli.test.ts` → expect PASS.

- [ ] **Step 5: Run the full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass, no type errors.

- [ ] **Step 6: Commit**
```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat(i18n): CLI threads detected language into <html lang>"
```

---

### Task 5: Claude theme — CJK typography + sample + snapshot

**Files:** Modify `themes/claude/theme.css`; Create `samples/sample.zh.md`; Modify `test/__snapshots__/snapshot.test.ts.snap`.

**Architectural guardrail:** CSS changes go ONLY in `themes/claude/theme.css`. Do NOT add presentation to `src/`. Append the CJK serif families; never embed CJK fonts.

- [ ] **Step 1: Append CJK serifs to the body font stack.** In `themes/claude/theme.css`, change line 24:
```css
  font: 18px/1.75 Georgia, 'Iowan Old Style', 'Tiempos Text', 'Times New Roman', serif;
```
to:
```css
  font: 18px/1.75 Georgia, 'Iowan Old Style', 'Tiempos Text', 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'STSong', SimSun, serif;
```

- [ ] **Step 2: Append CJK serifs to the heading font stack.** Change the heading `font-family` line:
```css
  font-family: Georgia, 'Tiempos Headline', serif;
```
to:
```css
  font-family: Georgia, 'Tiempos Headline', 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'STSong', SimSun, serif;
```

- [ ] **Step 3: Append the `:lang(zh)` reading-adjustment block at the END of `themes/claude/theme.css`:**
```css

/* Chinese / CJK typography. Applied only when the document language is Chinese
   (the converter sets <html lang="zh"> from frontmatter or auto-detection). The
   CJK serif fonts live in the global font stacks above; these rules tune the
   reading experience for Chinese prose: justified text, a narrower measure
   (~36 full-width chars/line), more leading, and correct line-breaking. */
.theme-claude:lang(zh) { line-height: 1.85; line-break: strict; }
.theme-claude:lang(zh) .md-content { max-width: 36em; }
.theme-claude:lang(zh) p,
.theme-claude:lang(zh) li { text-align: justify; }
.theme-claude:lang(zh) h1, .theme-claude:lang(zh) h2, .theme-claude:lang(zh) h3,
.theme-claude:lang(zh) h4, .theme-claude:lang(zh) h5, .theme-claude:lang(zh) h6 {
  letter-spacing: normal;
}
```

- [ ] **Step 4: Create the Chinese sample.** Create `samples/sample.zh.md`:
````markdown
---
title: 中文排版示例
---

这是一个用于检验 **Claude 主题**中文排版效果的示例文档。好的排版应当让阅读变得轻松自然，让读者的目光顺畅地滑过每一行文字，而不必与页面较劲。

## 段落与行文

中文正文采用两端对齐，字体回退到衬线宋体，行高略微放宽，以便长文阅读时眼睛不易疲劳。即使在中文段落里夹杂一些 English words 或 `inline code`，也应当排布得当、互不干扰。

## 列表

- 第一步：解析 Markdown 源文件
- 第二步：套用所选主题的样式
- 第三步：输出单一、自包含的 HTML 文件

## 代码

```ts
const greeting = '你好，世界'
console.log(greeting)
```

## 引用

> 好的排版是隐形的——你只会觉得阅读毫不费力，而不会注意到排版本身。
````

- [ ] **Step 5: Build, render the sample, and verify structure.** Run:
```bash
npm run build && node dist/cli.js samples/sample.zh.md
grep -c '<html lang="zh">' samples/sample.zh.html
grep -c 'Songti SC' samples/sample.zh.html
grep -c ':lang(zh)' samples/sample.zh.html
```
Expected: first count = 1 (auto-detected Chinese); second ≥ 1 (CJK font stack inlined); third ≥ 1 (the lang rules are present in the inlined theme CSS). If the first is 0, STOP and report.

- [ ] **Step 6: Regenerate the kitchen-sink snapshot** (theme.css changed, so the inlined CSS in the snapshot changed; the English fixture's `<html lang="en">` is unaffected):
```bash
npx vitest run test/snapshot.test.ts --update-snapshots
```
Then confirm the diff is ONLY CSS: `git diff test/__snapshots__/snapshot.test.ts.snap` should show exactly two kinds of additions inside the inlined `<style>` block — (1) the CJK font families appended to the body and heading font stacks, and (2) the new `:lang(zh)` rule block (which legitimately includes `text-align: justify`, `max-width: 36em`, etc. as `:lang(zh)`-scoped rules — that is expected). The snapshot's `<html lang="…">` line must remain `en` (the kitchen-sink fixture is English), and the rendered document body HTML must be unchanged. If anything beyond the inlined-CSS additions changed, STOP and report.

- [ ] **Step 7: Run the full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass.

- [ ] **Step 8: Commit**
```bash
git add themes/claude/theme.css samples/sample.zh.md test/__snapshots__/snapshot.test.ts.snap
git commit -m "feat(i18n): Chinese CJK typography in the Claude theme + sample"
```

---

### Task 6: Theme contract + Chinese README

**Files:** Modify `THEME-CONTRACT.md`; Modify `README.md`; Create `README.zh-CN.md`.

- [ ] **Step 1: Add a Language note to the contract.** In `THEME-CONTRACT.md`, add a new section after the `## Element hooks` section (before `## theme.json`):
```markdown
## Language

The document shell carries `<html lang="…">`. The converter sets it from an explicit
frontmatter `lang:` field, or — when absent — auto-detects Chinese vs English from the
content (`zh` / `en`). Themes may key presentation off `:lang(...)` (the Claude theme uses
`:lang(zh)` for CJK typography). The `lang` attribute is the stable hook; detection lives
entirely in the converter.
```

- [ ] **Step 2: Add a language switcher to the English README.** In `README.md`, insert a switcher line immediately after the H1 `# md2html` line (so it sits above the `>` tagline), with a blank line on each side:
```markdown
[English](README.md) · [简体中文](README.zh-CN.md)
```

- [ ] **Step 3: Create `README.zh-CN.md`** — a faithful Simplified-Chinese translation of `README.md`. Read the current `README.md` and translate it with these rules:
  - Translate all prose, headings, and table cell text into natural Simplified Chinese.
  - Keep UNCHANGED: code blocks, shell commands, file paths, option flags (e.g. `--embed-fonts`), URLs, link targets, and proper nouns/product names (`md2html`, `Markdown`, `HTML`, `CSS`, `Shiki`, `Claude`, `Node`, `TypeScript`, `MIT`, `Vitest`).
  - Keep the same section order and the same links (e.g. `[THEME-CONTRACT.md](THEME-CONTRACT.md)`, `[MIT](LICENSE)`).
  - The first lines mirror the English file:
    ```markdown
    # md2html

    [English](README.md) · [简体中文](README.zh-CN.md)

    > 把任意 Markdown 文件转换成单一、自包含、赏心悦目的 HTML 页面。
    ```
  - Keep the `<sub>…</sub>` badge line, translating its prose (e.g. `Node ≥ 18.3 · TypeScript · 零运行时配置 · MIT 许可`).

- [ ] **Step 4: Verify both READMEs render and link correctly.** Run:
```bash
grep -c '简体中文' README.md
grep -c 'English' README.zh-CN.md
node dist/cli.js README.zh-CN.md && grep -c '<html lang="zh">' README.zh-CN.html
```
Expected: first = 1 (switcher in English README), second ≥ 1 (switcher in Chinese README), third = 1 (the Chinese README itself auto-detects as Chinese — a nice end-to-end confirmation). Then remove the generated file: `rm -f README.zh-CN.html`.

- [ ] **Step 5: Commit**
```bash
git add THEME-CONTRACT.md README.md README.zh-CN.md
git commit -m "docs(i18n): Chinese README + language switcher + contract Language note"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all suites pass.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build && node dist/cli.js samples/sample.zh.md` then open `samples/sample.zh.html` — Chinese reads well: justified, serif (宋体), comfortable ~36-char measure and 1.85 leading. (Controller does the visual check.)
- [ ] Confirm an English document still renders identically to before (only `<html lang="en">`, no `:lang(zh)` rules applied).
