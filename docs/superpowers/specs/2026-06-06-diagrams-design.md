# Diagrams (Mermaid) — Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Feature:** Render ```mermaid fenced blocks to static inline SVG at build time (headless Chromium), keeping the output self-contained and zero-runtime-JS.

---

## Goal

Let authors write Mermaid diagrams in fenced ```mermaid blocks and have them appear as
crisp, static SVG in the output — no runtime JavaScript, no external requests, true to the
"one self-contained file you can open anywhere" promise.

## Summary of decisions

| Decision | Choice |
|---|---|
| Rendering | **Static SVG at build time** via headless **Chromium (Playwright)** |
| Output | Inline `<svg>` in `<figure class="mermaid">`; zero runtime JS |
| Trigger | Only when a document contains a ```mermaid block (no browser otherwise) |
| Browser dependency | **Optional** (needed only for diagrams); graceful fallback if absent |
| Degradation | Browser-unavailable OR invalid Mermaid → render the source in a styled code block with a small note; conversion never crashes |
| Security | Mermaid `securityLevel: 'strict'` (labels sanitized) |
| Colors | Declared in the **theme manifest** (`theme.json` → `mermaid` config); converter only plumbs them — invariant preserved |

## Architecture

The two-layer invariant holds. The converter emits a semantic `<figure class="mermaid">`
containing pre-rendered SVG; the theme styles the figure and *declares* the diagram color
palette as data (the converter never authors colors). This mirrors the existing
`shikiThemeFile` pattern, where the theme owns the code palette and the converter plumbs it.

Because markdown-it rendering is synchronous but Mermaid rendering is asynchronous, the flow
is a **two-pass parse→render split** (the same shape already used for the TOC).

### `src/mermaid/render.ts` (new)

```
renderMermaid(sources: string[], config?: Record<string, unknown>): Promise<string[]>
```

- Launches one headless Chromium (Playwright), loads the Mermaid library, and renders each
  source string to an SVG, returning one HTML string per input (an `<svg>…</svg>`, or — for a
  source with invalid Mermaid syntax — a fallback error block for that entry). Closes the
  browser before returning.
- Mermaid is initialized with `securityLevel: 'strict'` and the passed `config` (theme colors).
- **Throws** only when the browser itself cannot launch (e.g. Playwright/Chromium not installed)
  — the caller catches this and falls back for *all* diagrams.
- Theme-agnostic: `config` is a parameter, so the module contains no hard-coded colors.
- Designed for test isolation: the markdown integration is tested with this module **mocked**
  (no real browser); one **gated** integration test exercises the real Chromium path.

### Fence interception (`src/markdown/renderer.ts`)

`createRenderer` registers a fence-rule wrapper that runs **before** Shiki's handling:
- For info string `mermaid`: emit the pre-rendered HTML for this diagram, read from
  `env.mermaid[env.mermaidIndex++]`; if none is present (no browser / not rendered), emit the
  fallback (the source in a `<pre class="mermaid-fallback">` with a note).
- For any other language: delegate to Shiki's existing fence rule (captured at registration).

The pre-rendered results live in `env` (fresh per conversion), so the sync renderer reads them
without global state.

### `src/convert.ts`

- Gains an optional third parameter carrying the theme's Mermaid config:
  `convert(raw, shikiTheme, mermaidConfig?)`. (Existing two-arg callers are unaffected.)
- After `md.parse(content, env)`:
  - Collect the sources of all `fence` tokens whose `info` is `mermaid` (in order).
  - If there are none → skip entirely (no browser, no overhead).
  - Otherwise call `renderMermaid(sources, mermaidConfig)`; on success store the results in
    `env.mermaid` (and set `env.mermaidIndex = 0`); on a thrown browser-launch error, store
    per-diagram fallback HTML instead. (Per-source syntax errors are already fallbacks inside
    the results.)
- Then `md.renderer.render(tokens, md.options, env)` as today; the fence wrapper consumes
  `env.mermaid`.
- For testability the real `renderMermaid` import is what production uses; mermaid-exercising
  tests mock the `./mermaid/render` module.

### Theme manifest & `loadTheme`

