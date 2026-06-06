import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Fallback HTML for a diagram that could not be rendered (no browser, or invalid
 * Mermaid syntax): the source shown as a code block. The theme styles
 * `.mermaid-fallback` (and may add a "not rendered" note).
 */
export function mermaidFallbackHtml(source: string): string {
  return `<figure class="mermaid-fallback"><pre><code>${escapeHtml(source)}</code></pre></figure>`
}

/**
 * Render each Mermaid source to an inline-SVG `<figure class="mermaid">`. A source
 * with invalid syntax becomes a `.mermaid-fallback` block (per-source). Throws only
 * if the browser cannot launch — the caller then falls back for every diagram.
 *
 * @param config Mermaid init config (theme/themeVariables), supplied by the theme.
 */
export async function renderMermaid(
  sources: string[],
  config: Record<string, unknown> = {},
): Promise<string[]> {
  const require = createRequire(import.meta.url)
  const bundle = join(dirname(require.resolve('mermaid/package.json')), 'dist', 'mermaid.min.js')
  // Lazy import: non-diagram conversions never load Playwright; a missing
  // Playwright throws here and the caller (convert) falls back to source blocks.
  const { chromium } = await import('playwright')
  const ep = process.env.MD2HTML_CHROMIUM_PATH
  const browser = await chromium.launch(ep ? { headless: true, executablePath: ep } : { headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ path: bundle })
    const svgs: Array<string | null> = await page.evaluate(
      async ({ sources, config }) => {
        // mermaid is injected as a window global by addScriptTag
        const mermaid = (globalThis as unknown as { mermaid: any }).mermaid
        mermaid.initialize({ startOnLoad: false, ...config, securityLevel: 'strict' })
        const out: Array<string | null> = []
        for (let i = 0; i < sources.length; i++) {
          try {
            const { svg } = await mermaid.render('d' + i, sources[i])
            out.push(svg)
          } catch {
            out.push(null)
          }
        }
        return out
      },
      { sources, config },
    )
    return svgs.map((svg, i) =>
      svg ? `<figure class="mermaid">${svg}</figure>` : mermaidFallbackHtml(sources[i]),
    )
  } finally {
    await browser.close()
  }
}
