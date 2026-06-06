import { describe, it, expect, beforeAll } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer } from '../src/markdown/renderer'

let md: MarkdownIt
beforeAll(async () => { md = await createRenderer('vitesse-dark') })

describe('callouts', () => {
  it('renders a NOTE callout with the contract markup', () => {
    const html = md.render('> [!NOTE]\n> Remember this.')
    expect(html).toContain('<div class="callout callout-note">')
    expect(html).toContain(
      '<p class="callout-title"><span class="callout-icon" aria-hidden="true"></span>Note</p>',
    )
    expect(html).toContain('Remember this.')
  })

  it('renders all five callout types with the correct class', () => {
    for (const t of ['note', 'tip', 'important', 'warning', 'caution']) {
      const html = md.render(`> [!${t.toUpperCase()}]\n> body`)
      expect(html).toContain(`callout callout-${t}`)
    }
  })

  it('emits a themeable icon hook in every callout title', () => {
    // The converter only emits a structural <span class="callout-icon"> hook;
    // the actual glyph + color are owned by the theme CSS. Assert the hook is
    // present (and presentation-free) for every type.
    for (const t of ['note', 'tip', 'important', 'warning', 'caution']) {
      const html = md.render(`> [!${t.toUpperCase()}]\n> body`)
      expect(html).toContain('<span class="callout-icon" aria-hidden="true"></span>')
    }
  })
})
