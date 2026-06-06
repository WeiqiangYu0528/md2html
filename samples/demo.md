---
title: The md2html Theme Showcase
---

This document exercises **every** feature the converter supports, so you can judge how the **Claude** theme handles real, mixed content — prose, code, tables, callouts, and more. Good typography should feel *effortless*; see if your eye glides.

## Typography & inline styles

A paragraph mixing **bold**, *italic*, ***bold italic***, `inline code`, ~~strikethrough~~, and a [hyperlink to example.com](https://example.com). Autolinking turns a bare URL like https://anthropic.com into a link automatically. Smart typography turns "straight quotes" into curly ones and -- dashes -- into en/em dashes.

### A nested list

1. First, parse the Markdown
   - Split frontmatter
   - Run the renderer
2. Then apply a theme
   - Inline the CSS
   - Optionally embed fonts
3. Write one self-contained file

### A task list

- [x] CommonMark + GFM
- [x] Footnotes & frontmatter
- [x] Callouts
- [ ] Math (deferred)
- [ ] Mermaid diagrams (deferred)

## Callouts — all five types

> [!NOTE]
> Useful information that users should know, even when skimming.

> [!TIP]
> A helpful suggestion for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.

## Code blocks

TypeScript, highlighted by Shiki with a warm parchment palette:

```ts
import { convert } from 'md2html'

async function render(markdown: string) {
  const { metadata, bodyHtml } = await convert(markdown, 'vitesse-dark')
  return { title: metadata.title, bodyHtml }
}
```

A little Python, too:

```python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

## Math

Inline math sits in the line of text — the mass–energy relation $E = mc^2$, or
Euler's identity $e^{i\pi} + 1 = 0$ — at the size of the surrounding prose.

Display math is centered on its own line:

$$\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}$$

Backslash delimiters work too: \(a^2 + b^2 = c^2\), and

\[ \sum_{k=1}^{n} k = \frac{n(n+1)}{2} \]

## A table

| Feature            | Status | Notes                          |
|--------------------|:------:|--------------------------------|
| GFM tables          | Done    | With alignment            |
| Syntax highlighting | Done    | Shiki, inline colors      |
| Callouts            | Done    | Five types                |
| Dark mode           | Planned | Deferred to a later theme |

## A blockquote

> Good typography is invisible — you just feel that reading is effortless.
> The reader should never have to fight the page.

---

That's the whole feature set.[^1] Themes are swappable; **Claude** is simply the first.[^2]

[^1]: Math, Mermaid diagrams, and an auto table-of-contents are on the roadmap.
[^2]: Adding a theme is dropping a folder under `themes/` — no parser changes.
