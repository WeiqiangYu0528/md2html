import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Theme } from './types'

/**
 * Build a string of @font-face rules with each font inlined as a base64
 * data URI. Returns '' when the theme declares no fonts (system-font default).
 */
export function buildFontFaceCss(theme: Theme): string {
  return theme.fonts
    .map((f) => {
      const data = readFileSync(join(theme.dir, f.file)).toString('base64')
      return (
        `@font-face{font-family:"${f.family}";font-weight:${f.weight};` +
        `font-style:${f.style};font-display:swap;` +
        `src:url(data:font/woff2;base64,${data}) format("woff2");}`
      )
    })
    .join('\n')
}
