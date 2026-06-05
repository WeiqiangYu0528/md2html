import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { buildFontFaceCss } from '../src/fonts'
import type { Theme } from '../src/types'

const fixtureDir = fileURLToPath(new URL('./fixtures/fonts/', import.meta.url))

function fakeTheme(fonts: Theme['fonts']): Theme {
  return { name: 'x', description: '', shikiTheme: '', css: '', dir: fixtureDir, fonts }
}

describe('buildFontFaceCss', () => {
  it('inlines fonts as base64 data URIs', () => {
    const css = buildFontFaceCss(fakeTheme([
      { family: 'Test', weight: 400, style: 'normal', file: 'dummy.woff2' },
    ]))
    expect(css).toContain('@font-face')
    expect(css).toContain('font-family:"Test"')
    expect(css).toContain('src:url(data:font/woff2;base64,')
  })

  it('returns an empty string when the theme has no fonts', () => {
    expect(buildFontFaceCss(fakeTheme([]))).toBe('')
  })
})
