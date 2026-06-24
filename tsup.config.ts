import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: false,
  external: ['@mermaid-js/mermaid-cli', 'puppeteer'],
  banner: { js: '#!/usr/bin/env node' },
})
