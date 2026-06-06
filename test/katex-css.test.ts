import { describe, it, expect } from 'vitest'
import { buildKatexCss } from '../src/math/katex-css'

describe('buildKatexCss', () => {
  const css = buildKatexCss()

  it('returns the KaTeX stylesheet with the .katex rules', () => {
    expect(css).toContain('@font-face')
    expect(css).toContain('.katex')
  })

  it('inlines every font as a base64 woff2 data URI', () => {
    expect(css).toContain('data:font/woff2;base64,')
  })

  it('leaves no external font-file references', () => {
    expect(css).not.toContain('url(fonts/')
  })
})
