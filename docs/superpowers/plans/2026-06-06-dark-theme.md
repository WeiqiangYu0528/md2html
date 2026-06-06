# Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dark theme `claude-dark` (selected via `--theme claude-dark`) built as a thin palette override on a fully variable-driven Claude theme, via lightweight theme inheritance. Zero runtime JS.

**Architecture:** (1) Route every Claude color through a `:root` CSS variable — output-identical. (2) Add a manifest `extends` field: `loadTheme` prepends the base theme's CSS and inherits its body scope class; `assemble` uses `scopeClass`. (3) `claude-dark` is a dark `:root` override + its own dark Shiki palette + dark Mermaid config.

**Tech Stack:** CSS custom properties, TypeScript (ESM, strict). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-06-dark-theme-design.md`

---

## Key facts (current code, verified)

- `themes/claude/theme.css` (342 lines) has 8 `:root` vars and these hardcoded colors to varify:
  heading `#1a1915` (line 42); `pre.shiki` border `#e7e0d2` (line 79 — equals `--rule`); generic
  callout border `rgba(120, 95, 70, 0.12)` (line 100); callout edges/bgs (lines 140–144) and
  titles (lines 145–149); table header `#f7f3ea` (line 181); row-hover `rgba(0,0,0,0.02)`
  (line 184); checkbox border `#c3b8a0` (line 196), face `#fbf7ee` (lines 198 and 211).
- `src/themes.ts` `loadTheme` reads `theme.json` → manifest, reads `theme.css`, resolves
  `shikiThemeFile`/`shikiTheme`, returns `{ name, description, shikiTheme, fonts, css, dir, mermaid }`.
- `src/types.ts` defines `Theme`. `test/fonts.test.ts` builds a `Theme` literal manually (so any
  new required field would break it — make `scopeClass` OPTIONAL).
- `src/assemble.ts` emits `<body class="theme-${theme.name}">` (line ~34).
- The kitchen-sink snapshot inlines the full `theme.css`, so the Task-1 refactor regenerates it
  (CSS text changes; rendered colors identical). Task 2 does NOT change Claude's output
  (scopeClass for claude is 'claude'), so the snapshot is unchanged there.

## File structure

- **Modify** `themes/claude/theme.css` — add ~21 `:root` vars; replace inline colors with `var()`.
- **Modify** `src/types.ts` — `Theme.scopeClass?: string`.
- **Modify** `src/themes.ts` — `extends` handling + `scopeClass`.
- **Modify** `src/assemble.ts` — body class from `scopeClass`.
- **Create** `themes/claude-dark/theme.json`, `themes/claude-dark/theme.css`, `themes/claude-dark/code-theme.json`.
- **Modify** `THEME-CONTRACT.md`.
- **Modify** `test/themes.test.ts`, `test/assemble.test.ts`, snapshot.

---

### Task 1: Claude theme — route all colors through CSS variables (output-preserving)

**Files:** Modify `themes/claude/theme.css`; Modify `test/__snapshots__/snapshot.test.ts.snap`.

**This must not change any rendered color** — every new variable equals the hex it replaces.

- [ ] **Step 1: Replace the `:root` block** (lines 6–15) with the expanded palette:
```css
:root {
  --bg: #faf9f5;
  --ink: #2b2a26;
  --muted: #6b655c;
  --accent: #cc785c;
  --accent-strong: #a64f34;
  --rule: #e7e0d2;
  --tint: #f3ede1;
  --code-inline-bg: #efe9df;
  --heading-ink: #1a1915;
  --callout-border: rgba(120, 95, 70, 0.12);
  --callout-note-edge: #b0a48f;
  --callout-note-bg: #f2ede1;
  --callout-note-title: #7a6f5b;
  --callout-tip-edge: #8a9a6e;
  --callout-tip-bg: #eef1e4;
  --callout-tip-title: #5f6f43;
  --callout-important-edge: #79a59c;
  --callout-important-bg: #e9efec;
  --callout-important-title: #3f6f66;
  --callout-warning-edge: #cda14e;
  --callout-warning-bg: #f7efda;
  --callout-warning-title: #936c1f;
  --callout-caution-edge: #b14a38;
  --callout-caution-bg: #f4e3de;
  --callout-caution-title: #9a2f23;
  --table-head-bg: #f7f3ea;
  --row-hover: rgba(0, 0, 0, 0.02);
  --checkbox-border: #c3b8a0;
  --checkbox-face: #fbf7ee;
}
```

