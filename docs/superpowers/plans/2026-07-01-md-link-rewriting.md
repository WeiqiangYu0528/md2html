# Markdown Internal Link Rewriting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite internal relative `.md`/`.markdown` links in the generated HTML to their `.html` equivalents, but only when the link's target is a file in the current conversion run.

**Architecture:** A new pure function `rewriteInternalLinks(html, currentFile, convertedSet)` in `src/links.ts` scans `<a href>` values and swaps the extension for in-set relative Markdown targets, preserving `#fragment`/`?query`, leaving everything else byte-for-byte. `src/cli.ts` computes the converted set once (the folder file list, or a singleton for single-file mode) and applies the transform after `convert()` returns, before `assembleDocument()`. The conversion layer and themes are untouched.

**Tech Stack:** Node.js + TypeScript (ESM), vitest, node:path (`resolve`, `dirname`).

---

## File Structure

- **New:** `src/links.ts` — the pure `rewriteInternalLinks` transform. One responsibility: href rewriting. No I/O.
- **New:** `test/links.test.ts` — unit tests for the transform.
- **Modify:** `src/cli.ts` — compute `convertedSet`, thread it into `renderMarkdown`, call `rewriteInternalLinks` after `convert()`.
- **Modify:** `test/cli.test.ts` — folder + single-file link integration tests.

All test runs are scoped to `test/` and use `--test-timeout=30000` because the repo contains a stray `.worktrees/mermaid-cli-rendering` that breaks whole-repo runs, and real conversion (Shiki + Mermaid init) exceeds the default 5s timeout.

---

## Task 1: `rewriteInternalLinks` pure transform

**Files:**
- Create: `src/links.ts`
- Test: `test/links.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/links.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { rewriteInternalLinks } from '../src/links'

// Simulate a converted folder rooted at /docs.
const root = '/docs'
const current = resolve(root, 'guide.md')
const set = new Set([
  resolve(root, 'guide.md'),
  resolve(root, 'intro.md'),
  resolve(root, 'sub/deep.markdown'),
  resolve(root, 'My Doc.md'),
])

function a(href: string): string {
  return `<p>see <a href="${href}">x</a></p>`
}

describe('rewriteInternalLinks', () => {
  it('rewrites an in-set relative .md link', () => {
    expect(rewriteInternalLinks(a('./intro.md'), current, set)).toBe(a('./intro.html'))
  })

  it('rewrites an in-set .markdown link across a subdir', () => {
    expect(rewriteInternalLinks(a('./sub/deep.markdown'), current, set)).toBe(a('./sub/deep.html'))
  })

  it('rewrites via ../ traversal into an in-set file', () => {
    const nested = resolve(root, 'sub/page.md')
    const nestedSet = new Set([nested, resolve(root, 'intro.md')])
    expect(rewriteInternalLinks(a('../intro.md'), nested, nestedSet)).toBe(a('../intro.html'))
  })

  it('preserves a #fragment', () => {
    expect(rewriteInternalLinks(a('./intro.md#setup'), current, set)).toBe(a('./intro.html#setup'))
  })

  it('preserves a ?query', () => {
    expect(rewriteInternalLinks(a('./intro.md?v=1'), current, set)).toBe(a('./intro.html?v=1'))
  })

  it('preserves encoding when the decoded name is in the set', () => {
    expect(rewriteInternalLinks(a('./My%20Doc.md'), current, set)).toBe(a('./My%20Doc.html'))
  })

  it('leaves a relative .md link whose target is not in the set', () => {
    expect(rewriteInternalLinks(a('./missing.md'), current, set)).toBe(a('./missing.md'))
  })

  it('leaves http(s), mailto, protocol-relative, and absolute links', () => {
    for (const href of ['https://x.com/a.md', 'http://x/a.md', 'mailto:a@b.com', '//cdn/a.md', '/docs/intro.md']) {
      expect(rewriteInternalLinks(a(href), current, set)).toBe(a(href))
    }
  })

  it('leaves in-page anchors and non-markdown targets', () => {
    for (const href of ['#section', 'image.png', 'file.pdf', 'page.html']) {
      expect(rewriteInternalLinks(a(href), current, set)).toBe(a(href))
    }
  })

  it('is case-sensitive on the extension target', () => {
    // set holds guide.md; a link to guide.MD must not match
    expect(rewriteInternalLinks(a('./guide.MD'), current, set)).toBe(a('./guide.MD'))
  })

  it('rewrites only the hits when a document mixes hit and miss links', () => {
    const html = `${a('./intro.md')}${a('./missing.md')}${a('https://x.com/a.md')}`
    const expected = `${a('./intro.html')}${a('./missing.md')}${a('https://x.com/a.md')}`
    expect(rewriteInternalLinks(html, current, set)).toBe(expected)
  })

  it('does not touch .md text outside <a href> (e.g. code or img src)', () => {
    const html = '<code>./intro.md</code> <img src="./intro.md">'
    expect(rewriteInternalLinks(html, current, set)).toBe(html)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npx vitest run test/links.test.ts`
