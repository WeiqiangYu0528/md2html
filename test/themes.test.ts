import { describe, it, expect } from 'vitest'
import { loadTheme, listThemes } from '../src/themes'

describe('themes', () => {
  it('lists the claude theme', () => {
    expect(listThemes()).toContain('claude')
  })

  it('loads the claude theme manifest and CSS', () => {
    const theme = loadTheme('claude')
    expect(theme.name).toBe('claude')
    expect(theme.shikiTheme).toBe('vitesse-dark')
    expect(theme.fonts).toEqual([])
    expect(theme.css.length).toBeGreaterThan(0)
  })

  it('throws a helpful error for unknown themes', () => {
    expect(() => loadTheme('nope')).toThrow(/Unknown theme "nope"/)
  })
})
