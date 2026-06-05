import { describe, it, expect } from 'vitest'
import { convert } from '../src/convert'

describe('convert', () => {
  it('combines frontmatter parsing and rendering', async () => {
    const { metadata, bodyHtml } = await convert('---\ntitle: Doc\n---\n# Hi', 'vitesse-dark')
    expect(metadata.title).toBe('Doc')
    expect(bodyHtml).toContain('id="hi"')
  })

  it('renders a body with no frontmatter', async () => {
    const { metadata, bodyHtml } = await convert('Just **text**.', 'vitesse-dark')
    expect(metadata).toEqual({})
    expect(bodyHtml).toContain('<strong>text</strong>')
  })
})