- [ ] **Step 2: Replace the heading color.** Change `  color: #1a1915;` (in the `h1…h6` rule) to:
```css
  color: var(--heading-ink);
```

- [ ] **Step 3: Replace the code-block border.** Change `  border: 1px solid #e7e0d2;` (in `pre.shiki`) to:
```css
  border: 1px solid var(--rule);
```

- [ ] **Step 4: Replace the generic callout border.** Change `  border: 1px solid rgba(120, 95, 70, 0.12);` (in `.callout`) to:
```css
  border: 1px solid var(--callout-border);
```

- [ ] **Step 5: Replace the callout edge/background lines.** Replace the five lines (currently lines 140–144) with:
```css
.theme-claude .callout-note { border-left-color: var(--callout-note-edge); background: var(--callout-note-bg); }
.theme-claude .callout-tip { border-left-color: var(--callout-tip-edge); background: var(--callout-tip-bg); }
.theme-claude .callout-important { border-left-color: var(--callout-important-edge); background: var(--callout-important-bg); }
.theme-claude .callout-warning { border-left-color: var(--callout-warning-edge); background: var(--callout-warning-bg); }
.theme-claude .callout-caution { border-left-color: var(--callout-caution-edge); background: var(--callout-caution-bg); }
```

- [ ] **Step 6: Replace the callout title lines.** Replace the five lines (currently 145–149) with:
```css
.theme-claude .callout-note .callout-title { color: var(--callout-note-title); }
.theme-claude .callout-tip .callout-title { color: var(--callout-tip-title); }
.theme-claude .callout-important .callout-title { color: var(--callout-important-title); }
.theme-claude .callout-warning .callout-title { color: var(--callout-warning-title); }
.theme-claude .callout-caution .callout-title { color: var(--callout-caution-title); }
```

- [ ] **Step 7: Replace the table-header background.** Change `  background: #f7f3ea;` (in `thead th`) to:
```css
  background: var(--table-head-bg);
```

- [ ] **Step 8: Replace the row-hover.** Change `.theme-claude tbody tr:hover { background: rgba(0, 0, 0, 0.02); }` to:
```css
.theme-claude tbody tr:hover { background: var(--row-hover); }
```

- [ ] **Step 9: Replace the checkbox colors.** In `.task-list-item input`, change `  border: 1.5px solid #c3b8a0;` to `  border: 1.5px solid var(--checkbox-border);` and `  background: #fbf7ee;` to `  background: var(--checkbox-face);`. In the `input:checked::after` rule, change `  background-color: #fbf7ee;` to `  background-color: var(--checkbox-face);`.

- [ ] **Step 10: Verify no stray hardcoded colors remain** (outside `:root`, data-URI icons, and `color-mix`/`currentColor`):
```bash
grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' themes/claude/theme.css | grep -v 'var(--' | grep -v 'data:image' | grep -vE ':root|--[a-z]'
```
Expected: **no output** (the grep excludes `var(--…)`, data-URI icons, and any line declaring a `--variable`, so the only thing it could surface is a literal color still sitting in a `.theme-claude …` rule). If it prints any line, that rule still has a hardcoded color — varify it too (the masked-SVG `%23000` data URIs are already excluded and are fine).

- [ ] **Step 11: Build, render, and regenerate the snapshot.** Run:
```bash
npm run build && node dist/cli.js samples/demo.md
npx vitest run test/snapshot.test.ts -u
```
Then `git diff test/__snapshots__/snapshot.test.ts.snap` and confirm the ONLY changes are: (1) the added `:root` variables, and (2) inline colors replaced by `var(--…)` — every variable value equals the hex it replaced, so NO rendered color changed. `<body class="theme-claude">` and all body markup are unchanged. If any color VALUE differs (not just an inline→var substitution), STOP and report.

- [ ] **Step 12: Run the full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass.

- [ ] **Step 13: Commit**
```bash
git add themes/claude/theme.css test/__snapshots__/snapshot.test.ts.snap
git commit -m "refactor(theme): route all Claude colors through CSS variables (output-identical)"
```

