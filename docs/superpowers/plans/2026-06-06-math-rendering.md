# Math Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render LaTeX math in Markdown to static, self-contained HTML using KaTeX at build time, with the KaTeX stylesheet + fonts inlined only when a document actually contains math.

**Architecture:** Math fits the existing two-layer model exactly like Shiki does. The parse layer (`markdown-it-texmath` + `katex`) renders each formula to static KaTeX HTML during conversion — no runtime JS. `convert()` reports a `hasMath` flag. When true, the CLI inlines a font-embedded KaTeX stylesheet (a converter-owned, theme-agnostic correctness asset) into the single output file at assemble time. The theme only styles the wrapper hooks.

**Tech Stack:** `katex` (SSR engine + dist CSS/fonts), `markdown-it-texmath` (delimiter handling for `$…$`, `$$…$$`, `\(…\)`, `\[…\]`), TypeScript (ESM, strict).

**Spec:** `docs/superpowers/specs/2026-06-06-math-rendering-design.md`

---

## Key facts (verified against the libraries — do not re-derive)

- **Plugin call:** `md.use(texmath, { engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: { throwOnError: false } })`. texmath's array notation merges delimiter sets: `dollars` → `$…$` (inline) + `$$…$$` (display); `brackets` → `\(…\)` (inline) + `\[…\]` (display).
- **texmath output markup:** inline math → `<eq>…</eq>`; display math → `<section><eqn>…</eqn></section>`. The `…` is KaTeX's `<span class="katex">…</span>` (display adds an inner `<span class="katex-display">`).
- **texmath quirk — must patch:** texmath's `brackets` *block* rules omit `displayMode`, so `\[…\]` would render in text style (no `.katex-display`, inline-style limits) while `$$…$$` renders true display. `texmath.rules` is a public, mutable property read at `use()` time, so we set `displayMode: true` on `texmath.rules.brackets.block` before registering. `\[…\]` is display math in LaTeX, so this is a correctness fix, not a hack — it makes all four delimiters behave consistently.
- **`hasMath` detection:** `bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')`. These wrapper tags are emitted only by texmath, for both valid AND invalid formulas, and are NOT emitted for `$…$` inside code spans/fences (texmath never processes those). `<eq>` and `<eqn>` are distinct substrings.
- **KaTeX asset location:** `require.resolve('katex/package.json')` resolves (katex's `exports` has a `"./*": "./*"` catch-all). The CSS is `<dist>/katex.min.css` and fonts are in `<dist>/fonts/*.woff2`, where `<dist> = join(dirname(that resolved path), 'dist')`.
- **KaTeX CSS font refs:** `@font-face` rules use `src:url(fonts/KaTeX_X-Y.woff2) format("woff2"),url(fonts/...woff) format("woff"),url(fonts/...ttf) format("truetype")`. We inline the woff2 as a data URI and strip the woff/ttf refs.
- **tsup** auto-externalizes dependencies, so `katex` is present in `node_modules` at runtime (same as Shiki/markdown-it today). `require.resolve` works from `dist`.
- **tsconfig** `include: ["src","test"]`, `esModuleInterop: true` — an ambient `.d.ts` under `src/` is picked up, and `import texmath from 'markdown-it-texmath'` (CJS default) type-checks.

## File structure

- **Create** `src/markdown-it-texmath.d.ts` — ambient type declaration for the untyped CJS plugin.
- **Create** `src/math/katex-css.ts` — `buildKatexCss(): string`, resolves + inlines the KaTeX stylesheet (single responsibility: the math correctness asset).
- **Modify** `src/markdown/renderer.ts` — register texmath/KaTeX.
- **Modify** `src/convert.ts` — add `hasMath` to `ConvertResult`.
- **Modify** `src/assemble.ts` — accept and inline `katexCss`.
- **Modify** `src/cli.ts` — gate `buildKatexCss()` on `hasMath`, pass to assemble.
- **Modify** `themes/claude/theme.css` — style the math wrapper hooks.
- **Modify** `THEME-CONTRACT.md` — document the math hooks.
- **Modify** `samples/demo.md` — add a math showcase section (visual verification).
- **Create** `test/math.test.ts`, `test/katex-css.test.ts`, `test/fixtures/math.md` — tests + snapshot fixture.
- **Modify** `test/assemble.test.ts`, `test/convert.test.ts`, `test/cli.test.ts` — extend existing suites.

---

### Task 1: Renderer — math rendering via texmath + KaTeX

**Files:**
- Modify: `package.json` (add deps)
- Create: `src/markdown-it-texmath.d.ts`
- Modify: `src/markdown/renderer.ts`
- Create: `test/math.test.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install katex@^0.17.0 markdown-it-texmath@^1.0.0
```
Expected: both added under `"dependencies"` in `package.json`; install succeeds.

- [ ] **Step 2: Add the ambient type declaration for texmath**

Create `src/markdown-it-texmath.d.ts`:
```ts
declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'

  interface TexmathOptions {
    engine: unknown
    delimiters?: string | string[]
    katexOptions?: Record<string, unknown>
  }

  interface TexmathRule {
    name: string
    displayMode?: boolean
    [key: string]: unknown
  }

  interface TexmathRuleSet {
    inline: TexmathRule[]
    block: TexmathRule[]
  }

  const texmath: ((md: MarkdownIt, options: TexmathOptions) => void) & {
    rules: Record<string, TexmathRuleSet>
  }
  export default texmath
}
```

- [ ] **Step 3: Write the failing test**

Create `test/math.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('math rendering', () => {
  it('renders inline $…$ as KaTeX wrapped in <eq>', () => {
    const html = md.render('Pythagoras: $a^2 + b^2 = c^2$.')
    expect(html).toContain('<eq>')
    expect(html).toContain('class="katex"')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run test/math.test.ts`
Expected: FAIL — output contains no `<eq>` / `class="katex"` (plugin not yet registered).

- [ ] **Step 5: Register texmath in the renderer**

In `src/markdown/renderer.ts`, add imports at the top (after the existing imports):
```ts
import texmath from 'markdown-it-texmath'
import katex from 'katex'
```
Then, at module scope (just below the imports, before `function slugify`), add the one-time displayMode fix:
```ts
// texmath's 'brackets' block rules omit displayMode, so \[…\] would render in
// text style. \[…\] is display math in LaTeX, so force display mode to match
// $$…$$. texmath.rules is read at use()-time, so patching here takes effect.
for (const rule of texmath.rules.brackets.block) {
  rule.displayMode = true
}
```
Then inside `createRenderer`, after the `md.use(alert, calloutOptions)` line and before the Shiki line, add:
```ts
  // Math: texmath handles delimiters, KaTeX renders to static HTML at build time.
  // 'dollars' → $…$ and $$…$$; 'brackets' → \(…\) and \[…\]. throwOnError:false
  // means a malformed formula renders flagged instead of crashing conversion.
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets'],
    katexOptions: { throwOnError: false },
  })
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/math.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the remaining behavior tests**

Append to the `describe('math rendering', …)` block in `test/math.test.ts`:
```ts
  it('renders display $$…$$ as a <section><eqn> with katex-display', () => {
    const html = md.render('$$\\int_0^1 x^2\\,dx = \\tfrac13$$')
    expect(html).toContain('<eqn>')
    expect(html).toContain('katex-display')
  })

  it('supports backslash delimiters \\( \\) and \\[ \\]', () => {
    const inline = md.render('Inline \\(x+1\\) here.')
    expect(inline).toContain('<eq>')
    expect(inline).toContain('class="katex"')

    const display = md.render('\\[ y = mx + b \\]')
    expect(display).toContain('<eqn>')
    expect(display).toContain('katex-display')
  })

  it('does NOT render math inside inline code or code fences', () => {
    const code = md.render('Use `$x$` literally, not math.')
    expect(code).not.toContain('class="katex"')
    expect(code).toContain('<code>')

    const fence = md.render('```\n$a^2$\n```')
    expect(fence).not.toContain('class="katex"')
  })

  it('does not throw on invalid LaTeX; emits a flagged error span', () => {
    const html = md.render('Broken: $\\frac{1}{$')
    expect(html).toContain('<eq>') // wrapper still emitted
    expect(html).toContain('katex-error')
  })
```

- [ ] **Step 8: Run the full math test file**

Run: `npx vitest run test/math.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/markdown-it-texmath.d.ts src/markdown/renderer.ts test/math.test.ts
git commit -m "feat(math): render LaTeX via markdown-it-texmath + KaTeX (all four delimiters)"
```

---

### Task 2: `convert()` — expose a `hasMath` flag

**Files:**
- Modify: `src/convert.ts`
- Modify: `test/convert.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/convert.test.ts` (inside its existing `describe`):
```ts
  it('reports hasMath=true when the document contains math', async () => {
    const { hasMath } = await convert('Euler: $e^{i\\pi}+1=0$.', 'vitesse-dark')
    expect(hasMath).toBe(true)
  })

  it('reports hasMath=false when there is no math', async () => {
    const { hasMath } = await convert('Just **prose**, no math.', 'vitesse-dark')
    expect(hasMath).toBe(false)
  })

  it('reports hasMath=false when "math" only appears inside code', async () => {
    const { hasMath } = await convert('Inline `$x$` and a fence:\n\n```\n$y$\n```', 'vitesse-dark')
    expect(hasMath).toBe(false)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/convert.test.ts`
Expected: FAIL — `hasMath` is `undefined` (not yet on the result).

- [ ] **Step 3: Add `hasMath` to the conversion result**

In `src/convert.ts`, update the interface and the return. Replace:
```ts
export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
}
```
with:
```ts
export interface ConvertResult {
  metadata: Record<string, unknown>
  bodyHtml: string
  /** True when the rendered body contains math (texmath wrappers present). */
  hasMath: boolean
}
```
Then replace the function body's return. Change:
```ts
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  return { metadata, bodyHtml: md.render(content) }
```
to:
```ts
  const { metadata, content } = parseFrontmatter(raw)
  const md = await createRenderer(shikiTheme)
  const bodyHtml = md.render(content)
  // texmath wraps inline math in <eq> and display math in <eqn>; these tags are
  // emitted only for real math (never for $…$ inside code), so they are a
  // reliable, cheap signal that the KaTeX stylesheet needs to be inlined.
  const hasMath = bodyHtml.includes('<eq>') || bodyHtml.includes('<eqn>')
  return { metadata, bodyHtml, hasMath }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/convert.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convert.ts test/convert.test.ts
git commit -m "feat(math): report hasMath from convert() for conditional asset inlining"
```

---

### Task 3: KaTeX stylesheet inliner (`buildKatexCss`)

**Files:**
- Create: `src/math/katex-css.ts`
- Create: `test/katex-css.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/katex-css.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildKatexCss } from '../src/math/katex-css'

describe('buildKatexCss', () => {
  const css = buildKatexCss()

  it('returns the KaTeX stylesheet with the .katex rules', () => {
    expect(css).toContain('@font-face')
    expect(css).toContain('.katex')
  })

  it('inlines every font as a base64 woff2 data URI', () => {
    expect(css).toContain('data:font/woff2;base64,')
  })

  it('leaves no external font-file references', () => {
    expect(css).not.toContain('url(fonts/')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/katex-css.test.ts`
Expected: FAIL — module `src/math/katex-css` does not exist.

- [ ] **Step 3: Implement the inliner**

Create `src/math/katex-css.ts`:
```ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

let cached: string | null = null

/**
 * The KaTeX stylesheet with its woff2 fonts inlined as base64 data URIs, so a
 * single HTML file renders math correctly offline. This is a converter-owned
 * correctness asset (the math analogue of Shiki's token markup), not a theme.
 *
 * Resolved via katex/package.json (katex's exports map has a "./*" catch-all),
 * which avoids depending on the CSS subpath being individually exported.
 */
export function buildKatexCss(): string {
  if (cached !== null) return cached

  const require = createRequire(import.meta.url)
  const distDir = join(dirname(require.resolve('katex/package.json')), 'dist')

  let css = readFileSync(join(distDir, 'katex.min.css'), 'utf8')

  // Drop the woff and ttf fallbacks; woff2 covers every target we support and
  // keeps the embedded payload small.
  css = css.replace(
    /,url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g,
    '',
  )

  // Inline each remaining woff2 reference as a base64 data URI.
  css = css.replace(/url\(fonts\/([\w-]+\.woff2)\)/g, (_match, file: string) => {
    const data = readFileSync(join(distDir, 'fonts', file)).toString('base64')
    return `url(data:font/woff2;base64,${data})`
  })

  cached = css
  return css
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/katex-css.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/katex-css.ts test/katex-css.test.ts
git commit -m "feat(math): inline KaTeX stylesheet with base64 woff2 fonts"
```

---

### Task 4: `assembleDocument` — inline the KaTeX CSS when present

**Files:**
- Modify: `src/assemble.ts`
- Modify: `test/assemble.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/assemble.test.ts` (inside its existing `describe`):
```ts
  it('inlines KaTeX CSS before theme CSS when provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme, katexCss: '.katex{color:red}' })
    expect(html).toContain('.katex{color:red}')
    // KaTeX CSS must come before theme CSS so the theme can override it.
    expect(html.indexOf('.katex{color:red}')).toBeLessThan(html.indexOf('.theme-claude .md-content'))
  })

  it('omits KaTeX CSS when not provided', () => {
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme })
    expect(html).not.toContain('.katex{color:red}')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/assemble.test.ts`
Expected: FAIL — `katexCss` is not a recognized field; `.katex{color:red}` not present.

- [ ] **Step 3: Add `katexCss` to the assemble input and output**

In `src/assemble.ts`, add a field to `AssembleInput` after `fontFaceCss`:
```ts
  /** Inlined KaTeX stylesheet (only when the document contains math). */
  katexCss?: string
```
Then update the destructuring line:
```ts
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '', katexCss = '' } = input
```
And update the `<style>` block. Replace:
```ts
<style>
${fontFaceCss}${fontFaceCss ? '\n' : ''}${theme.css}
</style>
```
with:
```ts
<style>
${fontFaceCss}${fontFaceCss ? '\n' : ''}${katexCss}${katexCss ? '\n' : ''}${theme.css}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/assemble.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assemble.ts test/assemble.test.ts
git commit -m "feat(math): inline KaTeX CSS into the assembled document"
```

---

### Task 5: CLI wiring — embed KaTeX assets only when math is present

**Files:**
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/cli.test.ts` (inside the `describe('cli run()', …)` block):
```ts
  it('embeds KaTeX CSS + fonts only when the document has math', async () => {
    const mathIn = tmpFile('m.md', 'Euler: $e^{i\\pi}+1=0$.')
    expect(await run([mathIn])).toBe(0)
    const mathHtml = readFileSync(mathIn.replace(/\.md$/, '.html'), 'utf8')
    expect(mathHtml).toContain('class="katex"')
    expect(mathHtml).toContain('data:font/woff2;base64,')

    const plainIn = tmpFile('p.md', '# Just prose\n\nNo math here.')
    expect(await run([plainIn])).toBe(0)
    const plainHtml = readFileSync(plainIn.replace(/\.md$/, '.html'), 'utf8')
    expect(plainHtml).not.toContain('data:font/woff2;base64,')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — math HTML has no inlined fonts (CLI not passing `katexCss` yet).

- [ ] **Step 3: Wire the CLI**

In `src/cli.ts`, add an import near the other local imports:
```ts
import { buildKatexCss } from './math/katex-css'
```
Find the line that destructures the convert result (currently `const { metadata, bodyHtml } = await convert(raw, theme.shikiTheme)`) and add `hasMath`:
```ts
  const { metadata, bodyHtml, hasMath } = await convert(raw, theme.shikiTheme)
```
Then, just before the `assembleDocument({ … })` call, compute the KaTeX CSS:
```ts
  // KaTeX assets are embedded only when the document actually uses math, so
  // non-math documents stay byte-for-byte unchanged. Independent of
  // --embed-fonts (which governs the theme's text fonts).
  const katexCss = hasMath ? buildKatexCss() : ''
```
Finally, add `katexCss` to the `assembleDocument({ … })` argument object (alongside `fontFaceCss`):
```ts
  const html = assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss })
```
(Match the existing argument names already present in `src/cli.ts`; only add `hasMath` to the destructure and `katexCss` to the assemble call.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat(math): embed KaTeX assets in output only when math is present"
```

---

### Task 6: Claude theme — style the math hooks + visual verification

**Files:**
- Modify: `themes/claude/theme.css`
- Modify: `samples/demo.md`

- [ ] **Step 1: Add math styling to the Claude theme**

Append to `themes/claude/theme.css`:
```css

/* Math (KaTeX via markdown-it-texmath). The converter emits <eq> for inline
   math and <section><eqn>…</eqn></section> for display math; KaTeX owns the
   glyph metrics. The theme only sets color, spacing, and overflow. */
.theme-claude eq { color: inherit; }
.theme-claude .katex { color: inherit; font-size: 1.05em; }
.theme-claude section > eqn {
  display: block;
  margin: 1.6rem 0;
}
.theme-claude .katex-display {
  margin: 0;               /* spacing comes from the <eqn> wrapper */
  overflow-x: auto;        /* wide equations scroll instead of overflowing the page */
  overflow-y: hidden;
  padding: 0.25rem 0;      /* room for the scrollbar without clipping glyphs */
}
```

- [ ] **Step 2: Add a math section to the demo sample**

In `samples/demo.md`, add the following just before the `## A table` section:
```markdown
## Math

Inline math sits in the line of text — the mass–energy relation $E = mc^2$, or
Euler's identity $e^{i\pi} + 1 = 0$ — at the size of the surrounding prose.

Display math is centered on its own line:

$$\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}$$

Backslash delimiters work too: \(a^2 + b^2 = c^2\), and

\[ \sum_{k=1}^{n} k = \frac{n(n+1)}{2} \]
```

- [ ] **Step 3: Build and render the sample**

Run:
```bash
npm run build && node dist/cli.js samples/demo.md
```
Expected: `Wrote …/samples/demo.html`.

- [ ] **Step 4: Verify the output embeds math correctly**

Run:
```bash
grep -c 'class="katex"' samples/demo.html
grep -c 'data:font/woff2;base64,' samples/demo.html
```
Expected: both counts ≥ 1 (math rendered; fonts embedded).

- [ ] **Step 5: Verify visually**

Open `samples/demo.html` in a browser (`open samples/demo.html`) and confirm: inline math sits inline at body size; display math is centered with comfortable spacing; a very wide equation scrolls horizontally rather than overflowing; math color matches the body ink. If any of these is off, adjust the rules from Step 1 (margins, font-size, padding) and re-render. (Per project convention: correct HTML that reads poorly is still a failure.)

- [ ] **Step 6: Commit**

```bash
git add themes/claude/theme.css samples/demo.md
git commit -m "feat(math): style math hooks in the Claude theme + demo showcase"
```

---

### Task 7: Theme contract + math snapshot

**Files:**
- Modify: `THEME-CONTRACT.md`
- Create: `test/fixtures/math.md`
- Modify: `test/math.test.ts`

- [ ] **Step 1: Document the math hooks in the contract**

In `THEME-CONTRACT.md`, under `## Element hooks`, add a bullet after the code-blocks line:
```markdown
- Math: inline math is `<eq>…</eq>`; display math is `<section><eqn>…</eqn></section>`. Inside each, KaTeX emits its own `.katex` / `.katex-display` markup (glyph metrics — a converter-owned correctness asset, like Shiki tokens, not theme-owned). A theme styles the `<eq>` / `<eqn>` wrappers and may set `.katex` color/size; the KaTeX stylesheet (with fonts inlined) is added to the document automatically, and only when the document contains math.
```

- [ ] **Step 2: Create the snapshot fixture**

Create `test/fixtures/math.md`:
```markdown
Inline $a^2 + b^2 = c^2$ and display:

$$\int_0^1 x^2\,dx = \tfrac13$$

Bracket inline \(x + 1\) and bracket display:

\[ \sum_{k=1}^{n} k = \frac{n(n+1)}{2} \]
```

- [ ] **Step 3: Write the snapshot test**

Append to `test/math.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { convert } from '../src/convert'

describe('math snapshot', () => {
  it('renders the math fixture to stable body HTML', async () => {
    const raw = readFileSync(
      fileURLToPath(new URL('./fixtures/math.md', import.meta.url)),
      'utf8',
    )
    // Snapshot only the body HTML (KaTeX markup) — not the assembled document —
    // so the snapshot stays readable and free of base64 font payloads.
    const { bodyHtml } = await convert(raw, 'vitesse-dark')
    expect(bodyHtml).toMatchSnapshot()
  })
})
```

- [ ] **Step 4: Generate the snapshot and run the full suite**

Run: `npx vitest run test/math.test.ts -u && npm test`
Expected: snapshot written; full suite passes.

- [ ] **Step 5: Sanity-check the snapshot is payload-free**

Run: `grep -c 'data:font/woff2' test/__snapshots__/math.test.ts.snap || true`
Expected: `0` (the body-HTML snapshot must not contain embedded fonts).

- [ ] **Step 6: Commit**

```bash
git add THEME-CONTRACT.md test/fixtures/math.md test/math.test.ts test/__snapshots__/math.test.ts.snap
git commit -m "docs(math): document math hooks + add math body-HTML snapshot"
```

---

## Final verification (after all tasks)

- [ ] Run `npm test` — all suites pass.
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run build && node dist/cli.js samples/demo.md` and open `samples/demo.html` — math renders correctly and reads well in the Claude theme.
- [ ] Confirm a non-math document's output is unchanged (no KaTeX CSS / fonts inlined).
