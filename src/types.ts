export interface FontFace {
  family: string
  weight: number
  style: 'normal' | 'italic'
  file: string // path relative to the theme directory
}

/** A Shiki theme: either a built-in theme name, or a parsed custom theme object. */
export type ShikiTheme = string | Record<string, unknown>

export interface Theme {
  name: string
  description: string
  shikiTheme: ShikiTheme
  css: string
  fonts: FontFace[]
  dir: string // absolute path to the theme directory
  /** Optional Mermaid init config (theme/themeVariables) for diagram colors. */
  mermaid?: Record<string, unknown>
}
