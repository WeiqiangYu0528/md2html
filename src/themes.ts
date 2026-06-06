import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Theme } from './types'

/**
 * Absolute path to the bundled themes directory. Works both from src/ (tests)
 * and from the bundled dist/cli.js — both sit one level under the package root,
 * so `../themes/` resolves to <package-root>/themes in either case.
 */
export function getThemesDir(): string {
  return fileURLToPath(new URL('../themes/', import.meta.url))
}

export function listThemes(): string[] {
  const dir = getThemesDir()
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, 'theme.json')))
}

export function loadTheme(name: string): Theme {
  const dir = join(getThemesDir(), name)
  if (!existsSync(join(dir, 'theme.json'))) {
    throw new Error(`Unknown theme "${name}". Available themes: ${listThemes().join(', ')}`)
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8'))
  const css = readFileSync(join(dir, 'theme.css'), 'utf8')
  // A theme can either name a built-in Shiki theme (`shikiTheme`) or ship its
  // own custom theme JSON in the theme folder (`shikiThemeFile`).
  const shikiTheme = manifest.shikiThemeFile
    ? JSON.parse(readFileSync(join(dir, manifest.shikiThemeFile), 'utf8'))
    : manifest.shikiTheme
  return {
    name: manifest.name,
    description: manifest.description,
    shikiTheme,
    fonts: manifest.fonts ?? [],
    css,
    dir,
    mermaid: manifest.mermaid,
  }
}
