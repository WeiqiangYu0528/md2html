# TOC Placement CLI Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--toc <mode>` CLI flag (`auto | sidebar | topbar | none`) that lets users explicitly choose the table-of-contents placement, keeping `auto` (current adaptive behavior) as the default.

**Architecture:** The CLI mode flows through two layers without leaking presentation into conversion. The conversion layer (`toc.ts`) only decides *whether* a TOC exists; the assemble layer (`assemble.ts`) turns the mode into a stable `<body>` class hook (`toc-sidebar` / `toc-topbar`); the theme CSS owns all appearance by responding to those hooks. `auto` adds no class and defers to the existing frontmatter logic, so output with no flag is byte-for-byte identical to today.

**Tech Stack:** Node.js, TypeScript, `node:util` `parseArgs`, Vitest, plain CSS themes.

---

## File Structure

- **Create:** none.
- **Modify:**
  - `src/types.ts` — add the shared `TocMode` type.
  - `src/toc.ts` — `buildToc` takes `tocMode`, decides visibility.
  - `src/convert.ts` — `convert` takes and forwards `tocMode`.
  - `src/cli.ts` — parse/validate `--toc`, thread mode through, usage text.
  - `src/assemble.ts` — add `tocMode`, emit body class hook.
  - `themes/gpt/theme.css`, `themes/claude/theme.css`, `themes/claude-dark/theme.css` — respond to `.toc-sidebar` / `.toc-topbar`.
  - `THEME-CONTRACT.md` — document the two new body-class hooks.
- **Tests:** `test/toc.test.ts`, `test/assemble.test.ts`, `test/cli.test.ts` (all exist).

**Key facts about the current code (verified):**
- `buildToc(tokens, { lang, toc })` in `src/toc.ts:61`: `toc===false` suppresses; `toc===true` forces (with ≥1 heading); else needs ≥3 headings.
- `assembleDocument(input)` in `src/assemble.ts:20`: body tag is `` `<body class="theme-${theme.scopeClass ?? theme.name}">` `` at line 38.
- `convert(raw, shikiTheme, mermaidConfig?)` in `src/convert.ts:26` calls `buildToc(tokens, { lang, toc: metadata.toc })` at line 63.
- `src/cli.ts:197` calls `convert(raw, theme.shikiTheme, theme.mermaid ?? {})` inside `renderMarkdown`, then `assembleDocument({...})` at line 212. `renderMarkdown` is called from `runSingle` (line 111) and `runDirectory` (line 157).
- Each theme has a `@media (min-width: 1400px)` block that turns `.toc` into a floated sticky rail (gpt `themes/gpt/theme.css:337`, claude `themes/claude/theme.css:355`, claude-dark inherits — verify below).

---

## Task 1: Add the `TocMode` type

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the type**

Append to `src/types.ts`:

```typescript
/** Table-of-contents placement mode, chosen via the CLI `--toc` flag. */
export type TocMode = 'auto' | 'sidebar' | 'topbar' | 'none'
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors (nothing consumes it yet, so this just confirms valid syntax).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(toc): add TocMode type"
```

---

## Task 2: Teach `buildToc` about the mode (visibility only)

`buildToc` gains an optional `tocMode`. Rules:
- `'none'` → `''` (no TOC).
- `'sidebar'` / `'topbar'` → force on with ≥1 heading (like `toc: true`).
- `'auto'` or omitted → unchanged: defer to the `toc` frontmatter value and the ≥3 threshold.

CLI-wins-over-frontmatter precedence lives here: when mode is not `auto`, the `toc` frontmatter value is ignored.