---

### Task 2: Theme inheritance (`extends` + `scopeClass`)

**Files:** Modify `src/types.ts`, `src/themes.ts`, `src/assemble.ts`; Modify `test/themes.test.ts`, `test/assemble.test.ts`.

- [ ] **Step 1: Write the failing tests.**

Append to `test/themes.test.ts` (inside its existing `describe`):
```ts
  it('sets scopeClass to the theme name for a base theme', () => {
    expect(loadTheme('claude').scopeClass).toBe('claude')
  })
```
Append to `test/assemble.test.ts` (inside its existing `describe`):
```ts
  it('uses the theme scopeClass for the body class', () => {
    const t = { ...theme, name: 'claude-dark', scopeClass: 'claude' }
    const html = assembleDocument({ title: 'T', bodyHtml: '', theme: t })
    expect(html).toContain('<body class="theme-claude">')
  })
```

- [ ] **Step 2: Run the tests to verify they fail** — Run: `npx vitest run test/themes.test.ts test/assemble.test.ts` → expect FAIL (`scopeClass` undefined; body uses `theme-claude-dark`).

- [ ] **Step 3: Add `scopeClass` to the Theme type.** In `src/types.ts`, add to the `Theme` interface:
```ts
  /** Body scope class (CSS selector prefix). A theme that `extends` another uses the base's. */
  scopeClass?: string
```

- [ ] **Step 4: Implement `extends` in `loadTheme`.** In `src/themes.ts`, replace the body of `loadTheme` so it computes inherited CSS + scopeClass. Change:
```ts
  const manifest = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8'))
  const css = readFileSync(join(dir, 'theme.css'), 'utf8')
  const shikiTheme = manifest.shikiThemeFile
    ? JSON.parse(readFileSync(join(dir, manifest.shikiThemeFile), 'utf8'))
    : manifest.shikiTheme
  return {
    name: manifest.name,
    description: manifest.description,
    shikiTheme,
    fonts: manifest.fonts ?? [],
    css,
    dir,
    mermaid: manifest.mermaid,
  }
```
to:
```ts
  const manifest = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8'))
  const ownCss = readFileSync(join(dir, 'theme.css'), 'utf8')
  const shikiTheme = manifest.shikiThemeFile
    ? JSON.parse(readFileSync(join(dir, manifest.shikiThemeFile), 'utf8'))
    : manifest.shikiTheme

  // Theme inheritance: a theme may `extends` a base, inheriting its CSS (prepended)
  // and its body scope class so the base's structural rules apply. The child's CSS
  // comes last, so its `:root` palette override wins. Other fields (code palette,
  // mermaid, fonts) are the child's own.
  let css = ownCss
  let scopeClass = manifest.name as string
  if (manifest.extends) {
    const base = loadTheme(manifest.extends)
    css = base.css + '\n' + ownCss
    scopeClass = base.scopeClass ?? base.name
  }

  return {
    name: manifest.name,
    description: manifest.description,
    shikiTheme,
    fonts: manifest.fonts ?? [],
    css,
    dir,
    mermaid: manifest.mermaid,
    scopeClass,
  }
```

- [ ] **Step 5: Use `scopeClass` in assemble.** In `src/assemble.ts`, change:
```ts
<body class="theme-${theme.name}">
```
to:
```ts
<body class="theme-${theme.scopeClass ?? theme.name}">
```

- [ ] **Step 6: Run the tests** — Run: `npx vitest run test/themes.test.ts test/assemble.test.ts` → expect PASS.

