// Browser proof uses only original repository-owned fixtures. Import never evaluates code.
import * as web from '@strudel/web'
import { play, stop, getClock } from '../src/strudel/engine.ts'
import { read } from '../src/reader/read.ts'
import { generate } from '../src/codegen/generate.ts'
import { sourceBody, saveLayout, makeRackEditable } from '../src/workspace/document.ts'
import { load } from './rack-feel-check.mjs'
import { editorSource } from './editor-browser.mjs'
import { starterPatch, placeModule, connect, setValue } from '../src/rack/model.ts'
import { pcm } from './callback-branches-check.mjs'
export { pcm }
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const assert = (ok, message) => {
  if (!ok) throw new Error(message)
}
const stable = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
const equal = (a, b) => stable(a) === stable(b)
export const fixture =
  'setcpm(240/4)\nconst phrase=note("<c3 e3 g3>");\n$: arrange([.5,phrase],[1.25,stack(phrase,note("g4").fast(2))],[2,note("d4")],[1,note("e4")],[.75,note("f4")]).s("sine").gain(.06)\n'
export async function loadUI(look = 'instrument') {
  const doc = read(fixture)
  await load(
    generate({
      ...doc.patch,
      modules: doc.patch.modules.map((m) => (m.type === 'sections' ? { ...m, look } : m)),
    }),
  )
  return state()
}
export async function loadExact() {
  await load(fixture)
  return state()
}
export async function loadLive() {
  const doc = read(
    fixture.replace(
      '.gain(.06)',
      '.gain(.06).delay(.3).delaytime(.125).delayfeedback(.3).room(.1).roomsize(.4)',
    ),
  )
  await load(generate(doc.patch))
  return state()
}
export async function loadStarter() {
  let patch = placeModule(starterPatch(104), 'seq', 0, 0)
  patch = placeModule(patch, 'osc', 0, 12)
  patch = connect(patch, { module: 'seq1', jack: 'note' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  await load(generate(patch))
  return state()
}
export async function loadSparse() {
  let patch = starterPatch(104)
  for (let i = 1; i <= 2; i++) patch = placeModule(patch, 'sections', i)
  for (let i = 1; i <= 3; i++) patch = placeModule(patch, 'seq', i + 2)
  patch = placeModule(patch, 'osc', 6)
  for (const [id, control, value] of [
    ['sections1', 'cycles3', '1.125'],
    ['sections2', 'cycles4', '0.75'],
    ['sections2', 'cycles2', '2.25'],
    ['sections2', 'order', '4 3 2 1'],
  ])
    patch = setValue(patch, id, control, value)
  for (const [seq, section, jack] of [
    ['seq1', 'sections1', 'in3'],
    ['seq2', 'sections2', 'in2'],
    ['seq3', 'sections2', 'in4'],
  ])
    patch = connect(patch, { module: seq, jack: 'note' }, { module: section, jack })
  patch = connect(
    patch,
    { module: 'sections2', jack: 'out' },
    { module: 'sections1', jack: 'next' },
  )
  patch = connect(patch, { module: 'sections1', jack: 'out' }, { module: 'osc1', jack: 'note' })
  patch = connect(patch, { module: 'osc1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
  await load(generate(patch).replace('arrange(', 'arrange(/* sparse NEXT */ '))
  return state()
}
export async function loadComment({ shape, margin = false }) {
  const sources = {
    plain: '$: note("c3").s("sine")\n',
    Stack: '$: stack(note("c3").s("sine"),note("e3").s("sine"))\n',
    arrange: '$: arrange([1,note("c3").s("sine")],[1,note("e3").s("sine")])\n',
  }
  let patch = read(sources[shape]).patch
  const target = patch.modules.find((m) =>
      shape === 'arrange'
        ? m.type === 'sections'
        : m.type === 'mix' && (shape !== 'Stack' || m.values.mode === 'Stack'),
    ),
    edge = patch.cables.find((c) => c.to.module === target?.id && c.to.jack === 'in1')
  assert(target && edge, 'Missing comment fixture arm')
  patch = placeModule(patch, 'code', 2)
  patch = setValue(patch, 'code1', 'text', '.gain(.5) // tail')
  patch = connect(patch, edge.from, { module: 'code1', jack: 'in' })
  patch = connect(patch, { module: 'code1', jack: 'out' }, { module: target.id, jack: 'in1' }, true)
  const generated = generate(patch)
  const source = margin
    ? generated
        .replace('.gain(.5) // tail', '/* outside CODE */ .gain(.5) // tail')
        .replace('arrange([1,', 'arrange([2,')
    : generated.replace('// tail', '// tail and more')
  await load(source)
  return state()
}
export function state() {
  const source = editorSource(),
    doc = read(source),
    saved = saveLayout(doc)
  return {
    source,
    body: sourceBody(source),
    patch: doc.patch,
    layout: doc.layout,
    sourceExact: sourceBody(saved.source) === sourceBody(source),
    identity: equal(read(saved.source).patch, doc.patch),
  }
}
let captured,
  original,
  triggerCount = 0
export function capture() {
  if (original) return
  original = web.Pattern.prototype.onTrigger
  web.Pattern.prototype.onTrigger = function (callback, dominant) {
    captured = this
    return original.call(
      this,
      typeof callback === 'function'
        ? (...args) => {
            triggerCount++
            return callback(...args)
          }
        : callback,
      dominant,
    )
  }
}
export function restore() {
  if (original) web.Pattern.prototype.onTrigger = original
  original = undefined
}
function events(cycles = 32) {
  return captured
    .queryArc(0, cycles)
    .filter((h) => h.hasOnset())
    .map((h) => ({
      begin: String(h.whole.begin),
      end: String(h.whole.end),
      value: { ...h.value, orbit: h.value.orbit ?? 1 },
    }))
    .sort((a, b) => stable(a).localeCompare(stable(b)))
}
let rememberedBuses
export function rememberBuses() {
  rememberedBuses = { ...web.getSuperdoughAudioController().nodes }
}
export async function liveState() {
  const nodes = web.getSuperdoughAudioController().nodes
  return {
    clock: getClock(),
    events: events(),
    pcm: await pcm(),
    orbits: Object.keys(web.getSuperdoughAudioController().nodes),
    nativeSends: Object.values(nodes).every((n) => n.delayNode && n.reverbNode),
    sameBuses: !rememberedBuses || Object.keys(nodes).every((k) => rememberedBuses[k] === nodes[k]),
  }
}
const voice = (note) => `note("${note}").s("sine").gain(.05).release(.03)`
const sends = '.delay(.4).delaytime(.125).delayfeedback(.35).room(.12).roomsize(.4)'
export async function runtimeProof() {
  capture()
  const cases = [
    {
      name: 'terminal-comment-section',
      expression: `arrange([1,${voice('c3')}.gain(.5) // tail\n],[1,${voice('e3')}])`,
      comment: true,
      wait: 650,
    },
    {
      name: 'terminal-comment-nested-Stack',
      expression: `arrange([1,stack(${voice('c3')}.gain(.5) // tail\n,${voice('e3')})],[1,${voice('g3')}])`,
      comment: true,
      wait: 650,
    },
    {
      name: 'local-phase-nested-next',
      expression:
        'arrange([.5,note("<c3 e3 g3>")],[1.25,stack(note("d3"),note("f3"))],[1,note("e3")],[.75,note("f3")],[1.5,arrange([.5,note("<g3 a3 b3>")],[1,note("c4")])]).s("sine").gain(.05)',
      wait: 650,
    },
    {
      name: 'native-section-sharing',
      expression: `arrange([.5,${voice('a3*4')}${sends}],[.5,${voice('e4*4')}${sends}])`,
      native: true,
      wait: 1200,
    },
    {
      name: 'inline-section-effects',
      expression: `arrange([.5,${voice('a3*4')}.FX(delay(.4).delaytime(.125).delayfeedback(.35))],[.5,${voice('e4*4')}.FX(room(.2).roomsize(.4))])`,
      inline: true,
      wait: 650,
    },
    {
      name: 'inner-custom-routes',
      setup:
        "globalThis.__sections244=0;register('route244',(n,p)=>{globalThis.__sections244++;return p.orbit(n)});\n",
      expression: `arrange([.5,${voice('a3*4')}${sends}.route244(7)],[.5,${voice('e4*4')}${sends}.route244(8)])`,
      custom: true,
      wait: 1200,
    },
    {
      name: 'named-fanout',
      setup: `const form=arrange([.5,${voice('a3*4')}],[.5,${voice('e4*4')}]);\n`,
      voices: `$: form${sends}.orbit(1)\n$: form${sends}.orbit(2)\n`,
      fanout: true,
      wait: 1200,
    },
    {
      name: 'opaque-named-reuse',
      setup: `globalThis.__sections244=0;register('route244',(n,p)=>{globalThis.__sections244++;return p.orbit(n)});\nconst lead=${voice('a3*4')}${sends}.route244(7);\n`,
      expression: 'arrange([.5,lead],[.5,stack(lead,lead.rev())])',
      custom: true,
      customCount: 1,
      expectedOrbits: ['7'],
      wait: 1200,
    },
    {
      name: 'outer-Voices-mask',
      expression: `arrange([.5,${voice('a3*4')}${sends}],[.5,${voice('e4*4')}${sends}]).mask("<1!2 0!2>").postgain(.8).channels("1:2")`,
      native: true,
      masked: true,
      wait: 650,
    },
  ]
  const results = []
  try {
    for (const item of cases) {
      const source = `${item.setup ?? ''}setcpm(240/4)\n${item.voices ?? `$: ${item.expression}\n`}`
      const doc = read(source),
        saved = saveLayout(doc)
      assert(sourceBody(saved.source) === source, 'Exact source')
      assert(equal(read(saved.source).patch, doc.patch), 'Full saved identity')
      const patch = item.comment
        ? {
            ...doc.patch,
            modules: doc.patch.modules.map((m) =>
              m.type === 'vca' && m.values.level === 0.5
                ? { ...m, type: 'code', look: 'bare', values: { text: '.gain(.5) // tail' } }
                : m,
            ),
          }
        : doc.patch
      const generated = item.custom ? makeRackEditable(doc).source : generate(patch),
        samples = []
      if (item.comment) assert(equal(read(generated).patch, patch), 'Saved comment CODE identity')
      for (const [form, code] of [
        ['original', source],
        ['regenerated', generated],
      ]) {
        await play(code, { volume: 0.5, resetEffects: true })
        await pause(item.wait)
        const nodes = web.getSuperdoughAudioController().nodes,
          orbits = Object.keys(nodes).sort()
        if (item.native)
          assert(
            equal(orbits, ['1']) && nodes[1].delayNode && nodes[1].reverbNode,
            'Native sections do not share one send orbit',
          )
        if (item.inline)
          assert(
            Object.values(nodes).every((n) => !n.delayNode && !n.reverbNode),
            'Inline stage leaked native send',
          )
        if (item.custom) {
          assert(equal(orbits, item.expectedOrbits ?? ['7', '8']), 'Custom routing overwritten')
          assert(
            globalThis.__sections244 === (item.customCount ?? 2),
            'Custom construction duplicated',
          )
        }
        if (item.fanout) assert(equal(orbits, ['1', '2']), 'Fanout final branch routes merged')
        const measured = await pcm()
        if (item.masked)
          assert(
            events().every((e) => Math.floor(Number(e.begin)) % 4 < 2),
            'Outer mask lost song-time gating',
          )
        assert(measured.rms > 0.0001, `${item.name}/${form}: silent ${JSON.stringify(measured)}`)
        samples.push({
          form,
          source: sourceBody(code),
          events: events(),
          pcm: measured,
          orbits,
          ...(item.custom ? { constructions: globalThis.__sections244 } : {}),
        })
        await stop()
      }
      assert(equal(samples[0].events, samples[1].events), `${item.name}: pinned events changed`)
      results.push({ name: item.name, sourceExact: true, savedIdentity: true, samples })
    }
    // A short note in section one, then only rests. PCM inside section two is a tail,
    // not a later event. Observe the actual native bus object across the boundary.
    const tailSource = `setcpm(240/4)\n$: arrange([.5,${voice('a3 ~ ~ ~')}.delay(.8).delaytime(.125).delayfeedback(.7)],[.5,note("~").s("sine")])\n`
    const tails = [],
      stopDecay = []
    for (const [form, source] of [
      ['original', tailSource],
      ['regenerated', generate(read(tailSource).patch)],
    ]) {
      await play(source, { volume: 0.5, resetEffects: true })
      // Align to actual scheduler cycle, rather than assuming evaluation starts at zero.
      let cycle
      for (let i = 0; i < 160; i++) {
        cycle = getClock()?.cycle
        if (typeof cycle === 'number' && cycle % 1 > 0.56 && cycle % 1 < 0.68) break
        await pause(20)
      }
      const node = web.getSuperdoughAudioController().nodes[1],
        measured = await pcm(140)
      assert(
        node?.delayNode && measured.rms > 0.0001,
        'Native tail did not persist across section boundary',
      )
      assert(
        web.getSuperdoughAudioController().nodes[1] === node,
        'Section transition replaced send bus',
      )
      tails.push({
        form,
        cycle,
        pcm: measured,
        events: events(2),
        orbitCount: Object.keys(web.getSuperdoughAudioController().nodes).length,
        sameBus: true,
      })
      const beforeStop = {
        clock: getClock(),
        orbits: Object.keys(web.getSuperdoughAudioController().nodes),
        triggers: triggerCount,
      }
      await stop()
      const afterStop = {
        clock: getClock(),
        orbits: Object.keys(web.getSuperdoughAudioController().nodes),
        triggers: triggerCount,
      }
      const started = performance.now()
      await pause(700)
      const early = await pcm()
      const earlyState = {
        clock: getClock(),
        orbits: Object.keys(web.getSuperdoughAudioController().nodes),
        sameBus: web.getSuperdoughAudioController().nodes[1] === node,
        triggers: triggerCount,
      }
      await pause(Math.max(0, 3000 - (performance.now() - started)))
      const late = await pcm()
      const lateState = {
        clock: getClock(),
        orbits: Object.keys(web.getSuperdoughAudioController().nodes),
        sameBus: web.getSuperdoughAudioController().nodes[1] === node,
        triggers: triggerCount,
      }
      assert(
        !afterStop.clock.running &&
          !lateState.clock.running &&
          lateState.triggers === afterStop.triggers,
        'Stop retained future scheduling',
      )
      assert(
        late.rms < 0.0001,
        `Natural decay exceeded 3s window ${JSON.stringify({ early, late, earlyState, lateState })}`,
      )
      stopDecay.push({
        form,
        beforeStop,
        afterStop,
        windows: [
          { startAfterStopMs: 700, durationMs: 600, pcm: early, ...earlyState },
          { startAfterStopMs: 3000, durationMs: 600, pcm: late, ...lateState },
        ],
        silenceThreshold: 0.0001,
        immediateSilenceClaim: false,
      })
    }
    await pause(3000)
    const stopped = await pcm()
    await play('silence', { volume: 0.5, resetEffects: true })
    const replacement = await pcm(),
      nodes = Object.keys(web.getSuperdoughAudioController().nodes)
    assert(
      stopped.rms < 0.0001 && replacement.rms < 0.0001 && nodes.length === 0,
      `Stop/replacement retained audio or buses ${JSON.stringify({ stopped, replacement, nodes })}`,
    )
    return {
      results,
      tails,
      stopDecay,
      stopped,
      replacement,
      replacementOrbits: nodes,
      physicalListening: false,
    }
  } finally {
    await stop()
    restore()
  }
}
