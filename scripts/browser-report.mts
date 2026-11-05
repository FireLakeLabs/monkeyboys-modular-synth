import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*[A-Za-z]`, 'g')

/** Counts from Playwright's closing summary. A run that never finished has none. */
export function summarize(output: string, exitCode: number): string {
  const count = (word: string) =>
    new RegExp(String.raw`^\s*(\d+) ${word}\b`, 'm').exec(output.replace(ANSI, ''))?.[1] ?? '0'
  return `RESULT passed=${count('passed')} failed=${count('failed')} exit=${exitCode}`
}

function run(args: readonly string[]) {
  // Playwright clears test-results and the report, so the log lives outside them.
  const log = join(tmpdir(), `monkeyboy-browser-${process.pid}.log`)
  const file = createWriteStream(log)
  let output = ''
  const child = spawn('npx', ['playwright', 'test', '--reporter=line', ...args], {
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const record = (target: NodeJS.WriteStream) => (chunk: Buffer) => {
    output += chunk.toString()
    target.write(chunk)
    file.write(chunk)
  }
  child.stdout.on('data', record(process.stdout))
  child.stderr.on('data', record(process.stderr))
  child.on('close', (code) => {
    const exitCode = code ?? 1
    const result = summarize(output, exitCode)
    file.end(`\n${result}\n`)
    process.stdout.write(`\n${result}\nLog: ${log}\n`)
    process.exitCode = exitCode
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv.slice(2))
