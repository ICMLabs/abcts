/**
 * `abcts` — render an ABC file to SVG.
 *
 *   abcts tune.abc                 # SVG to stdout
 *   abcts tune.abc -o tune.svg
 *   abcts tune.abc --width 120     # system width, in staff spaces
 *   abcts tune.abc --first         # first tune only, rather than the whole book
 *   cat tune.abc | abcts -
 *
 * Deliberately small. This exists so the engine can be RUN — against a file, in a shell,
 * against the corpus — rather than only from a test. Everything it does is one call to
 * `parse` and one to `render`; anything more belongs in the library.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parse } from './parser/parser.js'
import { render } from './renderer/index.js'

interface Args {
  readonly input: string | null
  readonly output: string | null
  readonly width: number | undefined
  readonly first: boolean
  readonly help: boolean
}

function parseArgs(argv: readonly string[]): Args {
  let input: string | null = null
  let output: string | null = null
  let width: number | undefined
  let first = false
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') help = true
    else if (arg === '-o' || arg === '--output') output = argv[++i] ?? null
    else if (arg === '--width') {
      const value = Number(argv[++i])
      // A bad --width would otherwise reach layout as NaN and produce an empty page.
      if (!Number.isFinite(value) || value <= 0) throw new Error(`--width needs a positive number`)
      width = value
    } else if (arg === '--first') first = true
    else if (arg !== undefined && !arg.startsWith('-')) input = arg
    else if (arg === '-') input = '-'
  }
  return { input, output, width, first, help }
}

const USAGE = `abcts — render ABC notation to SVG

  abcts <file.abc> [options]
  cat tune.abc | abcts -

Options:
  -o, --output <file>   Write to a file instead of stdout
      --width <n>       System width in staff spaces (default 90)
      --first           Render only the first tune, not the whole tunebook
  -h, --help            Show this message
`

export function main(argv: readonly string[]): number {
  const args = parseArgs(argv)
  if (args.help || args.input === null) {
    process.stdout.write(USAGE)
    return args.help ? 0 : 1
  }

  const abc = readFileSync(args.input === '-' ? 0 : args.input, 'utf8')
  const result = parse(abc)

  // Diagnostics go to stderr so piping the SVG stays clean.
  for (const diagnostic of result.diagnostics) {
    process.stderr.write(`${diagnostic.severity}: ${diagnostic.message}\n`)
  }
  if (result.scores.length === 0) {
    process.stderr.write('error: no tunes found\n')
    return 1
  }

  const options = args.width === undefined ? {} : { systemWidth: args.width }
  const first = result.scores[0]
  const svg =
    args.first && first !== undefined ? render(first, options) : render(result.scores, options)

  if (args.output === null) process.stdout.write(svg)
  else writeFileSync(args.output, svg)
  return 0
}

// Only run when invoked as a program, so importing this module in a test does nothing.
if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts')) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
