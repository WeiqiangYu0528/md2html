# Markdown Internal Link Rewriting — Design Spec

**Date:** 2026-07-01
**Status:** Approved
**Feature:** Rewrite internal relative Markdown links (`.md` / `.markdown`) to their
`.html` equivalents during conversion, so links in the generated HTML point to the
sibling HTML file instead of the source Markdown.

---

## Problem

When md2html converts Markdown to HTML, a link such as `[Guide](./guide.md)` is emitted
verbatim as `<a href="./guide.md">`. In the rendered HTML this points at the source
Markdown file, not the converted `guide.html`. This is most visible after the folder
feature (`md2html <folder>`), which produces an interlinked tree of HTML files whose
cross-references all still point back at `.md` files.

We want to rewrite these links **without bringing any new trouble** — i.e. without
touching links that should stay as they are (external URLs, in-page anchors, images,
non-Markdown targets, or Markdown targets that are not part of this conversion run).

## Summary of decisions

| Decision | Choice |
|---|---|
| When to rewrite | Only when the link's resolved target is a file **in this conversion run** (the converted set) |
| Single-file mode | Leave all relative links untouched (the converted set is just the one input file) |
| Fragments / queries | Preserve `#frag` and `?query` verbatim; rewrite only the path portion |
| Case sensitivity | Case-sensitive path matching (output is commonly served on case-sensitive Linux) |
| Implementation | Post-render pass in the CLI (keep `convert()` pure); rewrite `href` attributes after render |
| Conversion-layer changes | None — `convert()` / the markdown-it renderer are unchanged |

## Scope — what gets rewritten

For each `<a href="…">` in the rendered body HTML, rewrite the `href` **only** when
ALL of the following hold:

1. The link is **relative** (not external, not absolute, not scheme-qualified).
2. The path portion ends in `.md` or `.markdown` (case-insensitive extension test).
3. The path, resolved relative to the current file's directory, is a member of the
   **converted set** (the exact set of files being converted in this run).

## Scope — what is left untouched (byte-for-byte)

Everything that fails any condition above is left exactly as authored:

- **External links:** anything with a URL scheme — `http:`, `https:`, `mailto:`,
  `tel:`, `ftp:`, etc. Detected by the regex `^[a-zA-Z][a-zA-Z0-9+.-]*:`.
