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
    const { metadata, bodyHtml } = await convert(raw, theme.shikiTheme)
    const html = assembleDocument({
      title: String(metadata.title ?? 'Untitled'),
      headerTitle: typeof metadata.title === 'string' ? metadata.title : undefined,
      bodyHtml,
      theme,
    })
    expect(html).toMatchSnapshot()
  })
})
