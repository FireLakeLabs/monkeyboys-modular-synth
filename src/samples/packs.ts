import { parse, type Expression } from 'acorn'

export interface SamplePack {
  source: string
  base?: string
}

// Pin audio bases too: upstream manifests may contain moving _base URLs.
export const FACTORY_PACKS = [
  {
    source:
      'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/strudel.json',
    base: 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/',
  },
  {
    source:
      'https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/tidal-drum-machines.json',
    base: 'https://raw.githubusercontent.com/ritchse/tidal-drum-machines/6577395a4d05031728ced2ec3e5637fa89d8be48/machines/',
  },
] as const satisfies readonly SamplePack[]

export const packKey = (pack: SamplePack) => JSON.stringify([pack.source, pack.base ?? ''])
// The pinned transpiler turns double-quoted strings into mini-notation, even in samples().
const setupString = (value: string) =>
  `'${JSON.stringify(value).slice(1, -1).replace(/'/g, "\\'")}'`
export const packStatement = (pack: SamplePack) =>
  `samples(${setupString(pack.source)}${pack.base === undefined ? '' : `, ${setupString(pack.base)}`});`
export const packSetup = (packs: readonly SamplePack[]) =>
  packs.length ? `${packs.map(packStatement).join('\n')}\n` : ''
export const isFactoryPack = (pack: SamplePack) =>
  FACTORY_PACKS.some((factory) => packKey(factory) === packKey(pack))

export function userPack(input: string): SamplePack {
  const source = input.trim().replace(/\/$/, '')
  if (/^github:[\w.-]+\/[\w.-]+(?:\/[\w.-]+(?:\/[\w./-]+)?)?$/.test(source)) return { source }
  const url = new URL(source)
  if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.endsWith('/strudel.json'))
    throw new Error('Use a github:owner/repo[/branch] shortcut or a strudel.json URL.')
  return { source: url.href }
}

export function packLabel(pack: SamplePack): { name: string; branch: string } {
  if (packKey(pack) === packKey(FACTORY_PACKS[0])) return { name: 'Dirt Samples', branch: 'pinned' }
  if (packKey(pack) === packKey(FACTORY_PACKS[1]))
    return { name: 'Drum Machines', branch: 'pinned' }
  if (pack.source.startsWith('inline:')) return { name: 'Inline samples', branch: 'source' }
  if (pack.source.startsWith('github:')) {
    const [, repo, branch = 'main'] = pack.source.slice(7).split('/')
    return { name: repo ?? pack.source, branch: `follows ${branch}` }
  }
  try {
    return { name: new URL(pack.source).hostname || pack.source, branch: 'follows URL' }
  } catch {
    return { name: pack.source, branch: 'source' }
  }
}

/** Decode data literals only; helpers, spreads, getters and computed setup stay opaque. */
function dataLiteral(node: Expression): unknown {
  if (
    node.type === 'Literal' &&
    (typeof node.value === 'string' || typeof node.value === 'number' || node.value === null)
  )
    return node.value
  if (node.type === 'ArrayExpression') {
    const values = node.elements.map((element) =>
      element && element.type !== 'SpreadElement' ? dataLiteral(element) : undefined,
    )
    return values.every((value) => value !== undefined) ? values : undefined
  }
  if (node.type === 'ObjectExpression') {
    const entries: [string, unknown][] = []
    for (const property of node.properties) {
      if (
        property.type !== 'Property' ||
        property.computed ||
        property.method ||
        property.kind !== 'init'
      )
        return undefined
      const key =
        property.key.type === 'Identifier'
          ? property.key.name
          : property.key.type === 'Literal'
            ? String(property.key.value)
            : undefined
      const value = dataLiteral(property.value)
      if (key === undefined || value === undefined) return undefined
      entries.push([key, value])
    }
    return Object.fromEntries(entries)
  }
  return undefined
}

/** Only standalone literal calls can be claimed by the bay; never evaluate imported setup. */
export function sampleCalls(source: string) {
  const program = parse(source, { ecmaVersion: 'latest' })
  return program.body.flatMap((statement) => {
    if (statement.type !== 'ExpressionStatement') return []
    const call = statement.expression
    if (
      call.type !== 'CallExpression' ||
      call.callee.type !== 'Identifier' ||
      call.callee.name !== 'samples'
    )
      return []
    const args = call.arguments
    const strings = args.map((arg) =>
      arg.type === 'Literal' && typeof arg.value === 'string' ? arg.value : undefined,
    )
    let [first, base] = strings
    const arg = args[0]
    const data = arg && arg.type !== 'SpreadElement' ? dataLiteral(arg) : undefined
    if (data && typeof data === 'object') first = `inline:${JSON.stringify(data)}`
    const pack =
      first !== undefined &&
      args.length >= 1 &&
      args.length <= 2 &&
      (args.length === 1 || base !== undefined)
        ? { source: first, ...(base === undefined ? {} : { base }) }
        : undefined
    return [
      {
        start: statement.start,
        end: statement.end,
        text: source.slice(statement.start, statement.end),
        pack,
      },
    ]
  })
}

export function parsePacks(value: unknown): SamplePack[] {
  if (!Array.isArray(value)) throw new Error('Invalid saved cartridges')
  const packs = value.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('source' in item) ||
      typeof item.source !== 'string' ||
      ('base' in item && typeof item.base !== 'string')
    )
      throw new Error('Invalid saved cartridge')
    return {
      source: item.source,
      ...('base' in item && typeof item.base === 'string' ? { base: item.base } : {}),
    }
  })
  if (new Set(packs.map(packKey)).size !== packs.length)
    throw new Error('Duplicate saved cartridges')
  return packs
}

/** Match the installed sampler: absent github branch means main, subpaths precede strudel.json. */
export function manifestUrl(source: string): string | undefined {
  if (source.startsWith('github:')) {
    const [owner, repo = 'samples', branch = 'main', ...path] = source
      .slice(7)
      .replace(/\/$/, '')
      .split('/')
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${[...path, 'strudel.json'].join('/')}`
  }
  return /^https?:/.test(source) ? source : undefined
}

/** Match only the leading setup statements; metadata validation belongs to the reader. */
export function ownedSampleCalls(source: string, packs: readonly SamplePack[]) {
  const statements = parse(source, { ecmaVersion: 'latest' }).body
  const calls = sampleCalls(source).slice(0, packs.length)
  return calls.length === packs.length &&
    calls.every(
      (call, index) =>
        call.start === statements[index]?.start &&
        call.pack &&
        packKey(call.pack) === packKey(packs[index] ?? { source: '' }),
    )
    ? calls
    : []
}

export function withoutPackSetup(source: string, packs: readonly SamplePack[]): string {
  const calls = ownedSampleCalls(source, packs)
  if (calls.length !== packs.length) throw new Error('Cannot prove cartridge setup ownership')
  return removeSampleCalls(source, calls)
}

export function removeSampleCalls(
  source: string,
  calls: readonly { start: number; end: number }[],
): string {
  for (const call of calls.toReversed()) {
    const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(call.end))?.[0] ?? ''
    source = source.slice(0, call.start) + source.slice(call.end + newline.length)
  }
  return source
}
