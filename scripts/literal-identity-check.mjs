// Run in the Vite page: (await import('/scripts/literal-identity-check.mjs')).verifyLiteralIdentity().
// Exercises the accepted editor/rack path without starting audio.
import { editorSource, replaceSource, enableAutoApply } from './editor-browser.mjs'

function assert(value, message) {
  if (!value) throw new Error(message)
}
async function until(test) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (test()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for accepted code')
}

export async function verifyLiteralIdentity() {
  ;[...document.querySelectorAll('button')]
    .find((node) => node.textContent.trim() === 'Discard saved patch')
    ?.click()
  await until(() => document.querySelector('.cm-content'))
  enableAutoApply()
  const { generate } = await import('../src/codegen/generate.ts')
  const { read } = await import('../src/reader/index.ts')
  const { sourceBody } = await import('../src/workspace/document.ts')
  const module = (type, hp, values = {}) => ({
    id: `${type}1`,
    type,
    row: 0,
    hp,
    look: 'vintage',
    values,
  })
  const wire = (from, to, jack = 'in') => ({
    id: `${from}-${to}-${jack}`,
    from: { module: `${from}1`, jack: from === 'seq' ? 'note' : 'out' },
    to: { module: `${to}1`, jack },
  })
  const patch = {
    version: 1,
    modules: [
      module('seq', 0, { steps: '0 2 4' }),
      module('osc', 10),
      module('vcf', 19),
      module('vca', 29),
      module('env', 37),
      module('mix', 47, { ch1: 1, ch2: 1, ch3: 0.8, ch4: 1 }),
      module('out', 59),
    ],
    cables: [
      wire('seq', 'osc', 'note'),
      wire('osc', 'vcf'),
      wire('vcf', 'vca'),
      wire('vca', 'mix', 'in3'),
      wire('vcf', 'mix', 'in2'),
      wire('mix', 'out'),
      wire('env', 'vcf', 'cv'),
      wire('env', 'vca', 'cv'),
    ],
    names: { 'seq1:note': 'phrase', 'vcf1:out': 'lead' },
  }
  // Keep each module within the fixed rail.
  patch.modules.at(-1).hp = 0
  patch.modules.at(-1).row = 1
  const initial = generate(patch)
  const results = []
  for (const [token, replacement, type, control, value] of [
    ['.postgain(0.8)', '.postgain(0.7)', 'mix', 'ch3', 0.7],
    ['setcpm(120/4)', 'setcpm(130/4)', 'out', 'bpm', 130],
    ['.lpq(1)', '.lpq(8)', 'vcf', 'res', 8],
    ['note(', 'n(', 'seq', 'mode', 'degree'],
  ]) {
    const source = initial.replace(token, replacement)
    replaceSource(source)
    await until(
      () =>
        document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code') &&
        sourceBody(editorSource()) === sourceBody(source) &&
        read(editorSource()).layout === 'restored',
    )
    const accepted = read(editorSource())
    assert(accepted.layout === 'restored', 'Accepted source did not reopen saved state')
    assert(accepted.patch.modules.length === patch.modules.length, 'Module count changed')
    for (const old of patch.modules) {
      const current = accepted.patch.modules.find((item) => item.id === old.id)
      assert(
        current && current.row === old.row && current.hp === old.hp && current.look === old.look,
        `Lost identity/layout of ${old.id}`,
      )
      assert(
        document.querySelector(`[data-module="${old.id}"]`)?.classList.contains('look-vintage'),
        `Rendered ${old.id} lost its look`,
      )
    }
    const endpoints = (cables) => cables.map(({ from, to }) => JSON.stringify([from, to])).sort()
    assert(
      JSON.stringify(endpoints(accepted.patch.cables)) === JSON.stringify(endpoints(patch.cables)),
      'Wiring changed',
    )
    assert(
      accepted.patch.modules.find((item) => item.type === type).values[control] === value,
      `Wrong ${type}.${control}`,
    )
    assert(
      JSON.stringify(accepted.patch.names) === JSON.stringify(patch.names),
      'Output names changed',
    )
    results.push(
      `${type}.${control}: exact executable source, 7 rendered vintage modules, wiring and saved identity retained`,
    )
  }
  const filtered = initial.replaceAll('.lp', '.hp')
  replaceSource(filtered)
  await until(
    () =>
      document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code') &&
      sourceBody(editorSource()) === sourceBody(filtered) &&
      read(editorSource()).layout === 'restored',
  )
  const switched = read(editorSource())
  assert(
    switched.patch.modules.find((item) => item.id === 'vcf1')?.values.mode === 'hp',
    'VCF mode identity lost',
  )
  assert(
    switched.patch.modules.filter((item) => item.type === 'env').length === 1,
    'Mode switch duplicated ENV',
  )
  assert(
    document.querySelector('[data-module="vcf1"] select')?.value === 'hp',
    'Rendered VCF mode stale',
  )
  results.push('VCF HP switch retains filter identity and shared ENV')
  assert(
    document.querySelector('.transport-status')?.textContent === 'Stopped',
    'Probe started playback',
  )
  return results
}
