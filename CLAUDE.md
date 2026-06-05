# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Implemented: the `md2html` CLI (Node.js + TypeScript). Converts a Markdown file to one
self-contained HTML file. Reference theme: **Claude** (Warm Serif Essay).

**Approved design spec:** [docs/superpowers/specs/2026-06-05-md2html-cli-design.md](docs/superpowers/specs/2026-06-05-md2html-cli-design.md)
**Theme contract:** [THEME-CONTRACT.md](THEME-CONTRACT.md)

## Commands

- `npm test` — run the Vitest suite · single file: `npx vitest run test/<name>.test.ts`
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — bundle to `dist/cli.js`
- `node dist/cli.js <file.md>` — convert a file (after building)

## What we're building

A tool that renders **any kind of Markdown file into HTML that is genuinely pleasant to read** — the goal is reading comfort and visual delight, not just correct conversion. Think of the output as a web page Anthropic/Claude would be proud to ship: calm typography, generous spacing, thoughtful handling of code, tables, callouts, and long-form prose.

The system is **theme-driven** and must support multiple themes over time. The first and reference theme is **Claude** — it defines the quality bar and the structure every later theme plugs into.

## Architectural intent

The two concerns below must stay strictly separated, because the whole product thesis is "same Markdown, swappable look":

1. **Conversion** — Markdown (including common extensions: GFM tables, task lists, footnotes, fenced code, etc.) → a clean, semantic HTML document. This layer is theme-agnostic. It emits meaningful structure and stable class hooks; it never bakes in colors, fonts, or spacing.
2. **Theming** — a theme owns all presentation (CSS, fonts, optional per-element rendering tweaks, syntax-highlighting palette). Themes are interchangeable and must not require changing the conversion layer. Adding a theme should mean adding a self-contained theme module, nothing more.

Keep the theme contract explicit and documented as soon as it exists: the set of semantic elements/classes the converter guarantees, and what a theme is allowed to style. A new theme author should only need that contract — never the converter internals.

### Claude theme — the quality bar

The Claude theme is the reference implementation. Design choices here (type scale, reading measure, code block treatment, link/heading styling, light/dark behavior) set the standard the other themes are measured against. When in doubt about output quality, ask "would this look at home on an Anthropic page?"

## Working conventions

- **Design decisions are real work.** Before building features, themes, or rendering behavior, use the `superpowers:brainstorming` skill to pin down intent and the theme contract — this product is mostly design decisions, and a wrong contract is expensive to unwind.
- **Don't leak presentation into conversion.** Any color/font/spacing logic appearing in the Markdown→HTML layer is a bug in the architecture.
- **Verify visually, not just structurally.** Correct HTML that reads poorly is a failure here. Check rendered output, not just that conversion ran.
- **Verify visually after changes.** Run the sample (`node dist/cli.js samples/sample.md`) and open the output to confirm rendering quality — correct HTML that reads poorly is still a failure.
