---
title: Reading Markdown, Beautifully
---

# Reading Markdown, Beautifully

`md2html` turns any Markdown file into an HTML page you actually enjoy reading.

## Why

Good typography is invisible — you just feel that reading is effortless.

> [!TIP]
> Run `md2html sample.md` and open the result in your browser.

## A little code

```ts
import { convert } from 'md2html'
const { bodyHtml } = await convert(markdown, 'vitesse-dark')
```

## A small table

| Feature   | Status |
|-----------|--------|
| Callouts  | ✅     |
| Footnotes | ✅     |

That's it.[^1]

[^1]: Themes are swappable — Claude is just the first.
