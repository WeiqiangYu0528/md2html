import { describe, it, expect } from 'vitest'
import { buildMmdcArgs, resolveMmdcCli } from '../src/mermaid/cli-runner'

describe('Mermaid CLI runner helpers', () => {
  it('resolves the local Mermaid CLI entrypoint from dependencies', () => {
    const cli = resolveMmdcCli()
    expect(cli).toMatch(/@mermaid-js[/\\]mermaid-cli[/\\]src[/\\]cli\.js$/)
  })

  it('builds mmdc arguments for SVG rendering with theme config and SVG id', () => {
    expect(buildMmdcArgs('/deps/mmdc/src/cli.js', '/tmp/in.mmd', '/tmp/out.svg', '/tmp/config.json', 'md2html-mermaid-0')).toEqual([
      '/deps/mmdc/src/cli.js',
      '-i',
      '/tmp/in.mmd',
      '-o',
      '/tmp/out.svg',
      '-c',
      '/tmp/config.json',
      '-I',
      'md2html-mermaid-0',
      '-b',
      'transparent',
    ])
  })
})
