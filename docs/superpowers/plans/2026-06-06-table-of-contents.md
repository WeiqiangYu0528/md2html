# Table of Contents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate a responsive table of contents (inline block on narrow screens, sticky side-rail on wide), with zero runtime JS.

**Architecture:** A new `src/toc.ts` collects h2/h3 headings from the markdown-it token stream and renders a semantic `<nav class="toc">`. `convert()` switches to `md.parse()` + `md.renderer.render()` (sharing one `env`) so it can both render the body and read heading tokens; it applies the trigger logic and returns `toc`. `assemble` injects the nav after the header. The Claude theme styles it and makes it responsive — converter stays presentation-free.

**Tech Stack:** TypeScript (ESM, strict), markdown-it (already a dependency). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-06-table-of-contents-design.md`

---

## Key facts (verified)

- `Token` is the default export of `markdown-it/lib/token.mjs`; type it via `import type Token from 'markdown-it/lib/token.mjs'`.
- `md.parse(src, env): Token[]`; `md.renderer.render(tokens, md.options, env): string`. `md.render(src)` is exactly `renderer.render(parse(src, {}), options, {})`, so refactoring to an explicit shared `env` is behavior-preserving (footnotes etc. unaffected).
- `markdown-it-anchor` runs as a core (parse-time) rule, so after `md.parse` each `heading_open` token already carries its `id` attribute (`tok.attrGet('id')`). The heading tag is `tok.tag` (`'h2'`/`'h3'`). The text is in the following `inline` token (`tokens[i+1]`, `.children` for formatted text).
- The kitchen-sink fixture has **5 h2 headings** (≥3) and frontmatter + a footnote. After the convert refactor its rendered body is byte-identical (so the existing snapshot still passes WITHOUT regen at that step). The TOC styling task later updates the snapshot test to pass `toc` and regenerates.
- `src/convert.ts` currently: `const bodyHtml = md.render(content)`, returns `{ metadata, bodyHtml, hasMath, lang }`.
- `src/assemble.ts` shell: `<article class="md-content">\n${header}${bodyHtml}\n</article>`; has `escapeHtml`; `AssembleInput` has `{ …, fontFaceCss?, katexCss?, lang? }`.
- `src/cli.ts`: `const { metadata, bodyHtml, hasMath, lang } = await convert(...)`; `assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang })`.

## File structure

- **Create** `src/toc.ts` — `Heading`, `collectHeadings`, `renderToc`, `buildToc` (the whole TOC concern).
- **Modify** `src/convert.ts` — parse+render with shared env; return `toc`.
- **Modify** `src/assemble.ts` — inject `toc` after the header.
- **Modify** `src/cli.ts` — thread `toc`.
- **Modify** `themes/claude/theme.css` — TOC styles + responsive side-rail + smooth scroll.
- **Modify** `test/__snapshots__/snapshot.test.ts.snap` and `test/snapshot.test.ts` — pass `toc`, regenerate.
- **Modify** `THEME-CONTRACT.md` — `.toc` hooks.
- **Create** `test/toc.test.ts`; **Modify** `test/convert.test.ts`, `test/assemble.test.ts`, `test/cli.test.ts`.

---

### Task 1: `collectHeadings`

**Files:** Create `src/toc.ts`; Create `test/toc.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `test/toc.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'
import { collectHeadings } from '../src/toc'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('collectHeadings', () => {
  it('collects h2 and h3 with id and text, ignoring h1 and h4', () => {
    const tokens = md.parse('# Title\n\n## Intro\n\n### Details\n\n## Usage\n\n#### Tiny', {})
    const headings = collectHeadings(tokens)
    expect(headings).toEqual([
      { level: 2, id: 'intro', text: 'Intro' },
      { level: 3, id: 'details', text: 'Details' },
      { level: 2, id: 'usage', text: 'Usage' },
    ])
  })

  it('extracts plain text from formatted headings (strips markup)', () => {
    const tokens = md.parse('## A **bold** and `code` word', {})
    expect(collectHeadings(tokens)[0].text).toBe('A bold and code word')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/toc.test.ts` → expect FAIL (module missing).

