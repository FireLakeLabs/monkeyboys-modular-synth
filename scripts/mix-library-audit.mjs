import { runnerImport } from 'vite'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
const root = process.cwd()
const {
  module: { read },
} = await runnerImport(`${root}/src/reader/read.ts`, { configFile: false })
const {
  module: { saveLayout, sourceBody },
} = await runnerImport(`${root}/src/workspace/document.ts`, { configFile: false })
const {
  module: { generate },
} = await runnerImport(`${root}/src/codegen/generate.ts`, { configFile: false })
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory()
          ? files(`${dir}/${e.name}`)
          : e.name.endsWith('.strudel')
            ? [`${dir}/${e.name}`]
            : [],
      ),
    )
  ).flat()
}
const {
  module: { validateRack },
} = await runnerImport(`${root}/src/rack/model.ts`, { configFile: false })
const result = []
for (const file of [
  ...(await files('src/library/patches')),
  ...(await files('src/reader/fixtures')),
].toSorted((a, b) => a.localeCompare(b))) {
  const source = await readFile(file, 'utf8')
  try {
    const doc = read(source)
    validateRack(doc.patch)
    const saved = saveLayout(doc)
    const restored = read(saved.source)
    result.push({
      file,
      sha256: createHash('sha256').update(source).digest('hex'),
      layout: doc.layout,
      sourceExact: generate(doc) === source,
      bodyExact: sourceBody(saved.source) === sourceBody(source),
      identity: isDeepStrictEqual(restored.patch, doc.patch),
      stacks: doc.patch.modules.filter((m) => m.values.mode === 'Stack').length,
    })
  } catch (e) {
    result.push({ file, error: e.message })
  }
}
const output = JSON.stringify(result, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if ((await readFile('docs/evidence/mix-library-audit.json', 'utf8')) !== output)
    throw new Error('MIX audit evidence changed; reproduce and inspect it')
} else await writeFile('docs/evidence/mix-library-audit.json', output)
if (result.some((r) => r.error || !r.sourceExact || !r.bodyExact || !r.identity))
  process.exitCode = 1
process.stdout.write(
  JSON.stringify(
    {
      files: result.length,
      errors: result.filter((r) => r.error),
      failures: result.filter((r) => !r.error && (!r.sourceExact || !r.bodyExact || !r.identity)),
    },
    null,
    2,
  ) + '\n',
)