Expected: FAIL — cannot resolve `'../src/links'` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/links.ts`:

```ts
import { resolve, dirname } from 'node:path'

const MD_EXT = /\.(md|markdown)$/i
// A URL scheme (http:, mailto:, etc.) — leave those alone.
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

/**
 * Rewrite relative Markdown links to their .html equivalents, but only when the
 * link's resolved target is a file in this conversion run (convertedSet). Every
 * other href — external, absolute, in-page anchor, non-markdown, or a relative
 * .md whose target is not being converted — is left byte-for-byte unchanged.
 *
 * @param html the rendered body HTML
 * @param currentFile absolute path of the source .md file being rendered
 * @param convertedSet resolved absolute paths of every source file in this run
 */
export function rewriteInternalLinks(
  html: string,
  currentFile: string,
  convertedSet: Set<string>,
): string {
  const baseDir = dirname(currentFile)
  return html.replace(/(<a\b[^>]*?\shref=")([^"]*)(")/gi, (match, pre, href, post) => {
    const rewritten = rewriteHref(href, baseDir, convertedSet)
    return rewritten === undefined ? match : `${pre}${rewritten}${post}`
  })
}

/** Returns the rewritten href value, or undefined to leave the original unchanged. */
function rewriteHref(href: string, baseDir: string, convertedSet: Set<string>): string | undefined {
  if (!href) return undefined
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('//')) return undefined
  if (HAS_SCHEME.test(href)) return undefined

  // Split off the first #fragment or ?query, preserving it verbatim.
  const suffixIdx = firstSuffixIndex(href)
  const path = suffixIdx === -1 ? href : href.slice(0, suffixIdx)
  const suffix = suffixIdx === -1 ? '' : href.slice(suffixIdx)

  if (!MD_EXT.test(path)) return undefined

  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return undefined
  }

  const target = resolve(baseDir, decoded)
  if (!convertedSet.has(target)) return undefined

  const newPath = path.replace(MD_EXT, '.html')
  return `${newPath}${suffix}`
}