- [ ] **Step 3: Implement** — Create `src/toc.ts`:
```ts
import type Token from 'markdown-it/lib/token.mjs'

export interface Heading {
  level: number
  id: string
  text: string
}

/** Plain text of a heading's inline token (strips bold/italic/etc. markup). */
function headingText(inline: Token): string {
  const children = inline.children ?? []
  const parts = children
    .filter((t) => t.type === 'text' || t.type === 'code_inline')
    .map((t) => t.content)
  return parts.length > 0 ? parts.join('') : inline.content
}

/** Collect h2 and h3 headings (with their anchor ids) from a parsed token stream. */
export function collectHeadings(tokens: Token[]): Heading[] {
  const headings: Heading[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type !== 'heading_open') continue
    const level = tok.tag === 'h2' ? 2 : tok.tag === 'h3' ? 3 : 0
    if (level === 0) continue
    const id = tok.attrGet('id') ?? ''
    const inline = tokens[i + 1]
    const text = inline && inline.type === 'inline' ? headingText(inline) : ''
    if (id) headings.push({ level, id, text })
  }
  return headings
}
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/toc.test.ts` → expect PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/toc.ts test/toc.test.ts
git commit -m "feat(toc): collectHeadings — extract h2/h3 headings from the token stream"
```

---

### Task 2: `renderToc`

**Files:** Modify `src/toc.ts`; Modify `test/toc.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/toc.test.ts` (add `renderToc` to the import from `'../src/toc'`, then add a new describe):
```ts
describe('renderToc', () => {
  const headings = [
    { level: 2, id: 'intro', text: 'Intro' },
    { level: 2, id: 'usage', text: 'Usage' },
    { level: 3, id: 'flags', text: 'Flags' },
  ]

  it('renders a nested nav with localized title and anchor links', () => {
    const html = renderToc(headings, 'en')
    expect(html).toContain('<nav class="toc" aria-label="Table of contents">')
    expect(html).toContain('<p class="toc-title">Contents</p>')
    expect(html).toContain('<a href="#intro">Intro</a>')
    expect(html).toContain('<a href="#flags">Flags</a>')
    // the h3 'Flags' must be nested inside the 'Usage' h2 item
    expect(html).toMatch(/Usage<\/a>\s*<ul>\s*<li><a href="#flags">Flags<\/a><\/li>/)
  })

  it('localizes the title to 目录 for zh', () => {
    expect(renderToc(headings, 'zh')).toContain('<p class="toc-title">目录</p>')
  })

  it('escapes heading text and returns empty string for no headings', () => {
    expect(renderToc([{ level: 2, id: 'x', text: 'A & <b>' }], 'en')).toContain('A &amp; &lt;b&gt;')
    expect(renderToc([], 'en')).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/toc.test.ts` → expect FAIL (`renderToc` not exported).

- [ ] **Step 3: Implement** — Add to `src/toc.ts`:
```ts
const TOC_TITLES: Record<string, string> = { zh: '目录' }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render a nested TOC nav from h2/h3 headings. h3s nest under the preceding h2;
 * an h3 with no preceding h2 degrades to a top-level item. Returns '' if empty.
 */
export function renderToc(headings: Heading[], lang: string): string {
  if (headings.length === 0) return ''
  const title = TOC_TITLES[lang] ?? 'Contents'
  const out: string[] = []
  let inLi = false   // a top-level <li> is open
  let inSub = false  // a nested <ul> inside the current <li> is open

  const closeSub = () => { if (inSub) { out.push('</ul>'); inSub = false } }
  const closeLi = () => { closeSub(); if (inLi) { out.push('</li>'); inLi = false } }

  for (const h of headings) {
    const link = `<a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a>`
    if (h.level === 2) {
      closeLi()
      out.push(`<li>${link}`)
      inLi = true
    } else {
      if (!inLi) { out.push(`<li>${link}</li>`); continue }
      if (!inSub) { out.push('<ul>'); inSub = true }
      out.push(`<li>${link}</li>`)
    }
  }
  closeLi()

  return (
    `<nav class="toc" aria-label="Table of contents">\n` +
    `<p class="toc-title">${title}</p>\n` +
    `<ul>\n${out.join('\n')}\n</ul>\n</nav>\n`
  )
}
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/toc.test.ts` → expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/toc.ts test/toc.test.ts
git commit -m "feat(toc): renderToc — nested nav with localized title and escaped links"
```

---

### Task 3: `buildToc` (trigger logic)

**Files:** Modify `src/toc.ts`; Modify `test/toc.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/toc.test.ts` (add `buildToc` to the import; it uses the `md` from the top-level `beforeAll`):
```ts
describe('buildToc trigger', () => {
  const parse = (src: string) => md.parse(src, {})

  it('emits a TOC when there are 3+ headings', () => {
    const html = buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en' })
    expect(html).toContain('<nav class="toc"')
  })

  it('emits nothing for fewer than 3 headings by default', () => {
    expect(buildToc(parse('## A\n\n## B'), { lang: 'en' })).toBe('')
  })

  it('toc:false suppresses even with many headings', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', toc: false })).toBe('')
  })

  it('toc:true forces a TOC even with one heading', () => {
    expect(buildToc(parse('## Only'), { lang: 'en', toc: true })).toContain('<nav class="toc"')
  })

  it('emits nothing when there are no headings', () => {
    expect(buildToc(parse('Just text.'), { lang: 'en', toc: true })).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/toc.test.ts` → expect FAIL (`buildToc` not exported).

- [ ] **Step 3: Implement** — Add to `src/toc.ts`:
```ts
/**
 * Build the TOC nav for a parsed document, applying the trigger rules:
 * `toc: false` suppresses; `toc: true` forces (when there is ≥1 heading);
 * otherwise a TOC appears only with 3+ headings.
 */
export function buildToc(tokens: Token[], opts: { lang: string; toc?: unknown }): string {
  if (opts.toc === false) return ''
  const headings = collectHeadings(tokens)
  if (headings.length === 0) return ''
  const force = opts.toc === true
  if (!force && headings.length < 3) return ''
  return renderToc(headings, opts.lang)
}
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/toc.test.ts` → expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/toc.ts test/toc.test.ts
git commit -m "feat(toc): buildToc — auto-trigger at 3+ headings with frontmatter override"
```

---

### Task 4: `convert()` — parse/render split + `toc`

**Files:** Modify `src/convert.ts`; Modify `test/convert.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/convert.test.ts` (inside its existing `describe`):
```ts
  it('returns a TOC for a multi-heading document', async () => {
    const { toc } = await convert('## One\n\n## Two\n\n## Three', 'vitesse-dark')
    expect(toc).toContain('<nav class="toc"')
    expect(toc).toContain('<a href="#one">One</a>')
  })

  it('returns an empty toc for a short document', async () => {
    const { toc } = await convert('# Title\n\nBody only.', 'vitesse-dark')
    expect(toc).toBe('')
  })

  it('honors frontmatter toc:false', async () => {
    const { toc } = await convert('---\ntoc: false\n---\n## A\n\n## B\n\n## C', 'vitesse-dark')
    expect(toc).toBe('')
  })
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/convert.test.ts` → expect FAIL (`toc` undefined).

- [ ] **Step 3: Implement** — In `src/convert.ts`:

(a) Add the import after the existing imports:
```ts
import { buildToc } from './toc'
```
(b) Add `toc` to `ConvertResult` (after `lang`):
```ts
  /** Table-of-contents nav HTML, or '' when no TOC is generated. */
  toc: string
```
(c) Replace the body's render section. Change:
```ts
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  const bodyHtml = md.render(content)
  // texmath wraps inline math in <eq> and display math in <eqn>; these tags are
  // emitted only for real math (never for $…$ inside code), so they are a
  // reliable, cheap signal that the KaTeX stylesheet needs to be inlined.
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  const lang = detectLang(content, metadata)
  return { metadata, bodyHtml, hasMath, lang }
```
to:
```ts
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  // Parse once, then render the body AND read the heading tokens for the TOC.
  // A shared env preserves footnote/anchor behavior (md.render does the same).
  const env: Record<string, unknown> = {}
  const tokens = md.parse(content, env)
  const bodyHtml = md.renderer.render(tokens, md.options, env)
  // texmath wraps inline math in <eq> and display math in <eqn>; these tags are
  // emitted only for real math (never for $…$ inside code), so they are a
  // reliable, cheap signal that the KaTeX stylesheet needs to be inlined.
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  const lang = detectLang(content, metadata)
  const toc = buildToc(tokens, { lang, toc: metadata.toc })
  return { metadata, bodyHtml, hasMath, lang, toc }
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/convert.test.ts` → expect PASS.

- [ ] **Step 5: Verify the refactor is behavior-preserving** — Run: `npx vitest run test/snapshot.test.ts` → expect PASS with NO snapshot update (the kitchen-sink body is byte-identical because the snapshot test does not yet pass `toc`). If the snapshot fails here, the env threading is wrong — STOP and report (do NOT update the snapshot in this task).

- [ ] **Step 6: Commit**
```bash
git add src/convert.ts test/convert.test.ts
git commit -m "feat(toc): convert() builds the TOC from parsed tokens (shared env)"
```

---

### Task 5: `assembleDocument` — inject the TOC

**Files:** Modify `src/assemble.ts`; Modify `test/assemble.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/assemble.test.ts` (inside its existing `describe`):
```ts
  it('injects the TOC between the header and the body when provided', () => {
    const html = assembleDocument({
      title: 'T', headerTitle: 'T', bodyHtml: '<p>Body</p>', theme,
      toc: '<nav class="toc">TOC</nav>',
    })
    expect(html).toContain('<nav class="toc">TOC</nav>')
    // order: header h1, then toc, then body
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<nav class="toc">'))
    expect(html.indexOf('<nav class="toc">')).toBeLessThan(html.indexOf('<p>Body</p>'))
  })

  it('omits the TOC when not provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '<p>Body</p>', theme })
    expect(html).not.toContain('class="toc"')
  })
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/assemble.test.ts` → expect FAIL.

- [ ] **Step 3: Implement** — In `src/assemble.ts`:

(a) Add to `AssembleInput` after `lang?`:
```ts
  /** Table-of-contents nav HTML, injected after the header (default ""). */
  toc?: string
```
(b) Update the destructuring to add `toc = ''`:
```ts
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '', katexCss = '', lang = 'en', toc = '' } = input
```
(c) Change the article line. Change:
```ts
<article class="md-content">
${header}${bodyHtml}
</article>
```
to:
```ts
<article class="md-content">
${header}${toc}${bodyHtml}
</article>
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/assemble.test.ts` → expect PASS.

- [ ] **Step 5: Commit**
```bash
git add src/assemble.ts test/assemble.test.ts
git commit -m "feat(toc): assembleDocument injects the TOC after the header"
```

---

### Task 6: CLI threads the TOC

**Files:** Modify `src/cli.ts`; Modify `test/cli.test.ts`.

- [ ] **Step 1: Write the failing test** — Append to `test/cli.test.ts` (inside the `describe('cli run()', …)` block):
```ts
  it('includes a TOC for a multi-heading document and omits it for a short one', async () => {
    const longIn = tmpFile('toc.md', '# Doc\n\n## Alpha\n\n## Beta\n\n## Gamma\n\ntext')
    expect(await run([longIn])).toBe(0)
    const longHtml = readFileSync(longIn.replace(/\.md$/, '.html'), 'utf8')
    expect(longHtml).toContain('<nav class="toc"')

    const shortIn = tmpFile('short.md', '# Doc\n\n## Only one\n\ntext')
    expect(await run([shortIn])).toBe(0)
    const shortHtml = readFileSync(shortIn.replace(/\.md$/, '.html'), 'utf8')
    expect(shortHtml).not.toContain('<nav class="toc"')
  })
```

- [ ] **Step 2: Run the test to verify it fails** — Run: `npx vitest run test/cli.test.ts` → expect FAIL (no TOC in output).

- [ ] **Step 3: Implement** — In `src/cli.ts`:

(a) Add `toc` to the convert destructure:
```ts
  const { metadata, bodyHtml, hasMath, lang, toc } = await convert(raw, theme.shikiTheme)
```
(b) Add `toc` to the `assembleDocument({ … })` call:
```ts
  const html = assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang, toc })
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run test/cli.test.ts` → expect PASS.

- [ ] **Step 5: Run the full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass.

- [ ] **Step 6: Commit**
```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat(toc): CLI threads the TOC into the assembled document"
```

---

### Task 7: Claude theme — TOC styling (responsive) + snapshot

**Files:** Modify `themes/claude/theme.css`; Modify `test/snapshot.test.ts`; Modify `test/__snapshots__/snapshot.test.ts.snap`.

**Architectural guardrail:** CSS goes ONLY in `themes/claude/theme.css`. All selectors prefixed `.theme-claude` (except the global `html { scroll-behavior }`).

- [ ] **Step 1: Append the TOC styles at the END of `themes/claude/theme.css`:**
```css