- `theme.json` gains an optional `mermaid` object (a Mermaid config: `theme`/`themeVariables`).
- `loadTheme` reads it into `Theme.mermaid?: Record<string, unknown>`.
- `src/cli.ts` passes `theme.mermaid` as the third arg to `convert`.
- The Claude theme ships a warm, on-brand Mermaid palette so diagrams sit naturally on the
  ivory page (no jarring default blue).

## Theme styling (`themes/claude/theme.css`)

- `.theme-claude figure.mermaid` — centered, sensible vertical margin, `max-width: 100%`,
  `overflow-x: auto` for wide diagrams; the inner `svg` is `max-width: 100%; height: auto`.
- `.theme-claude .mermaid-fallback` — the degraded source block: styled like code, with a
  small muted note (e.g. via a `::before` or an adjacent caption) indicating the diagram
  wasn't rendered.
- `THEME-CONTRACT.md` documents the `figure.mermaid` / `.mermaid-fallback` hooks and the
  optional `mermaid` manifest config.

## Error handling & degradation

- **No browser available:** `renderMermaid` throws; `convert` catches and renders every diagram
  as a `.mermaid-fallback` source block with a note. Conversion succeeds (exit 0).
- **Invalid Mermaid syntax:** that single diagram becomes a `.mermaid-fallback` block; other
  diagrams still render. Conversion succeeds.
- **Security:** `securityLevel: 'strict'` so diagram labels can't inject scripts.

## Testing

- **Mocked-renderer integration** (no browser): a ```mermaid block becomes
  `<figure class="mermaid">` containing the mocked SVG; multiple diagrams map in order;
  non-mermaid fences still go through Shiki; a thrown renderer → `.mermaid-fallback` for all;
  a mocked per-source error → `.mermaid-fallback` for that one.
- **Trigger gating:** a document with no ```mermaid block never invokes the renderer.
- **`convert` plumbing:** the `mermaidConfig` arg reaches `renderMermaid` (asserted via the mock).
- **One gated real-Chromium smoke test:** render `graph TD; A-->B;` and assert the output
  contains `<svg`. Skipped automatically if the browser can't launch (so the suite stays green
  where Chromium is unavailable).
- **Visual verification** (controller): a sample with a flowchart/sequence diagram reads well
  and matches the warm Claude palette.

## Out of scope (v1, YAGNI)

- PNG/PDF export, interactive/clickable diagrams
- Per-diagram config overrides or inline directives beyond what Mermaid parses natively
- Caching rendered SVGs across runs
- Bundling a browser (we rely on an already-available/optional one)
- Non-Mermaid diagram languages (PlantUML, Graphviz, etc.)

## Feasibility note (probed — CONFIRMED)

A pre-implementation probe verified the full pipeline works in the target environment:
headless Chromium launches (~2s cold), the official **Mermaid 11.15.0** UMD bundle
(`dist/mermaid.min.js`) loads via the page, and `graph TD; A[Start]-->B-->C;` rendered to a
valid ~12 KB `<svg>` (~0.4s). `getBBox` text measurement — which Mermaid depends on — works.

Concrete implementation findings from the probe:

- **Browser resolution needs care.** The environment had only Chromium build **1208** cached;
  a newer Playwright expected build 1224 and failed. The renderer must not assume a default
  browser is present — it should locate one robustly: prefer a pinned `playwright` whose
  browser is installed (or run `npx playwright install chromium`), and allow an
  `executablePath` override (e.g. the cached `chrome-headless-shell`). The graceful-degradation
  path (source fallback) covers the case where no browser can be launched, so conversions never
  break regardless.
- **Mermaid is loaded from the installed package's dist** (`mermaid` → `dist/mermaid.min.js`),
  resolved the same way KaTeX's CSS is (`require.resolve('mermaid/package.json')` → `dist`).
  `mermaid` is added as a (regular) dependency; the heavy part is the browser, kept optional.
- **Cost:** ~2s cold browser launch + ~0.4s per diagram — acceptable for a build-time CLI; the
  browser is launched once per conversion and only when diagrams are present.

## Forward compatibility

- **Dark mode** (later): the theme can declare a dark Mermaid palette alongside the light one;
  the converter plumbing is unchanged.