function firstSuffixIndex(href: string): number {
  const hash = href.indexOf('#')
  const query = href.indexOf('?')
  if (hash === -1) return query
  if (query === -1) return hash
  return Math.min(hash, query)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npx vitest run test/links.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Typecheck**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npm run typecheck`
Expected: no errors.

---

## Task 2: Wire the converted set through the CLI

**Files:**
- Modify: `src/cli.ts` (add import; thread `convertedSet` through `run` → `runSingle`/`runDirectory` → `renderMarkdown`; call `rewriteInternalLinks`)
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Add this block to the end of `test/cli.test.ts` (inside the file, after the existing `describe('cli run() — folder input', …)` block — place it as a new top-level `describe`). It reuses the already-imported `mkdtempSync, mkdirSync, writeFileSync, readFileSync, join, run`:

```ts
describe('cli run() — internal link rewriting', () => {
  it('rewrites .md links between converted files, keeps unconverted and external links', async () => {
    const root = mkdtempSync(join(tmpdir(), 'md2html-links-'))
    mkdirSync(join(root, 'sub'), { recursive: true })
    writeFileSync(
      join(root, 'a.md'),
      '# A\n\n[to b](./sub/b.md) [missing](./nope.md) [ext](https://x.com/y.md) [anchor](#top)',
    )
    writeFileSync(join(root, 'sub', 'b.md'), '# B\n\n[back to a](../a.md)')

    const code = await run([root, '--theme', 'claude'])
    expect(code).toBe(0)

    const aHtml = readFileSync(join(root, 'a.html'), 'utf8')
    expect(aHtml).toContain('href="./sub/b.html"')      // converted → rewritten
    expect(aHtml).toContain('href="./nope.md"')          // not converted → unchanged
    expect(aHtml).toContain('href="https://x.com/y.md"') // external → unchanged
    expect(aHtml).toContain('href="#top"')               // anchor → unchanged

    const bHtml = readFileSync(join(root, 'sub', 'b.html'), 'utf8')
    expect(bHtml).toContain('href="../a.html"')          // ../ traversal into converted set
  })

  it('leaves .md links untouched for a single-file conversion', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'md2html-single-'))
    writeFileSync(join(dir, 'sibling.md'), '# Sibling')
    const input = join(dir, 'main.md')
    writeFileSync(input, '# Main\n\n[to sibling](./sibling.md)')

    const code = await run([input, '--theme', 'claude'])
    expect(code).toBe(0)

    const html = readFileSync(input.replace(/\.md$/, '.html'), 'utf8')
    expect(html).toContain('href="./sibling.md"') // single-file mode → not rewritten
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npx vitest run test/cli.test.ts --test-timeout=30000 -t "internal link rewriting"`
Expected: FAIL — `a.html` contains `href="./sub/b.md"` (not yet rewritten), so the `./sub/b.html` assertion fails.

- [ ] **Step 3: Add the import in `src/cli.ts`**

At the top of `src/cli.ts`, after the existing `import { buildKatexCss } from './math/katex-css'` line, add:

```ts
import { rewriteInternalLinks } from './links'
```

- [ ] **Step 4: Compute the converted set and branch with it in `run()`**

In `src/cli.ts`, replace the final directory/single branch of `run()`:

```ts
  if (stats.isDirectory()) {
    return runDirectory(inputPath, values.output as string | undefined, theme, embedFonts)
  }

  return runSingle(inputPath, values.output as string | undefined, theme, embedFonts)
}
```

with:

```ts
  if (stats.isDirectory()) {
    return runDirectory(inputPath, values.output as string | undefined, theme, embedFonts)
  }

  // Single-file mode: the converted set is just this file, so cross-file .md
  // links are never rewritten (a link to another file has no .html to point to).
  const convertedSet = new Set([resolve(inputPath)])
  return runSingle(inputPath, values.output as string | undefined, theme, embedFonts, convertedSet)
}
```

- [ ] **Step 5: Thread the set into `runSingle`**

In `src/cli.ts`, change the `runSingle` signature and its `renderMarkdown` call. Replace:

```ts
async function runSingle(
  inputPath: string,
  output: string | undefined,
  theme: Theme,
  embedFonts: boolean,
): Promise<number> {
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch {
    process.stderr.write(`Error: cannot read input file "${inputPath}"\n`)
    return 1
  }

  const outputPath = output ?? resolve(inputPath.replace(MD_EXT, '') + '.html')
  const html = await renderMarkdown(raw, inputPath, theme, embedFonts)
```

with:

```ts
async function runSingle(
  inputPath: string,
  output: string | undefined,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
): Promise<number> {
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch {
    process.stderr.write(`Error: cannot read input file "${inputPath}"\n`)
    return 1
  }

  const outputPath = output ?? resolve(inputPath.replace(MD_EXT, '') + '.html')
  const html = await renderMarkdown(raw, inputPath, theme, embedFonts, convertedSet)
```

- [ ] **Step 6: Build the set in `runDirectory` and thread it in**

In `src/cli.ts`, `runDirectory` already computes `const files = collectMarkdown(root)`. Add the set right after that line and pass it into the per-file `renderMarkdown`. Replace:

```ts
  const root = resolve(inputDir)
  const outRoot = output ? resolve(output) : root
  const files = collectMarkdown(root)

  if (files.length === 0) {
```

with:

```ts
  const root = resolve(inputDir)
  const outRoot = output ? resolve(output) : root
  const files = collectMarkdown(root)
  // collectMarkdown already returns absolute paths (join on a resolved root),
  // so this set matches what rewriteInternalLinks resolves link targets to.
  const convertedSet = new Set(files)

  if (files.length === 0) {
```

Then, in the same function, replace:

```ts
    const outputPath = join(outRoot, relative(root, file).replace(MD_EXT, '') + '.html')
    const html = await renderMarkdown(raw, file, theme, embedFonts)
```

with:

```ts
    const outputPath = join(outRoot, relative(root, file).replace(MD_EXT, '') + '.html')
    const html = await renderMarkdown(raw, file, theme, embedFonts, convertedSet)
```

- [ ] **Step 7: Apply the rewrite in `renderMarkdown`**

In `src/cli.ts`, change `renderMarkdown` to accept the set and rewrite links after conversion. Replace:

```ts
async function renderMarkdown(
  raw: string,
  inputPath: string,
  theme: Theme,
  embedFonts: boolean,
): Promise<string> {
  const { metadata, bodyHtml, hasMath, lang, toc, warnings } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {})
  const fmTitle = typeof metadata.title === 'string' ? metadata.title : undefined
  const title = fmTitle ?? basename(inputPath, extname(inputPath))
```

with:

```ts
async function renderMarkdown(
  raw: string,
  inputPath: string,
  theme: Theme,
  embedFonts: boolean,
  convertedSet: Set<string>,
): Promise<string> {
  const { metadata, bodyHtml: rawBody, hasMath, lang, toc, warnings } = await convert(raw, theme.shikiTheme, theme.mermaid ?? {})
  const bodyHtml = rewriteInternalLinks(rawBody, resolve(inputPath), convertedSet)
  const fmTitle = typeof metadata.title === 'string' ? metadata.title : undefined
  const title = fmTitle ?? basename(inputPath, extname(inputPath))
```

(The rest of `renderMarkdown` — `fontFaceCss`, `katexCss`, warnings loop, and the `assembleDocument({ …, bodyHtml, … })` return — stays exactly as-is; it already references `bodyHtml`.)

- [ ] **Step 8: Run the new integration tests to verify they pass**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npx vitest run test/cli.test.ts --test-timeout=30000 -t "internal link rewriting"`
Expected: PASS — both tests green.

- [ ] **Step 9: Run the full CLI + links suites to check for regressions**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npx vitest run test/cli.test.ts test/links.test.ts --test-timeout=30000`
Expected: PASS — all CLI tests (including the earlier single-file, folder, math, TOC, and Mermaid cases) plus all link unit tests.

- [ ] **Step 10: Typecheck**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npm run typecheck`
Expected: no errors.

---

## Task 3: Full suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite scoped to `test/`**

Run: `cd /Users/connoryu/Downloads/workspace/md2html && npx vitest run test/ --test-timeout=30000`
Expected: PASS — prior baseline was 218 passed / 2 skipped; new total should be that plus the new link tests (Task 1 unit tests + Task 2 integration tests), still 2 skipped.

If any snapshot test fails because rewritten links changed an HTML snapshot, inspect the diff to confirm it is only expected `.md`→`.html` href changes for in-set links, then update snapshots with `npx vitest run test/ --test-timeout=30000 -u` and re-run.

- [ ] **Step 2: Manual smoke test on a small tree**

Run:
```bash
cd /Users/connoryu/Downloads/workspace/md2html
rm -rf /tmp/md2html-links-smoke && mkdir -p /tmp/md2html-links-smoke/sub
printf '# A\n\n[to b](./sub/b.md) [ext](https://example.com/x.md) [anchor](#a)\n' > /tmp/md2html-links-smoke/a.md
printf '# B\n\n[home](../a.md)\n' > /tmp/md2html-links-smoke/sub/b.md
node dist/cli.js /tmp/md2html-links-smoke --theme claude 2>/dev/null || (npm run build && node dist/cli.js /tmp/md2html-links-smoke --theme claude)
grep -o 'href="[^"]*"' /tmp/md2html-links-smoke/a.html
grep -o 'href="[^"]*"' /tmp/md2html-links-smoke/sub/b.html
```
Expected: `a.html` shows `href="./sub/b.html"`, `href="https://example.com/x.md"`, `href="#a"`; `b.html` shows `href="../a.html"`.

- [ ] **Step 3: Clean up smoke-test artifacts**

Run: `rm -rf /tmp/md2html-links-smoke`

---

## Self-Review Notes

- **Spec coverage:** In-set-only rewrite (Task 1 `rewriteHref` membership test + Task 2 set construction); single-file leaves links untouched (Task 2 Step 4 singleton set + integration test); preserve `#frag`/`?query` (Task 1 `firstSuffixIndex`, tests); case-sensitive match (`Set.has`, `guide.MD` test); post-render in CLI keeping `convert()` pure (Task 2 Step 7 applies rewrite in `renderMarkdown`, no `convert.ts` change); external/absolute/protocol-relative/anchor/non-md all skipped (Task 1 early rejects + tests); percent-encoding decode-for-match/preserve-on-rewrite (test + `decodeURIComponent`). No image/`link`/`script` rewriting (regex targets `<a … href>` only; "img src" test guards it). All spec requirements map to a task.
- **Placeholder scan:** No TBD/TODO/"add error handling"; every code step shows full code; every command shows expected output.
- **Type consistency:** `rewriteInternalLinks(html: string, currentFile: string, convertedSet: Set<string>): string` is defined identically in Task 1 and called with matching argument types in Task 2 (`resolve(inputPath)` string, `convertedSet` Set<string>). `runSingle` gains a 5th param `convertedSet: Set<string>` and is called with 5 args. `renderMarkdown` gains a 5th param and both call sites pass 5 args.
