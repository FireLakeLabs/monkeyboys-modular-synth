// Real adapter/DOM/WebAudio acceptance; only this URL manifest is a deterministic fixture.
import { editorSource, replaceSource } from './editor-browser.mjs'
import { installAudioProbe } from './library-check.mjs'
import { read } from '/src/reader/index.ts'
import { generate } from '/src/codegen/generate.ts'
import { sourceBody } from '/src/workspace/document.ts'
import * as model from '/src/rack/model.ts'
import { getSamplePacks, loadSamplePacks } from '/src/strudel/engine.ts'
import { SOUND_MIME } from '/src/samples/crate.ts'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (value, message) => {
  if (!value) throw new Error(message)
}
async function until(condition) {
  for (let i = 0; i < 1200; i++) {
    if (condition()) return
    await pause(25)
  }
  throw new Error('Sound crate browser check timed out')
}
const button = (name) =>
  [...document.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === name || button.getAttribute('aria-label') === name,
  )
function input(element, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
const status = () => document.querySelector('.transport-status').textContent
export async function verifySoundCrate() {
  const results = []
  const measure = installAudioProbe()
  const fetch = window.fetch
  const url = 'https://crate.example.test/strudel.json'
  window.fetch = async (...args) => {
    const input = args[0]
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (target === url)
      return new Response(
        JSON.stringify({
          _base: '',
          cratehit: [
            'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/bd/BT0AADA.wav',
            'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/arpy/arpy01.wav',
          ],
          wt_crate: [
            'https://raw.githubusercontent.com/bubobubobubobubo/dough-waveforms/125801fa9a799117fd0a0350a195ab7c2f4cdf13/wt_dbass/AKWF_dbass_0039_reworked.wav',
          ],
        }),
        { status: 200 },
      )
    return fetch(...args)
  }
  try {
    input(document.querySelector('.cartridge-bay input'), url)
    await pause(0)
    button('Add pack').click()
    await until(() => editorSource().includes(url))
    const before = editorSource()
    button('Sounds').click()
    await until(
      () => getSamplePacks().filter((resource) => resource.status === 'registered').length >= 3,
    )
    await until(() => document.querySelector('[data-sound="cratehit"]'))
    assert(status() === 'Ready', 'Opening crate started transport')
    assert(editorSource() === before, 'Loading inventory changed source')
    for (const resource of getSamplePacks())
      for (const sound of resource.sounds)
        assert(
          [...document.querySelectorAll('[data-sound]')].some(
            (card) => card.dataset.sound === sound.name,
          ),
          `Missing sound ${sound.name}`,
        )
    assert(
      [...document.querySelectorAll('.sound-bank summary')].some((drawer) =>
        drawer.textContent.includes('RolandTR909'),
      ),
      'Drum bank drawers missing',
    )
    results.push(
      'Every sound in both real pinned factory packs and the seated URL pack is in the crate; drum banks have labelled drawers; loading leaves source and transport unchanged',
    )
    button('Next cratehit variant').click()
    await until(() => button('Audition cratehit:1'))
    button('Audition cratehit:1').click()
    await until(() =>
      document.querySelector('.sound-crate output').textContent.includes('Auditioned cratehit:1'),
    )
    const audition = await measure()
    assert(audition.rms > 0.0001, 'Cold audition has no measured output')
    assert(
      status() === 'Ready' && editorSource() === before,
      'Audition changed source or started transport',
    )
    results.push({ coldAudition: audition, transport: 'Ready', sourceUnchanged: true })

    let patch = model.starterPatch()
    patch = { ...patch, cartridges: [{ source: url }], railHp: 104 }
    patch = model.placeModule(patch, 'drums', 0, 0)
    patch = model.placeModule(patch, 'smpl', 0, 14)
    patch = model.placeModule(patch, 'reverb', 0, 22)
    patch = model.placeModule(patch, 'splice', 0, 30)
    patch = model.placeModule(patch, 'wavetable', 0, 42)
    patch = model.connect(patch, { module: 'drums1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
    patch = model.connect(
      patch,
      { module: 'smpl1', jack: 'out' },
      { module: 'reverb1', jack: 'in' },
    )
    patch = model.connect(
      patch,
      { module: 'reverb1', jack: 'out' },
      { module: 'mix1', jack: 'in1' },
    )
    patch = model.connect(
      patch,
      { module: 'splice1', jack: 'out' },
      { module: 'mix1', jack: 'in2' },
    )
    patch = model.connect(
      patch,
      { module: 'wavetable1', jack: 'out' },
      { module: 'mix1', jack: 'in3' },
    )
    replaceSource(generate(patch))
    button('Apply code').click()
    await until(() => status() === 'Playing')
    button('Stop').click()
    await until(() => status() === 'Ready')
    function drop(module, selector, name, n) {
      const target = document.querySelector(`[data-module="${module}"] ${selector}`)
      assert(target, `Missing ${module} drop target`)
      const transfer = new DataTransfer()
      transfer.setData(SOUND_MIME, JSON.stringify({ name, n }))
      target.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
    }
    for (const [module, selector, name, n] of [
      ['drums1', '.mini-row-name', 'cratehit', 1],
      ['smpl1', '.sample-slot select', 'cratehit', 1],
      ['reverb1', '.sample-slot select', 'cratehit', 0],
      ['splice1', '.sample-slot select', 'cratehit', 1],
      ['wavetable1', '.sample-slot select', 'wt_crate', 0],
    ]) {
      const source = editorSource()
      drop(module, selector, name, n)
      await until(() => editorSource() !== source)
      const reopened = read(editorSource())
      assert(reopened.layout === 'restored', `${module} drop lost saved ownership`)
      assert(generate(reopened) === editorSource(), `${module} drop did not retain exact source`)
      results.push(`${module}: browser drop writes source and restores complete saved rack`)
    }
    const options = [...document.querySelector('[aria-label="Seated wavetable"]').options].map(
      (option) => option.value,
    )
    assert(
      options.includes('wt_crate:0') && !options.includes('cratehit:0'),
      'WAVETABLE offered non-wt sounds',
    )
    const mark = document.querySelector('[data-module="smpl1"] [data-mark="begin"]')
    mark.focus()
    mark.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await until(() => sourceBody(editorSource()).includes('.begin(0.01)'))
    assert(
      document.querySelector('[data-mark="begin"]').getAttribute('aria-valuenow') === '0.01',
      'Tape mark did not move',
    )
    replaceSource(
      editorSource().replace(
        '.begin(0.01)',
        '.begin(0.2).end(0.9).loop(1).loopBegin(0.3).loopEnd(0.8)',
      ),
    )
    button('Apply code').click()
    await until(() => status() === 'Playing')
    await until(
      () => document.querySelector('[data-mark="begin"]').getAttribute('aria-valuenow') === '0.2',
    )
    for (const [id, value] of Object.entries({
      begin: '0.2',
      end: '0.9',
      loopBegin: '0.3',
      loopEnd: '0.8',
    }))
      assert(
        document.querySelector(`[data-mark="${id}"]`).getAttribute('aria-valuenow') === value,
        `Tape ${id} does not reflect applied code`,
      )
    const live = await measure()
    assert(live.rms > 0.0001, 'Sample-fed modules have no live output')
    button('Stop').click()
    await until(() => status() === 'Ready')
    results.push({
      tape: 'Keyboard mark edits code; applied code moves mark back',
      wavetable: 'Only seated wt_ inventory offered',
      livePCM: live,
    })
    return { results, physicalListening: false }
  } finally {
    window.fetch = fetch
  }
}

/** Review regressions: real DOM refusal plus transport recovery over a held sample fetch. */
export async function verifyCrateReview() {
  const measure = installAudioProbe()
  const nativeFetch = window.fetch
  const pack = { source: 'https://crate-review.example.test/strudel.json' }
  const delayed = 'https://crate-review.example.test/delayed.wav'
  const audio =
    'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/c74fc80f8db8038f6a33648ffef5ac00a07ad402/arpy/arpy01.wav'
  const bytes = await nativeFetch(audio).then((response) => response.arrayBuffer())
  let release = () => {}
  let held = false
  window.fetch = async (...args) => {
    const input = args[0]
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === pack.source)
      return new Response(
        JSON.stringify({
          _base: '',
          reviewhit: [audio],
          stalledhit: [delayed],
          wt_review: [
            'https://raw.githubusercontent.com/bubobubobubobubo/dough-waveforms/125801fa9a799117fd0a0350a195ab7c2f4cdf13/wt_dbass/AKWF_dbass_0039_reworked.wav',
          ],
        }),
      )
    if (url === delayed) {
      held = true
      await new Promise((resolve) => {
        release = resolve
      })
      return new Response(bytes)
    }
    return nativeFetch(...args)
  }
  function fixture(split) {
    let patch = { ...model.starterPatch(), cartridges: [pack], railHp: 104 }
    for (const [index, type] of ['drums', 'smpl', 'splice', 'wavetable'].entries())
      patch = model.placeModule(patch, type, index + 1)
    patch = model.setValue(patch, 'drums1', 'grid', 'bd, hh')
    patch = model.connect(patch, { module: 'drums1', jack: 'out' }, { module: 'smpl1', jack: 'in' })
    patch = model.connect(
      patch,
      { module: split ? 'drums1' : 'smpl1', jack: 'out' },
      { module: 'splice1', jack: 'in' },
    )
    patch = model.connect(
      patch,
      { module: 'smpl1', jack: 'out' },
      { module: 'wavetable1', jack: 'note' },
    )
    patch = model.connect(patch, { module: 'smpl1', jack: 'out' }, { module: 'mix1', jack: 'in1' })
    patch = model.connect(
      patch,
      { module: 'splice1', jack: 'out' },
      { module: 'mix1', jack: 'in2' },
    )
    patch = model.connect(
      patch,
      { module: 'wavetable1', jack: 'out' },
      { module: 'mix1', jack: 'in3' },
    )
    return patch
  }
  async function apply(patch) {
    replaceSource(generate(patch))
    button('Apply code').click()
    await until(() => status() === 'Playing')
    button('Stop').click()
    await until(() => status() === 'Ready')
  }
  function drop(module, selector, name) {
    const transfer = new DataTransfer()
    transfer.setData(SOUND_MIME, JSON.stringify({ name, n: 0 }))
    document
      .querySelector(`[data-module="${module}"] ${selector}`)
      .dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      )
  }
  try {
    await loadSamplePacks([pack])
    await apply(fixture(false))
    for (const [module, name] of [
      ['splice1', 'reviewhit'],
      ['wavetable1', 'wt_review'],
    ]) {
      const before = editorSource()
      drop(module, '.sample-slot select', name)
      await until(() => document.body.textContent.includes('Clear smpl1 BANK'))
      assert(editorSource() === before, `${module} inherited-bank refusal changed source`)
      assert(
        read(editorSource()).layout === 'restored',
        `${module} refusal changed saved ownership`,
      )
    }
    await apply(fixture(true))
    const before = editorSource()
    drop('drums1', '.mini-row-name', 'reviewhit')
    await until(() => document.body.textContent.includes('different sampler banks'))
    assert(editorSource() === before, 'Mixed-bank fan-out refusal changed source')
    button('Sounds').click()
    await until(() => button('Audition stalledhit:0'))
    button('Audition stalledhit:0').click()
    await until(() => held)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    await pause(0)
    await until(() => {
      const play = button('Play')
      if (status() !== 'Ready' || !play) return false
      play.click()
      return true
    })
    await until(() => status() === 'Playing')
    const pcm = await measure()
    assert(pcm.rms > 0.0001, 'Play recovery has no output while cold audition is still held')
    assert(editorSource() === before, 'Stop/Play recovery changed source')
    release()
    button('Stop').click()
    await until(() => status() === 'Ready')
    return {
      inheritedBanks: 'Both target refusals preserve exact source and saved rack',
      fanOut: 'Banked/unbanked siblings refuse atomically',
      stalledAudition: 'Global Stop then Play produces PCM before sample fetch is released',
      pcm,
      physicalListening: false,
    }
  } finally {
    release()
    window.fetch = nativeFetch
  }
}