- [ ] **Step 7: Verify no snapshot drift** — Run: `npx vitest run test/snapshot.test.ts` → expect PASS with NO change (claude's scopeClass is 'claude', so `<body class="theme-claude">` is unchanged). If it fails, STOP and report (do not `-u`).

- [ ] **Step 8: Full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass.

- [ ] **Step 9: Commit**
```bash
git add src/types.ts src/themes.ts src/assemble.ts test/themes.test.ts test/assemble.test.ts
git commit -m "feat(theme): theme inheritance via manifest extends + scopeClass"
```

---

### Task 3: The `claude-dark` theme

**Files:** Create `themes/claude-dark/theme.json`, `themes/claude-dark/theme.css`, `themes/claude-dark/code-theme.json`; Modify `test/themes.test.ts`.

- [ ] **Step 1: Write the failing tests.** Append to `test/themes.test.ts` (inside its existing `describe`):
```ts
  it('lists claude-dark', () => {
    expect(listThemes()).toContain('claude-dark')
  })

  it('loads claude-dark as an extension of claude (dark palette + base structure)', () => {
    const theme = loadTheme('claude-dark')
    expect(theme.name).toBe('claude-dark')
    expect(theme.scopeClass).toBe('claude')                 // inherits base scope class
    expect(theme.css).toContain('.theme-claude .md-content') // base structural rule inherited
    expect(theme.css).toContain('--bg: #1b1916')             // dark :root override present
    expect(theme.css.indexOf('--bg: #faf9f5')).toBeLessThan(theme.css.indexOf('--bg: #1b1916')) // light first, dark wins
    expect(theme.shikiTheme).toBeTypeOf('object')            // own dark code palette
    expect(theme.mermaid).toBeTypeOf('object')               // own dark mermaid config
  })
```
Ensure `listThemes` is imported in `test/themes.test.ts` (it already imports `loadTheme, listThemes`).

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run test/themes.test.ts` → expect FAIL (theme missing).

- [ ] **Step 3: Create `themes/claude-dark/theme.json`:**
```json
{
  "name": "claude-dark",
  "description": "Warm Serif Essay — dark.",
  "extends": "claude",
  "shikiThemeFile": "code-theme.json",
  "fonts": [],
  "mermaid": {
    "theme": "base",
    "themeVariables": {
      "fontFamily": "Georgia, 'Iowan Old Style', serif",
      "primaryColor": "#25221d",
      "primaryTextColor": "#e6e1d6",
      "primaryBorderColor": "#e0926d",
      "secondaryColor": "#21251c",
      "tertiaryColor": "#1b1916",
      "lineColor": "#eba883",
      "textColor": "#e6e1d6",
      "mainBkg": "#25221d",
      "nodeBorder": "#e0926d",
      "clusterBkg": "#1f1c18",
      "clusterBorder": "#38332c",
      "noteBkgColor": "#2a2417",
      "noteTextColor": "#e6e1d6"
    }
  }
}
```

- [ ] **Step 4: Create `themes/claude-dark/theme.css`** — ONLY a dark `:root` override (it inherits all of Claude's structural CSS):
```css
/* Claude Dark — a warm dark sibling of the Claude essay theme. Inherits all of
   Claude's structure via `extends`; this file only re-paints the palette. */
:root {
  --bg: #1b1916;
  --ink: #e6e1d6;
  --muted: #9c9486;
  --accent: #e0926d;
  --accent-strong: #eba883;
  --rule: #38332c;
  --tint: #25221d;
  --code-inline-bg: #2c2820;
  --heading-ink: #f4f0e7;
  --callout-border: rgba(255, 245, 230, 0.10);
  --callout-note-edge: #9a8e78;
  --callout-note-bg: #262420;
  --callout-note-title: #cbc1ab;
  --callout-tip-edge: #8a9a6e;
  --callout-tip-bg: #21251c;
  --callout-tip-title: #b3c393;
  --callout-important-edge: #6fa097;
  --callout-important-bg: #1d2624;
  --callout-important-title: #93c7bd;
  --callout-warning-edge: #cda14e;
  --callout-warning-bg: #2a2417;
  --callout-warning-title: #d9b873;
  --callout-caution-edge: #c4584a;
  --callout-caution-bg: #2a1d1a;
  --callout-caution-title: #e0998c;
  --table-head-bg: #25221d;
  --row-hover: rgba(255, 255, 255, 0.04);
  --checkbox-border: #4a443a;
  --checkbox-face: #1b1916;
}
```

- [ ] **Step 5: Create `themes/claude-dark/code-theme.json`** — a dark warm Shiki palette:
```json
{
  "name": "claude-code-dark",
  "type": "dark",
  "colors": {
    "editor.background": "#211e1a",
    "editor.foreground": "#d6d0c4"
  },
  "tokenColors": [
    { "scope": ["comment", "punctuation.definition.comment", "string.comment"], "settings": { "foreground": "#8a8270", "fontStyle": "italic" } },
    { "scope": ["keyword", "storage.type", "storage.modifier", "keyword.control", "keyword.control.import", "keyword.control.from", "keyword.operator.new", "keyword.operator.expression"], "settings": { "foreground": "#e0926d" } },
    { "scope": ["string", "string.quoted", "string.template", "punctuation.definition.string"], "settings": { "foreground": "#a7b884" } },
    { "scope": ["constant.numeric", "constant.language", "constant.language.boolean", "constant.other"], "settings": { "foreground": "#d98a6a" } },
    { "scope": ["entity.name.function", "support.function", "meta.function-call.generic", "variable.function"], "settings": { "foreground": "#d9a441" } },
    { "scope": ["entity.name.type", "entity.name.class", "support.type", "support.class", "storage.type.class"], "settings": { "foreground": "#cda96b" } },
    { "scope": ["variable", "variable.other", "variable.other.readwrite", "meta.definition.variable"], "settings": { "foreground": "#d6d0c4" } },
    { "scope": ["variable.parameter", "meta.parameter"], "settings": { "foreground": "#c4a47e" } },
    { "scope": ["variable.other.property", "support.variable.property", "meta.object-literal.key"], "settings": { "foreground": "#c7b088" } },
    { "scope": ["keyword.operator", "punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"], "settings": { "foreground": "#8c857a" } },
    { "scope": ["entity.name.tag", "punctuation.definition.tag"], "settings": { "foreground": "#e0926d" } },
    { "scope": ["entity.other.attribute-name"], "settings": { "foreground": "#d9a441" } }
  ]
}
```

- [ ] **Step 6: Run the tests** — Run: `npx vitest run test/themes.test.ts` → expect PASS.

- [ ] **Step 7: Build and render the dark sample** — Run:
```bash
npm run build && node dist/cli.js samples/demo.md --theme claude-dark -o samples/demo.dark.html
grep -c '<body class="theme-claude">' samples/demo.dark.html
grep -c 'background-color:#211e1a' samples/demo.dark.html
```
Expected: first = 1 (dark theme uses the inherited `theme-claude` scope class), second ≥ 1 (the dark code palette is inlined). If the first is 0, STOP and report.

- [ ] **Step 8: Visual verification (controller).** Note in your report that the controller must open `samples/demo.dark.html` and confirm: dark warm background, readable off-white text, links/accents legible, code block, all five callouts, table, checkboxes, TOC, math, and the diagram all dark-themed and cohesive with adequate contrast. The palette values (theme.css / code-theme.json / mermaid) may need tuning — flag for the controller.

- [ ] **Step 9: Full suite + typecheck** — Run: `npm test && npm run typecheck` → expect all pass.

- [ ] **Step 10: Commit** (the rendered `samples/*.html` is gitignored, so it won't be committed):
```bash
git add themes/claude-dark/
git commit -m "feat(theme): add claude-dark — a warm dark sibling theme"
```

---

### Task 4: Theme contract documentation

**Files:** Modify `THEME-CONTRACT.md`.

- [ ] **Step 1: Document `extends`.** In `THEME-CONTRACT.md`, in the `## theme.json` section, add after the existing field descriptions:
```markdown
A theme may set `extends` to the name of a base theme. It then inherits the base's CSS
(prepended) and the base's body scope class (`<body class="theme-<base>">`), so the base's
structural rules apply; the extending theme's own `theme.css` comes last, so a `:root` palette
override wins. Other fields (`shikiThemeFile`/`shikiTheme`, `mermaid`, `fonts`) are the
extending theme's own — e.g. `claude-dark` extends `claude` and supplies only a dark palette,
a dark code theme, and a dark Mermaid config.
```

- [ ] **Step 2: Commit**
```bash
git add THEME-CONTRACT.md
git commit -m "docs(theme): document the extends inheritance mechanism"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all suites pass.
- [ ] `npm run typecheck` — clean.
- [ ] `node dist/cli.js samples/demo.md` (light) is visually unchanged from before the refactor.
- [ ] `node dist/cli.js samples/demo.md --theme claude-dark -o /tmp/dark.html` then open it — dark, warm, cohesive, readable; all elements dark-themed. (Controller visual check; tune palette values if needed.)
- [ ] `node dist/cli.js --list-themes` shows both `claude` and `claude-dark`.