- **Protocol-relative links:** `//host/path`.
- **Absolute paths:** `/docs/guide.md` (site-root-relative; we can't know the doc root).
- **In-page anchors:** `#section` (empty path).
- **Non-Markdown targets:** images, `.pdf`, `.css`, `.html`, directories, etc.
- **Relative `.md` links whose target is NOT in the converted set:** e.g. a link to a
  Markdown file elsewhere on disk that this run isn't converting. Leaving it as `.md`
  is correct because no corresponding `.html` will be produced.
- **Single-file mode:** because the converted set contains only the one input file, no
  relative link to a *different* file is ever rewritten. (A self-link to the same file,
  though unusual, would match and be rewritten — acceptable and consistent.)

## Matching algorithm

Given the rendered `bodyHtml`, the absolute path of the **current source file**
(`currentFile`), and the **converted set** (a `Set<string>` of resolved absolute
source paths):

For each `href` value found on an `<a>` tag:

1. **Early reject.** If `href` is empty, or starts with `#`, `/`, or `//`, or matches
   `^[a-zA-Z][a-zA-Z0-9+.-]*:` (scheme) — leave unchanged.
2. **Split path / suffix.** `suffix` = everything from the first `#` or `?` onward
   (whichever comes first), preserved verbatim; `path` = the part before it.
3. **Extension gate.** If `path` does not match `/\.(md|markdown)$/i` — leave unchanged.
4. **Decode for comparison.** `decodeURIComponent(path)` to compare real filesystem
   names (handles `%20` etc.). If decoding throws, leave unchanged.
5. **Resolve.** `resolve(dirname(currentFile), decodedPath)` and normalize `.`/`..`.
6. **Membership test.** If the resolved absolute path is in the converted set
   (case-sensitive `Set.has`) — this is a convertible internal link. Otherwise leave
   unchanged.
7. **Rewrite.** Replace the trailing `.md`/`.markdown` in the **original (still-encoded)
   `path`** with `.html`, then reattach `suffix`. Only the extension substring changes;
   the rest of the original href text (relative prefix, encoding, `./`, `../`) is
   preserved exactly. Emit the new `href` value HTML-escaped the same way markdown-it
   escaped the original.

Because the output tree mirrors the source tree (a source at `<root>/sub/a.md` becomes
`<outRoot>/sub/a.html`), any link that resolves to a converted **source** path has a
guaranteed sibling `.html` at the mirrored location, and the relative path from the
current file to it is identical after swapping the extension. So an in-place extension
swap is sufficient — no output-path remapping is required.

## Implementation approach (A: post-render in the CLI)

Keep `convert()` and the markdown-it renderer **pure and filesystem-agnostic** (this is
the theme/conversion contract the project already enforces). The rewrite is a small,
self-contained transform applied in the CLI after `convert()` returns the body HTML but
before `assembleDocument()`.

### New module: `src/links.ts`

```ts
export function rewriteInternalLinks(
  html: string,
  currentFile: string,      // absolute path of the source .md being rendered
  convertedSet: Set<string> // resolved absolute paths of every file in this run
): string
```

- Pure function: same inputs → same output, no I/O. Trivially unit-testable.
- Scans `href="…"` attributes with a regex targeting `<a …>` tags only (not `<img>`),
  or an attribute-level regex constrained to anchors. It rewrites the value in place per
  the algorithm above.
- Handles both `href="…"` and `href='…'` quoting styles that markdown-it may emit
  (markdown-it uses double quotes by default; we still tolerate single quotes defensively
  at the parse level only — no behavior change otherwise).

### Wiring in `src/cli.ts`

- `run()` computes the converted set **once**:
  - **Folder mode:** the set is the result of `collectMarkdown(root)` (already computed),
    mapped through `resolve`.
  - **Single-file mode:** the set is `new Set([resolve(inputPath)])`. Per the decision,
    this means no cross-file link is rewritten.
- `renderMarkdown(raw, inputPath, theme, embedFonts, convertedSet)` gains the
  `convertedSet` parameter. After `convert()` produces `bodyHtml`, it calls
  `rewriteInternalLinks(bodyHtml, resolve(inputPath), convertedSet)` and passes the
  result to `assembleDocument()`.
- `runSingle` and `runDirectory` thread the set through. `runDirectory` passes the same
  set for every file; `runSingle` passes the singleton set.

No change to `convert.ts`, `renderer.ts`, `assemble.ts`, `types.ts`, or any theme.

## Data flow

```
run(argv)
  ├─ folder → collectMarkdown(root) ─┐
  │                                  ├─ convertedSet: Set<absPath>
  └─ single → {resolve(inputPath)} ──┘
        │
        ▼
  renderMarkdown(raw, file, theme, embedFonts, convertedSet)
        │  convert(raw, …) → bodyHtml (unchanged, .md links intact)
        ▼
  rewriteInternalLinks(bodyHtml, resolve(file), convertedSet)
        │  swaps .md→.html only for in-set relative targets
        ▼
  assembleDocument({ …, bodyHtml, … }) → final HTML
```

## Edge cases and how they're handled

| Input href | Result | Reason |
|---|---|---|
| `./guide.md` (in set) | `./guide.html` | Convertible internal link |
| `../shared/notes.markdown` (in set) | `../shared/notes.html` | Extension `.markdown` handled; `..` preserved |
| `./guide.md#setup` | `./guide.html#setup` | Fragment preserved |
| `./guide.md?v=1` | `./guide.html?v=1` | Query preserved |
| `./other.md` (NOT in set) | unchanged | Target not converted |
| `#section` | unchanged | Empty path / in-page anchor |
| `/docs/guide.md` | unchanged | Absolute path — unknown doc root |
| `https://x.com/a.md` | unchanged | Has scheme |
| `mailto:a@b.com` | unchanged | Has scheme |
| `//cdn/x.md` | unchanged | Protocol-relative |
| `image.png`, `file.pdf` | unchanged | Not a Markdown extension |
| `./My%20Doc.md` (in set as `My Doc.md`) | `./My%20Doc.html` | Decoded for match, encoding preserved on rewrite |
| `./guide.MD` (in set as `guide.md`) | unchanged (case-sensitive) | Path case must match the real filename |
| Self-link `./self.md` (current file) | `./self.html` | In set; consistent, harmless |

Note on the last row: a self-referential `.md` link is rare but, being in the set, is
rewritten to `.html`. This is consistent with the rule and points at the file's own
HTML output — acceptable, not "new trouble."

## Testing strategy

Unit tests for `src/links.ts` (`test/links.test.ts`) — pure, fast, no I/O:

- Rewrites an in-set relative `.md` and `.markdown` link.
- Preserves `#fragment` and `?query`.
- Leaves untouched: external (`http`/`https`/`mailto`), protocol-relative, absolute,
  in-page anchor, non-md extension, and in-set-miss relative `.md`.
- Handles `../` traversal resolving to an in-set file.
- Percent-encoded path matches a set entry with the decoded name; rewrite keeps encoding.
- Case-sensitivity: `guide.MD` not rewritten when the set holds `guide.md`.
- Multiple links in one document, mixed hit/miss, only hits change.
- Non-`<a>` occurrences of `.md` (e.g. inside `<code>` text or an `<img src>`) are not
  rewritten.

CLI integration tests (extend `test/cli.test.ts` folder suite) — run with
`--test-timeout=30000`, scoped to `test/`:

- A folder where `a.md` links to `./b.md` (both converted): `a.html` contains
  `href="./b.html"`.
- `a.md` links to `./missing.md` (not present): `a.html` still contains
  `href="./missing.md"`.
- A single-file conversion whose `.md` links to a sibling `.md`: link stays `.md`
  (single-file rule).
- An external link in the source is preserved in the output.

## Non-goals / YAGNI

- No rewriting of image `src`, `link`, or `script` references — only `<a href>`.
- No doc-root awareness for absolute `/…` links.
- No creation of missing target files or link validation/reporting beyond leaving
  unresolved links alone.
- No new CLI flags. Behavior is automatic and safe by construction (only in-set targets
  change).
- No config toggle to disable rewriting; the conservative in-set rule makes it safe by
  default. (Can be revisited if a real need appears.)

## Files touched

- **New:** `src/links.ts` — `rewriteInternalLinks()` pure transform.
- **New:** `test/links.test.ts` — unit tests.
- **Edit:** `src/cli.ts` — compute converted set; thread it into `renderMarkdown`;
  call `rewriteInternalLinks` after `convert()`.
- **Edit:** `test/cli.test.ts` — folder + single-file link integration tests.

No changes to the conversion layer, themes, or the theme contract.
