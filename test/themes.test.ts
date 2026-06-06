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

  it('sets scopeClass to the theme name for a base theme', () => {
    expect(loadTheme('claude').scopeClass).toBe('claude')
  })
})
