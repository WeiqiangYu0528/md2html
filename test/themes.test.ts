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
})
