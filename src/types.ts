export interface FontFace {
  family: string
  weight: number
  style: 'normal' | 'italic'
  file: string // path relative to the theme directory
}

export interface Theme {
  name: string
  description: string
  shikiTheme: string
  css: string
  fonts: FontFace[]
  dir: string // absolute path to the theme directory
}
