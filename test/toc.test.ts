import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'
import { collectHeadings } from '../src/toc'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('collectHeadings', () => {
  it('collects h2 and h3 with id and text, ignoring h1 and h4', () => {
    const tokens = md.parse('# Title\n\n## Intro\n\n### Details\n\n## Usage\n\n#### Tiny', {})
    const headings = collectHeadings(tokens)
    expect(headings).toEqual([
      { level: 2, id: 'intro', text: 'Intro' },
      { level: 3, id: 'details', text: 'Details' },
      { level: 2, id: 'usage', text: 'Usage' },
    ])
  })

  it('extracts plain text from formatted headings (strips markup)', () => {
    const tokens = md.parse('## A **bold** and `code` word', {})
    expect(collectHeadings(tokens)[0].text).toBe('A bold and code word')
  })
})