**Files:**
- Modify: `src/toc.ts:61-68`
- Test: `test/toc.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block to `test/toc.test.ts` (after the existing `describe('buildToc trigger', …)` block, before the file ends):

```typescript
describe('buildToc tocMode', () => {
  const parse = (src: string) => md.parse(src, {})

  it('mode "none" suppresses even with many headings', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', tocMode: 'none' })).toBe('')
  })

  it('mode "sidebar" forces a TOC with a single heading', () => {
    expect(buildToc(parse('## Only'), { lang: 'en', tocMode: 'sidebar' })).toContain('<nav class="toc"')
  })

  it('mode "topbar" forces a TOC with a single heading', () => {
    expect(buildToc(parse('## Only'), { lang: 'en', tocMode: 'topbar' })).toContain('<nav class="toc"')
  })

  it('mode "sidebar"/"topbar" overrides frontmatter toc:false (CLI wins)', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', toc: false, tocMode: 'sidebar' }))
      .toContain('<nav class="toc"')
  })

  it('mode "auto" defers to frontmatter toc:false', () => {
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', toc: false, tocMode: 'auto' })).toBe('')
  })

  it('mode "auto" keeps the >=3 heading threshold', () => {
    expect(buildToc(parse('## A\n\n## B'), { lang: 'en', tocMode: 'auto' })).toBe('')
    expect(buildToc(parse('## A\n\n## B\n\n## C'), { lang: 'en', tocMode: 'auto' })).toContain('<nav class="toc"')
  })

  it('forced modes still emit nothing when there are no headings', () => {
    expect(buildToc(parse('Just text.'), { lang: 'en', tocMode: 'sidebar' })).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/toc.test.ts -t "buildToc tocMode"`
Expected: FAIL — current `buildToc` ignores `tocMode`, so `none` still emits a nav and the `sidebar`-overrides-`toc:false` case returns `''`.

- [ ] **Step 3: Implement**

Add the import at the top of `src/toc.ts` (line 2 area, after the existing imports):

```typescript
import type { TocMode } from './types'
```

Replace `buildToc` (`src/toc.ts:56-68`) with:

```typescript
/**
 * Build the TOC nav for a parsed document.
 *
 * `tocMode` (from the CLI `--toc` flag) takes precedence over frontmatter:
 * - 'none'               → never emit a TOC.
 * - 'sidebar' | 'topbar' → force a TOC whenever there is >=1 heading.
 * - 'auto' (or omitted)  → defer to frontmatter `toc`: `false` suppresses,
 *                          `true` forces, otherwise a TOC appears only with
 *                          3+ headings.
 * The nav markup is identical in every case; placement is a theme concern.
 */
export function buildToc(
  tokens: Token[],
  opts: { lang: string; toc?: unknown; tocMode?: TocMode },
): string {
  const mode = opts.tocMode ?? 'auto'
  if (mode === 'none') return ''
  const headings = collectHeadings(tokens)
  if (headings.length === 0) return ''
  const forced = mode === 'sidebar' || mode === 'topbar'
  if (!forced) {
    if (opts.toc === false) return ''
    if (opts.toc !== true && headings.length < 3) return ''
  }
  return renderToc(headings, opts.lang)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/toc.test.ts`
Expected: PASS — the new `tocMode` block and all pre-existing `buildToc trigger` tests (which pass no `tocMode`, so `mode` defaults to `auto`) pass.

- [ ] **Step 5: Commit**

```bash
git add src/toc.ts test/toc.test.ts
git commit -m "feat(toc): buildToc honors tocMode with CLI-wins precedence"
```

---

## Task 3: Thread `tocMode` through `convert`

**Files:**
- Modify: `src/convert.ts:26-64`
- Test: `test/convert.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/convert.test.ts` (inside the existing top-level `describe`, or as a new `it` at the end of the file before the closing brace):

```typescript
  it('tocMode "none" suppresses the TOC; "sidebar" forces it', async () => {
    const src = '## A\n\n## B\n\n## C\n\ntext'
    const none = await convert(src, 'vitesse-dark', {}, 'none')
    expect(none.toc).toBe('')
    const forced = await convert('## Only\n\ntext', 'vitesse-dark', {}, 'sidebar')
    expect(forced.toc).toContain('<nav class="toc"')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/convert.test.ts -t "tocMode"`
Expected: FAIL — `convert` currently accepts only 3 args (TypeScript compile error on the 4th arg, or the arg is ignored).

- [ ] **Step 3: Implement**

Add the import near the top of `src/convert.ts` (line 6 currently imports from `./types`):

```typescript
import type { ShikiTheme, TocMode } from './types'
```

(Replace the existing `import type { ShikiTheme } from './types'` line — do not add a duplicate import.)

Update the `convert` signature (`src/convert.ts:26-30`) to add a parameter with a default:

```typescript
export async function convert(
  raw: string,
  shikiTheme: ShikiTheme,
  mermaidConfig: Record<string, unknown> = {},
  tocMode: TocMode = 'auto',
): Promise<ConvertResult> {
```

Update the `buildToc` call (`src/convert.ts:63`) to pass the mode:

```typescript
  const toc = buildToc(tokens, { lang, toc: metadata.toc, tocMode })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/convert.test.ts`
Expected: PASS — new test passes, existing `convert` tests (which omit the 4th arg → `tocMode` defaults to `'auto'`) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/convert.ts test/convert.test.ts
git commit -m "feat(toc): convert forwards tocMode to buildToc"
```

---

## Task 4: Emit the body-class hook in `assembleDocument`

`assembleDocument` gains `tocMode`. `'sidebar'` → append ` toc-sidebar` to the body class; `'topbar'` → ` toc-topbar`; `'auto'` / `'none'` / omitted → no extra class.

**Files:**
- Modify: `src/assemble.ts:1-45`
- Test: `test/assemble.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/assemble.test.ts` (inside `describe('assembleDocument', …)`, before its closing `})`):

```typescript
  it('adds no toc placement class for auto/none/omitted', () => {
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme }))
      .toContain('<body class="theme-claude">')
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'auto' }))
      .toContain('<body class="theme-claude">')
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'none' }))
      .toContain('<body class="theme-claude">')
  })

  it('adds toc-sidebar / toc-topbar body class for those modes', () => {
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'sidebar' }))
      .toContain('<body class="theme-claude toc-sidebar">')
    expect(assembleDocument({ title: 'T', bodyHtml: '', theme, tocMode: 'topbar' }))
      .toContain('<body class="theme-claude toc-topbar">')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/assemble.test.ts -t "toc-sidebar"`
Expected: FAIL — `AssembleInput` has no `tocMode`; body class is always `theme-claude`.

- [ ] **Step 3: Implement**

In `src/assemble.ts`, add the import at the top (after line 1's `import type { Theme } from './types'` — merge into one line):

```typescript
import type { Theme, TocMode } from './types'
```

Add the field to the `AssembleInput` interface (after the `toc?` field, `src/assemble.ts:16-17`):

```typescript
  /** TOC placement mode; adds a body-class hook for the theme (default "auto"). */
  tocMode?: TocMode
```

Update the destructuring (`src/assemble.ts:21`) to pull `tocMode`:

```typescript
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '', katexCss = '', lang = 'en', toc = '', tocMode = 'auto' } = input
```

Add the body-class computation just before the `return` (after the `content` assignment, around `src/assemble.ts:27`):

```typescript
  const scope = theme.scopeClass ?? theme.name
  const placementClass = tocMode === 'sidebar' ? ' toc-sidebar' : tocMode === 'topbar' ? ' toc-topbar' : ''
  const bodyClass = `theme-${scope}${placementClass}`
```

Change the body tag line (`src/assemble.ts:38`) from:

```typescript
<body class="theme-${theme.scopeClass ?? theme.name}">
```

to:

```typescript
<body class="${bodyClass}">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/assemble.test.ts`
Expected: PASS — including the pre-existing `uses the theme scopeClass for the body class` test (mode defaults to `auto` → no placement class).

- [ ] **Step 5: Commit**

```bash
git add src/assemble.ts test/assemble.test.ts
git commit -m "feat(toc): assembleDocument emits toc placement body class"
```

---

## Task 5: Parse and validate `--toc` in the CLI, thread it through

**Files:**
- Modify: `src/cli.ts` (USAGE `:15-28`; `parseArgs` options `:37-43`; validation after parse; `runSingle`/`runDirectory`/`renderMarkdown` signatures and calls)
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/cli.test.ts` inside `describe('cli run()', …)` (before its closing `})` near line 111):

```typescript
  it('rejects an invalid --toc value with exit 1', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const input = tmpFile('bad.md', '# x\n\n## a\n\n## b\n\n## c')
    expect(await run([input, '--toc', 'bogus'])).toBe(1)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('auto'))
  })

  it('--toc none omits the TOC even with many headings', async () => {
    const input = tmpFile('n.md', '# Doc\n\n## A\n\n## B\n\n## C\n\ntext')
    expect(await run([input, '--toc', 'none'])).toBe(0)
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).not.toContain('<nav class="toc"')
  })

  it('--toc sidebar forces the TOC and adds the sidebar body class', async () => {
    const input = tmpFile('sb.md', '# Doc\n\n## Only\n\ntext')
    expect(await run([input, '--toc', 'sidebar'])).toBe(0)
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('<nav class="toc"')
    expect(html).toContain('toc-sidebar')
  })

  it('--toc topbar adds the topbar body class', async () => {
    const input = tmpFile('tb.md', '# Doc\n\n## Only\n\ntext')
    expect(await run([input, '--toc', 'topbar'])).toBe(0)
    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('toc-topbar')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/cli.test.ts -t "--toc"`
Expected: FAIL — `--toc` is an unknown option, so `parseArgs` throws and `run` returns 1 for *all* of them; the assertions on body class / nav presence fail.

- [ ] **Step 3: Implement — usage text**

In `src/cli.ts`, add a line to the `USAGE` template (after the `--theme` line, `src/cli.ts:24`):

```
      --toc <mode>      TOC placement: auto | sidebar | topbar | none (default: auto)
```

- [ ] **Step 4: Implement — parse option**

Add to the `parseArgs` `options` object (`src/cli.ts:37-43`), after the `theme` entry:

```typescript
        toc: { type: 'string', default: 'auto' },
```

- [ ] **Step 5: Implement — validate**

Add the import at the top of `src/cli.ts` (after the existing `import type { Theme } from './types'`, merge into one line):

```typescript
import type { Theme, TocMode } from './types'
```

After the `values`/`positionals` are assigned and before `theme` is loaded (i.e. after the `catch` block that ends at `src/cli.ts:50`, alongside the other early validation), add:

```typescript
  const TOC_MODES: readonly TocMode[] = ['auto', 'sidebar', 'topbar', 'none']
  const tocMode = values.toc as string
  if (!TOC_MODES.includes(tocMode as TocMode)) {
    process.stderr.write(`Error: invalid --toc value "${tocMode}". Expected one of: ${TOC_MODES.join(', ')}\n`)
    return 1
  }
```

Place this block *before* the `list-themes` / `help` early-returns is unnecessary — put it right after `theme` loading fails would be too late. Concretely: insert it immediately after the `catch (err) { … }` closing brace at line 50, so validation runs before `--list-themes`/`--help` handling. (Both those paths ignore `--toc`, and validating first gives a consistent error for `--toc bogus --list-themes`.)

- [ ] **Step 6: Implement — thread the mode through**

The mode must reach `renderMarkdown`. Update the call sites and signatures:

`run()` — where it dispatches to directory vs single (`src/cli.ts:84-91`), pass `tocMode as TocMode`:

```typescript
  if (stats.isDirectory()) {
    return runDirectory(inputPath, values.output as string | undefined, theme, embedFonts, tocMode as TocMode)
  }

  const convertedSet = new Set([resolve(inputPath)])
  return runSingle(inputPath, values.output as string | undefined, theme, embedFonts, convertedSet, tocMode as TocMode)
```

`runSingle` signature (`src/cli.ts:95-101`) — add the parameter:

```typescript
async function runSingle(
  inputPath: string,
  output: string | undefined,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
  tocMode: TocMode,
): Promise<number> {
```

Its `renderMarkdown` call (`src/cli.ts:111`):

```typescript
  const html = await renderMarkdown(raw, inputPath, theme, embedFonts, convertedSet, tocMode)
```

`runDirectory` signature (`src/cli.ts:128-133`) — add the parameter:

```typescript
async function runDirectory(
  inputDir: string,
  output: string | undefined,
  theme: Theme,
  embedFonts: boolean,
  tocMode: TocMode,
): Promise<number> {
```

Its `renderMarkdown` call (`src/cli.ts:157`):

```typescript
    const html = await renderMarkdown(raw, file, theme, embedFonts, convertedSet, tocMode)
```

`renderMarkdown` signature (`src/cli.ts:190-196`) — add the parameter:

```typescript
async function renderMarkdown(
  raw: string,
  inputPath: string,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
  tocMode: TocMode,
): Promise<string> {
```

Its `convert` call (`src/cli.ts:197`) — pass the mode as the 4th arg:

```typescript
  const { metadata, bodyHtml: rawBody, hasMath, lang, toc, warnings } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {}, tocMode)
```

Its `assembleDocument` call (`src/cli.ts:212`) — pass `tocMode`:

```typescript
  return assembleDocument({ title, headerTitle: fmTitle, bodyHtml, theme, fontFaceCss, katexCss, lang, toc, tocMode })
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS — all new `--toc` tests plus the existing CLI tests (which never pass `--toc`, so mode defaults to `auto`).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat(toc): add --toc CLI flag with validation and threading"
```

---

## Task 6: Confirm the regression safety net (no-flag output unchanged)

The snapshot test (`test/snapshot.test.ts`) renders the kitchen-sink fixture with no `tocMode`. If our defaults are correct, the snapshot must be **unchanged**.

**Files:**
- Verify only: `test/snapshot.test.ts`, `test/__snapshots__/snapshot.test.ts.snap`

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: The snapshot test PASSES with no snapshot update. If Vitest reports the snapshot changed, that is a regression — the `auto`/omitted path must produce identical output. Do **not** run `-u` to accept a changed snapshot; instead diff and fix the code so the default path is byte-for-byte identical.

- [ ] **Step 2: Confirm no obsolete/updated snapshots**

Run: `npx vitest run test/snapshot.test.ts test/math.test.ts`
Expected: PASS, `0 obsolete`, no writes to `.snap` files. `git status` should show no modification to `test/__snapshots__/`.

- [ ] **Step 3: (No commit — verification task.)**

If Steps 1-2 pass, nothing to commit. If a fix was required, commit it with message `fix(toc): keep default output identical to pre-flag behavior`.

---

## Task 7: gpt theme — respond to the placement hooks

Add CSS so `.toc-topbar` forces the card form and `.toc-sidebar` floats at a lower breakpoint. Refactor the float rule set so `auto` (≥1400px) and `sidebar` (≥1000px) share one definition instead of duplicating it.

**Files:**
- Modify: `themes/gpt/theme.css:337-365` (the `@media (min-width: 1400px)` block)

- [ ] **Step 1: Refactor the float styles into a shared selector list**

Replace the existing `@media (min-width: 1400px) { … }` block (`themes/gpt/theme.css:337-365`) with the following. It (a) applies the float styles under BOTH `auto` at ≥1400px and `.toc-sidebar` at ≥1000px via a shared selector list, and (b) adds a `.toc-topbar` override that pins the card form at all widths.

```css
/* Floated sticky side-rail. Applies to:
   - auto mode (no placement class) at >=1400px, and
   - explicit .toc-sidebar at >=1000px (lower threshold, opt-in).
   Below its threshold each falls back to the default top-card form above.
   .toc-topbar is deliberately excluded so it always stays a card. */
@media (min-width: 1400px) {
  .theme-gpt:not(.toc-topbar):not(.toc-sidebar) .toc { float: left; position: sticky; top: 2rem; width: 244px; margin-left: -344px; max-height: calc(100vh - 4rem); overflow-y: auto; padding: 0; border: none; border-radius: 0; background: none; font-size: 0.82rem; line-height: 1.5; }
  .theme-gpt:not(.toc-topbar):not(.toc-sidebar) .toc-title { padding: 0 0.55rem; }
  .theme-gpt:not(.toc-topbar):not(.toc-sidebar) .toc ul ul { margin: 0.35rem 0 0.05rem; padding-left: 0.55rem; }
  .theme-gpt:not(.toc-topbar):not(.toc-sidebar) .toc li { margin: 0.3rem 0; }
  .theme-gpt:not(.toc-topbar):not(.toc-sidebar) .toc ul ul li { margin: 0.25rem 0; }
  .theme-gpt:not(.toc-topbar):not(.toc-sidebar) .toc a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@media (min-width: 1000px) {
  .theme-gpt.toc-sidebar .toc { float: left; position: sticky; top: 2rem; width: 244px; margin-left: -344px; max-height: calc(100vh - 4rem); overflow-y: auto; padding: 0; border: none; border-radius: 0; background: none; font-size: 0.82rem; line-height: 1.5; }
  .theme-gpt.toc-sidebar .toc-title { padding: 0 0.55rem; }
  .theme-gpt.toc-sidebar .toc ul ul { margin: 0.35rem 0 0.05rem; padding-left: 0.55rem; }
  .theme-gpt.toc-sidebar .toc li { margin: 0.3rem 0; }
  .theme-gpt.toc-sidebar .toc ul ul li { margin: 0.25rem 0; }
  .theme-gpt.toc-sidebar .toc a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
```

> **Note on the `auto` selector.** Adding `:not(.toc-topbar):not(.toc-sidebar)` narrows `auto`'s float rule so it never applies when an explicit mode is set. Because `auto` never emits either class (Task 4), the `auto`/no-flag rendering is unaffected — the selector still matches exactly the same elements it did before. This is what keeps the snapshot green.

- [ ] **Step 2: Verify build still succeeds (CSS is inlined at build time via the theme loader)**

Run: `npm run build`
Expected: `Build success`.

- [ ] **Step 3: Commit**

```bash
git add themes/gpt/theme.css
git commit -m "feat(toc): gpt theme responds to toc-sidebar/toc-topbar hooks"
```

---

## Task 8: claude theme — respond to the placement hooks

Same treatment as gpt, using claude's own float values (`width: 230px; margin-left: -330px;`).

**Files:**
- Modify: `themes/claude/theme.css:355-380` (the `@media (min-width: 1400px)` block)

- [ ] **Step 1: Replace the float block**

Replace `themes/claude/theme.css:355-380` (`@media (min-width: 1400px) { … }`) with:

```css
/* Floated sticky side-rail — see gpt theme for the mode rationale. */
@media (min-width: 1400px) {
  .theme-claude:not(.toc-topbar):not(.toc-sidebar) .toc { float: left; position: sticky; top: 2rem; width: 230px; margin-left: -330px; max-height: calc(100vh - 4rem); overflow-y: auto; padding: 0; border: none; border-radius: 0; background: none; font-size: 0.82rem; line-height: 1.5; }
  .theme-claude:not(.toc-topbar):not(.toc-sidebar) .toc-title { padding: 0 0.55rem; }
  .theme-claude:not(.toc-topbar):not(.toc-sidebar) .toc ul ul { margin: 0.35rem 0 0.05rem; padding-left: 0.55rem; }
  .theme-claude:not(.toc-topbar):not(.toc-sidebar) .toc li { margin: 0.3rem 0; }
  .theme-claude:not(.toc-topbar):not(.toc-sidebar) .toc ul ul li { margin: 0.25rem 0; }
  .theme-claude:not(.toc-topbar):not(.toc-sidebar) .toc a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@media (min-width: 1000px) {
  .theme-claude.toc-sidebar .toc { float: left; position: sticky; top: 2rem; width: 230px; margin-left: -330px; max-height: calc(100vh - 4rem); overflow-y: auto; padding: 0; border: none; border-radius: 0; background: none; font-size: 0.82rem; line-height: 1.5; }
  .theme-claude.toc-sidebar .toc-title { padding: 0 0.55rem; }
  .theme-claude.toc-sidebar .toc ul ul { margin: 0.35rem 0 0.05rem; padding-left: 0.55rem; }
  .theme-claude.toc-sidebar .toc li { margin: 0.3rem 0; }
  .theme-claude.toc-sidebar .toc ul ul li { margin: 0.25rem 0; }
  .theme-claude.toc-sidebar .toc a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
```

- [ ] **Step 2: Run the snapshot test (kitchen-sink uses the claude theme)**

Run: `npx vitest run test/snapshot.test.ts`
Expected: PASS with no snapshot change. The kitchen-sink fixture renders with `auto` (no placement class), and the `:not(...)` selector matches the same elements as before, so the inlined CSS in the snapshot changes only in the float-block text — **which IS part of the snapshot**. See Step 3.

- [ ] **Step 3: Reconcile the snapshot (theme CSS is inlined into the snapshot)**

The snapshot inlines the full theme CSS, so editing `themes/claude/theme.css` **will** change the snapshot's `<style>` content. This is expected and legitimate — the rendered *structure* (body class, TOC markup) is unchanged; only the CSS text differs. Update the snapshot deliberately:

Run: `npx vitest run test/snapshot.test.ts -u`
Then inspect the diff: `git diff test/__snapshots__/snapshot.test.ts.snap`
Expected diff: ONLY inside the `<style>` block, showing the refactored float selectors. Confirm `<body class="theme-claude">` (no placement class) and the `<nav class="toc"…>` markup are **unchanged**. If anything outside `<style>` changed, that's a bug — fix the code, don't accept the snapshot.

- [ ] **Step 4: Commit**

```bash
git add themes/claude/theme.css test/__snapshots__/snapshot.test.ts.snap
git commit -m "feat(toc): claude theme responds to toc-sidebar/toc-topbar hooks"
```

---

## Task 9: claude-dark theme — respond to the placement hooks

claude-dark `extends` claude (verify how it reuses CSS), so it may inherit the base's TOC rules via the shared `scopeClass`. Determine whether it has its own float block.

**Files:**
- Inspect, then possibly modify: `themes/claude-dark/theme.css`

- [ ] **Step 1: Inspect claude-dark's TOC handling**

Run: `grep -n "\.toc\|min-width\|scopeClass\|extends\|float" themes/claude-dark/theme.css themes/claude-dark/theme.json 2>/dev/null`
Expected: Reveals whether claude-dark has its own `@media (min-width: 1400px) .theme-claude* .toc` block or relies on claude's CSS via a shared `scopeClass` of `claude`.

- [ ] **Step 2a: If claude-dark relies on the base `claude` scopeClass (no own float block)**

No change needed — it uses `.theme-claude …` selectors from the base CSS, which Task 8 already updated. Skip to Step 3. Note this outcome in the commit message of the verification task (Task 10) rather than making an empty commit.

- [ ] **Step 2b: If claude-dark has its OWN float block (its own `.theme-<scope> .toc` float rules)**

Apply the identical transformation from Task 8, substituting claude-dark's actual scope-class prefix (the `.theme-<scopeClass>` its selectors use — read it from Step 1's output) and its own `width`/`margin-left` float values (read them from its existing 1400px block; do not assume claude's values). Produce the two media blocks (`≥1400px` with `:not(.toc-topbar):not(.toc-sidebar)`, `≥1000px` with `.toc-sidebar`) exactly as in Task 8.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `Build success`.

- [ ] **Step 4: Commit (only if Step 2b applied)**

```bash
git add themes/claude-dark/theme.css
git commit -m "feat(toc): claude-dark theme responds to toc placement hooks"
```

---

## Task 10: Update the theme contract

**Files:**
- Modify: `THEME-CONTRACT.md:19` (the Table of contents hook line)

- [ ] **Step 1: Extend the TOC hook description**

In `THEME-CONTRACT.md`, replace the Table-of-contents bullet (`:19`) with a version that documents the two placement hooks. Find the line beginning `- Table of contents (when generated):` and append the following sentence to the end of that bullet:

```
 The CLI `--toc <mode>` flag (auto|sidebar|topbar|none) controls placement by adding a body-class hook: `sidebar` → `<body class="… toc-sidebar">`, `topbar` → `<body class="… toc-topbar">`; `auto` and `none` add no class. A theme SHOULD respond to `.toc-sidebar` (prefer the side-rail, at a lower viewport threshold than auto) and `.toc-topbar` (force the top-card form at all widths); `auto` keeps the theme's own default adaptive behavior.
```

- [ ] **Step 2: Commit**

```bash
git add THEME-CONTRACT.md
git commit -m "docs(toc): document toc-sidebar/toc-topbar theme hooks"
```

---

## Task 11: Full verification + visual check

**Files:**
- None modified — verification only.

- [ ] **Step 1: Full test suite + typecheck + build**

```bash
npm run typecheck && npm test && npm run build
```
Expected: typecheck clean; all tests pass (note: there are pre-existing failures unrelated to this work — compare the failing test names against a clean `main` baseline and confirm this change adds no NEW failures); build succeeds.

- [ ] **Step 2: Generate the four modes from the real sample for visual inspection**

Use the repo's Chinese sample (or `samples/sample.md`). Substitute a real multi-heading `.md` path for `<doc.md>`:

```bash
node dist/cli.js <doc.md> --theme claude --toc auto    -o /tmp/toc-auto.html
node dist/cli.js <doc.md> --theme claude --toc sidebar -o /tmp/toc-sidebar.html
node dist/cli.js <doc.md> --theme claude --toc topbar  -o /tmp/toc-topbar.html
node dist/cli.js <doc.md> --theme claude --toc none    -o /tmp/toc-none.html
```
Expected: all exit 0. Confirm class hooks:

```bash
grep -o '<body class="[^"]*"' /tmp/toc-sidebar.html   # → toc-sidebar
grep -o '<body class="[^"]*"' /tmp/toc-topbar.html    # → toc-topbar
grep -c '<nav class="toc"' /tmp/toc-none.html         # → 0
grep -o '<body class="[^"]*"' /tmp/toc-auto.html      # → no toc-* class
```

- [ ] **Step 3: Visual confirmation in a browser (CLAUDE.md requirement)**

Open each file and resize the window:
- `toc-sidebar.html` — TOC floats left on a wide window; narrow the window below ~1000px → it falls back to the top card.
- `toc-topbar.html` — TOC is the top card at every width (never floats).
- `toc-auto.html` — identical to current behavior (floats only ≥1400px).
- `toc-none.html` — no TOC anywhere.

- [ ] **Step 4: Clean up temp files**

```bash
rm -f /tmp/toc-auto.html /tmp/toc-sidebar.html /tmp/toc-topbar.html /tmp/toc-none.html
```

- [ ] **Step 5: (No commit — verification task.)**

---

## Self-Review Notes

- **Spec coverage:** CLI interface (Task 5), conversion-layer visibility (Tasks 2-3), assemble class hook (Task 4), theme CSS for all three themes (Tasks 7-9), shared-float refactor / no duplication (Tasks 7-9 Step 1), CLI-wins precedence (Task 2), sidebar lower-breakpoint fallback (Tasks 7-9), regression byte-for-byte net (Task 6), visual verification (Task 11), THEME-CONTRACT (Task 10). All spec sections mapped.
- **Type consistency:** `TocMode` defined once (Task 1) and imported everywhere; `buildToc` opts use `tocMode`; `AssembleInput.tocMode`; `convert(…, tocMode)`; all CLI helper signatures append `tocMode: TocMode`.
- **Snapshot subtlety:** Editing claude's CSS legitimately changes the snapshot's inlined `<style>` (Task 8 Step 3), whereas the gpt/dark themes do not feed the snapshot. The `auto` selector is narrowed with `:not(...)` but matches the same elements, so structure is unchanged. This is the one intentional snapshot update; every other snapshot must stay green (Task 6).