/* Smooth in-page jumps for TOC links; offset so anchored headings aren't clipped. */
html { scroll-behavior: smooth; }
.theme-claude h1, .theme-claude h2, .theme-claude h3,
.theme-claude h4, .theme-claude h5, .theme-claude h6 { scroll-margin-top: 2rem; }

/* Table of contents. The converter emits <nav class="toc"> after the header.
   Mobile-first: a calm "Contents" panel. On wide screens it becomes a sticky
   side-rail pulled into the left gutter. Zero JS. */
.theme-claude .toc {
  margin: 0 0 2.5rem;
  padding: 1rem 1.3rem;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: var(--tint);
  font-size: 0.92rem;
  line-height: 1.5;
}
.theme-claude .toc-title {
  margin: 0 0 0.5rem;
  font-family: Georgia, 'Tiempos Headline', serif;
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.theme-claude .toc ul { list-style: none; margin: 0; padding-left: 0; }
.theme-claude .toc ul ul { padding-left: 1rem; margin: 0.2rem 0; }
.theme-claude .toc li { margin: 0.3rem 0; }
.theme-claude .toc a { color: var(--muted); text-decoration: none; }
.theme-claude .toc a:hover { color: var(--accent-strong); text-decoration: underline; }

@media (min-width: 1200px) {
  .theme-claude .toc {
    float: left;
    position: sticky;
    top: 2rem;
    width: 200px;
    margin-left: -244px;   /* pull into the left gutter, beside the centered column */
    padding: 0;
    border: none;
    background: none;
    font-size: 0.85rem;
  }
}
```

- [ ] **Step 2: Make the snapshot test exercise the TOC.** In `test/snapshot.test.ts`, change the convert destructure and the assemble call to thread `toc`. Change:
```ts
    const { metadata, bodyHtml } = await convert(raw, theme.shikiTheme)
    const html = assembleDocument({
      title: String(metadata.title ?? 'Untitled'),
      headerTitle: typeof metadata.title === 'string' ? metadata.title : undefined,
      bodyHtml,
      theme,
    })
```
to:
```ts
    const { metadata, bodyHtml, toc } = await convert(raw, theme.shikiTheme)
    const html = assembleDocument({
      title: String(metadata.title ?? 'Untitled'),
      headerTitle: typeof metadata.title === 'string' ? metadata.title : undefined,
      bodyHtml,
      theme,
      toc,
    })
```

- [ ] **Step 3: Regenerate the snapshot** — Run: `npx vitest run test/snapshot.test.ts -u`. Then `git diff test/__snapshots__/snapshot.test.ts.snap` and confirm the additions are: (1) the new TOC + scroll CSS inside the `<style>` block, and (2) a `<nav class="toc" aria-label="Table of contents">` with a `Contents` title and 5 `<li>` links (Lists, Table, Code, Callout, Quote) injected between the `<header>` and the body. If anything else changed unexpectedly, STOP and report.

- [ ] **Step 4: Build, render the demo, verify the TOC is present** — Run:
```bash
npm run build && node dist/cli.js samples/demo.md
grep -c '<nav class="toc"' samples/demo.html
```
Expected: `1` (demo.md has many h2 headings → auto TOC).

- [ ] **Step 5: Visual verification (controller does this).** Leave a note in your report that the controller must verify: inline "Contents" panel on a narrow viewport; sticky side-rail in the left gutter on a wide viewport (≥1200px) without overlapping the text; TOC links jump to the right headings. The gutter offset (`margin-left: -244px`, `width: 200px`, breakpoint `1200px`) may need tuning — flag it for the controller.

- [ ] **Step 6: Run the full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass.

- [ ] **Step 7: Commit**
```bash
git add themes/claude/theme.css test/snapshot.test.ts test/__snapshots__/snapshot.test.ts.snap
git commit -m "feat(toc): responsive TOC styling in the Claude theme + snapshot"
```

---

### Task 8: Theme contract note

**Files:** Modify `THEME-CONTRACT.md`.

- [ ] **Step 1: Document the TOC hooks.** In `THEME-CONTRACT.md`, under `## Element hooks`, add a bullet (after the existing hooks, e.g. after the tables bullet):
```markdown
- Table of contents (when generated): `<nav class="toc" aria-label="Table of contents">` containing a `<p class="toc-title">` and a nested `<ul>` of `<a href="#slug">` links. Emitted by the converter after the header (auto when the doc has 3+ h2/h3 headings, or via frontmatter `toc: true/false`); the theme styles it and may reposition it (the Claude theme makes it a sticky side-rail on wide screens). The title is localized (`Contents` / `目录`).
```

- [ ] **Step 2: Commit**
```bash
git add THEME-CONTRACT.md
git commit -m "docs(toc): document the .toc hooks in the theme contract"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all suites pass.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build && node dist/cli.js samples/demo.md` — open `samples/demo.html`: TOC inline on a narrow window, sticky side-rail when widened past ~1200px, links jump correctly, reads well.
- [ ] Convert a 1-heading doc and confirm NO `<nav class="toc">` appears.
