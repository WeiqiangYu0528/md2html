import { describe, it, expect } from 'vitest'
import { loadTheme, listThemes } from '../src/themes'

describe('themes', () => {
  it('lists the claude theme', () => {
    expect(listThemes()).toContain('claude')
  })

  it('loads the claude theme manifest and CSS', () => {
    const theme = loadTheme('claude')
    expect(theme.name).toBe('claude')
    expect(theme.fonts).toEqual([])
    expect(theme.css.length).toBeGreaterThan(0)
  })

  it('resolves shikiThemeFile into a parsed custom Shiki theme object', () => {
    // The claude theme ships its own warm "parchment" code palette via the
    // manifest's `shikiThemeFile`, rather than naming a built-in Shiki theme.
    // loadTheme must read and parse that file into an object Shiki can consume.
    const theme = loadTheme('claude')
    expect(theme.shikiTheme).toBeTypeOf('object')
    const custom = theme.shikiTheme as Record<string, unknown>
    expect(custom.colors).toBeTypeOf('object')
    expect(Array.isArray(custom.tokenColors)).toBe(true)
  })

  it('throws a helpful error for unknown themes', () => {
    expect(() => loadTheme('nope')).toThrow(/Unknown theme "nope"/)
  })

  it('loads the claude theme mermaid config from the manifest', () => {
    const theme = loadTheme('claude')
    expect(theme.mermaid).toBeTypeOf('object')
    expect((theme.mermaid as Record<string, unknown>).themeVariables).toBeTypeOf('object')
  })

  it('uses a wide concise desktop gutter before truncating claude TOC side-rail links', () => {
    const css = loadTheme('claude').css
    expect(css).toContain('@media (min-width: 1400px)')
    expect(css).toContain('@media (min-width: 1400px) {\n  .theme-claude .toc {')
    expect(css).toContain('width: 220px;')
    expect(css).toContain('margin-left: -340px;')
    expect(css).toContain('border: none;')
    expect(css).not.toContain('border-left: 1px solid var(--rule);')
    expect(css).toContain('.theme-claude .toc a:hover,\n.theme-claude .toc a:focus-visible,\n.theme-claude .toc li:first-child > a {')
    expect(css).toContain('border-radius: 999px;')
    expect(css).toContain('background: color-mix(in srgb, var(--muted) 10%, transparent);')
    expect(css).toContain('white-space: nowrap;')
    expect(css).toContain('overflow: hidden;')
    expect(css).toContain('text-overflow: ellipsis;')
  })

  it('treats hr before h2 as section spacing instead of a second visible rule', () => {
    const css = loadTheme('claude').css
    expect(css).toContain('.theme-claude hr:has(+ h2) {')
    expect(css).toContain('border-top-color: transparent;')
    expect(css).toContain('.theme-claude hr + h2 {')
  })

  it('sets scopeClass to the theme name for a base theme', () => {
    expect(loadTheme('claude').scopeClass).toBe('claude')
  })

  it('lists claude-dark', () => {
    expect(listThemes()).toContain('claude-dark')
  })

  it('loads claude-dark as an extension of claude (dark palette + base structure)', () => {
    const theme = loadTheme('claude-dark')
    expect(theme.name).toBe('claude-dark')
    expect(theme.scopeClass).toBe('claude')                  // inherits base scope class
    expect(theme.css).toContain('.theme-claude .md-content')  // base structural rule inherited
    expect(theme.css).toContain('--bg: #1b1916')              // dark :root override present
    expect(theme.css.indexOf('--bg: #faf9f5')).toBeLessThan(theme.css.indexOf('--bg: #1b1916')) // light first, dark wins
    expect(theme.shikiTheme).toBeTypeOf('object')             // own dark code palette
    expect(theme.mermaid).toBeTypeOf('object')                // own dark mermaid config
  })

  it('lists gpt', () => {
    expect(listThemes()).toContain('gpt')
  })

  it('loads gpt as a standalone theme with own CSS, code palette, and Mermaid config', () => {
    const theme = loadTheme('gpt')
    expect(theme.name).toBe('gpt')
    expect(theme.scopeClass).toBe('gpt')
    expect(theme.fonts).toEqual([])
    expect(theme.css).toContain('.theme-gpt .md-content')
    expect(theme.css).toContain('max-width: 760px;')
    expect(theme.css).toContain('.theme-gpt h1 { font-size: clamp(2.25rem, 4vw, 3rem); }')
    expect(theme.css).toContain('.theme-gpt:lang(zh) .md-content { max-width: 46em; }')
    expect(theme.css).toContain('--bg: #ffffff')
    expect(theme.css).not.toContain('.theme-claude .md-content')
    expect(theme.shikiTheme).toBeTypeOf('object')
    const custom = theme.shikiTheme as Record<string, unknown>
    expect(custom.colors).toBeTypeOf('object')
    expect(Array.isArray(custom.tokenColors)).toBe(true)
    expect(theme.mermaid).toBeTypeOf('object')
    expect((theme.mermaid as Record<string, unknown>).themeVariables).toBeTypeOf('object')
  })

  it('uses a wide concise desktop gutter before truncating gpt TOC side-rail links', () => {
    const css = loadTheme('gpt').css
    expect(css).toContain('@media (min-width: 1400px)')
    expect(css).toContain('@media (min-width: 1400px) {\n  .theme-gpt .toc {')
    expect(css).toContain('width: 244px;')
    expect(css).toContain('margin-left: -344px;')
    expect(css).toContain('border: none;')
    expect(css).not.toContain('border-left: 1px solid var(--rule);')
    expect(css).toContain('.theme-gpt .toc a:hover,\n.theme-gpt .toc a:focus-visible,\n.theme-gpt .toc li:first-child > a {')
    expect(css).toContain('border-radius: 999px;')
    expect(css).toContain('background: var(--surface);')
    expect(css).toContain('white-space: nowrap;')
    expect(css).toContain('overflow: hidden;')
    expect(css).toContain('text-overflow: ellipsis;')
  })
})
