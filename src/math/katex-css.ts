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
