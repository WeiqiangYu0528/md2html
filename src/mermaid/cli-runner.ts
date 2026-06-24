import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export interface MermaidCliResult {
  code: number | null
  stdout: string
  stderr: string
}

export function resolveMmdcCli(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@mermaid-js/mermaid-cli')), 'cli.js')
}

export function buildMmdcArgs(cliPath: string, inputPath: string, outputPath: string, configPath: string): string[] {
  return [cliPath, '-i', inputPath, '-o', outputPath, '-c', configPath]
}

export function runMermaidCli(inputPath: string, outputPath: string, configPath: string): Promise<MermaidCliResult> {
  const child = spawn(process.execPath, buildMmdcArgs(resolveMmdcCli(), inputPath, outputPath, configPath), {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })

  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}
