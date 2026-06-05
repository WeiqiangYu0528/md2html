import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../src/frontmatter'

describe('parseFrontmatter', () => {
  it('extracts YAML frontmatter and body', () => {
    const { metadata, content } = parseFrontmatter('---\ntitle: Hi\n---\n# Body')
    expect(metadata.title).toBe('Hi')
    expect(content.trim()).toBe('# Body')
  })

  it('returns empty metadata when there is no frontmatter', () => {
    const { metadata, content } = parseFrontmatter('# Just body')
    expect(metadata).toEqual({})
    expect(content.trim()).toBe('# Just body')
  })

  it('tolerates malformed frontmatter by treating it as no metadata', () => {
    const { metadata, content } = parseFrontmatter('---\nfoo: [unclosed\n---\nBody')
    expect(metadata).toEqual({})
    expect(content).toContain('Body')
  })
})
