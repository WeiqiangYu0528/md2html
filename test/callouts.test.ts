import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('callouts', () => {
  it('renders a NOTE callout with the contract markup', () => {
    const html = md.render('> [!NOTE]\n> Remember this.')
    expect(html).toContain('<div class="callout callout-note">')
    expect(html).toContain('<p class="callout-title">Note</p>')
    expect(html).toContain('Remember this.')
  })

  it('renders all five callout types with the correct class', () => {
    for (const t of ['note', 'tip', 'important', 'warning', 'caution']) {
      const html = md.render(`> [!${t.toUpperCase()}]\n> body`)
      expect(html).toContain(`callout callout-${t}`)
    }
  })
})
