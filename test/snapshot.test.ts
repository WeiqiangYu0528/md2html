import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { convert } from '../src/convert'
import { assembleDocument } from '../src/assemble'
import { loadTheme } from '../src/themes'

describe('full pipeline', () => {
  it('renders the kitchen-sink fixture to stable HTML', async () => {
    const raw = readFileSync(
      fileURLToPath(new URL('./fixtures/kitchen-sink.md', import.meta.url)),
      'utf8',
    )
    const theme = loadTheme('claude')
    const { metadata, bodyHtml, toc } = await convert(raw, theme.shikiTheme)
    const html = assembleDocument({
      title: String(metadata.title ?? 'Untitled'),
      headerTitle: typeof metadata.title === 'string' ? metadata.title : undefined,
      bodyHtml,
      theme,
      toc,
    })
    expect(html).toContain('.theme-claude figure.mermaid svg { max-width: 100%; height: auto; }')
    expect(html).toContain(`.theme-claude figure.mermaid svg foreignObject,
.theme-claude figure.mermaid svg foreignObject * {
  box-sizing: content-box;
}`)
    expect(html).toContain(`.theme-claude figure.mermaid svg foreignObject .nodeLabel,
.theme-claude figure.mermaid svg foreignObject p,
.theme-claude figure.mermaid svg foreignObject li {
  margin: 0;
  line-height: normal;
  line-break: auto;
  text-align: inherit;
  text-wrap: initial;
}`)
    expect(html).not.toContain('min-width: min(100%, 56rem);')
    expect(html).toMatchSnapshot()
  })
})
