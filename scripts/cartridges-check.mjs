// Run in the real browser after a user gesture. Faults replace only the named test-pack fetches.
import { editorSource, replaceSource } from './editor-browser.mjs'
import { read } from '/src/reader/index.ts'
import { sourceBody } from '/src/workspace/document.ts'
import { FACTORY_PACKS, sampleCalls } from '/src/samples/packs.ts'
import { getSamplePacks } from '/src/strudel/engine.ts'
import { installAudioProbe } from './library-check.mjs'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (value, message) => {
  if (!value) throw new Error(message)
}
async function until(condition) {
  for (let i = 0; i < 600; i++) {
    if (condition()) return
    await pause(25)
  }
  throw new Error('Cartridge browser check timed out')
}
const button = (name) =>
  [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name,
  )
const status = () => document.querySelector('.transport-status').textContent
const bay = () => document.querySelector('.cartridge-bay')
async function seat(source) {
  if (!bay().querySelector('input')) {
    button('+ Add sample pack').click()
    await until(() => bay().querySelector('input'))
  }
  const input = bay().querySelector('input')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, source)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
export async function verifyCartridges() {
  const checks = []
  const measure = installAudioProbe()
  const source = '// preserve 🐒\r\n$: note("c3*4").s("sine").gain(.12)\r\n'
  replaceSource(source)
  button('Apply code').click()
  await until(() => status() === 'Playing')
  await until(() => getSamplePacks().filter((p) => p.status === 'registered').length >= 2)
  assert(
    bay().querySelectorAll('[data-status="registered"]').length === 2,
    'Factory LEDs not wired to real registration',
  )
  assert(
    getSamplePacks().every((p) => p.sampleCount > 0 && p.sounds.length > 0),
    'Factory inventory missing',
  )
  checks.push('Real pinned factory manifests register with inventory and two live LEDs')
  const fetch = window.fetch
  let release
  let hold = true
  let holdRetry = false
  let releaseRetry
  window.fetch = async (...args) => {
    const input = args[0]
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === 'https://packs.example.test/good/strudel.json') {
      if (hold)
        await new Promise((resolve) => {
          release = resolve
        })
      return new Response(
        JSON.stringify({ _base: 'https://example.test/', custom: ['one.wav', 'two.wav'] }),
        { status: 200 },
      )
    }
    if (url === 'https://raw.githubusercontent.com/person/cartridge-test/dev/strudel.json')
      return new Response(JSON.stringify({ custom: ['one.wav'] }), { status: 200 })
    if (url === 'https://packs.example.test/bad/strudel.json') {
      if (holdRetry)
        await new Promise((resolve) => {
          releaseRetry = resolve
        })
      return new Response('unavailable', { status: 503 })
    }
    return fetch(...args)
  }
  try {
    await seat('https://packs.example.test/good/strudel.json')
    await pause(0)
    button('Add pack').click()
    await until(() => bay().querySelector('[data-status="loading"]'))
    const duringLoad = read(editorSource())
    assert(
      sourceBody(editorSource()) ===
        "samples('https://packs.example.test/good/strudel.json');\n" + source,
      'Seat rewrote imported source',
    )
    hold = false
    release()
    await until(() =>
      getSamplePacks().some((p) => p.pack.source.includes('/good/') && p.status === 'registered'),
    )
    assert(
      getSamplePacks().find((p) => p.pack.source.includes('/good/')).sampleCount === 2,
      'User sample count incorrect',
    )
    const afterLoad = read(editorSource())
    assert(
      JSON.stringify(afterLoad.patch) === JSON.stringify(duringLoad.patch),
      'Registration changed rack identity',
    )
    checks.push(
      'URL seat writes one single-quoted call; loading/registered LEDs and count follow real adapter',
    )

    // A known sample use plus opaque callback requires confirmation without decoding the fixture audio.
    replaceSource(editorSource().replace('.gain(.12)', '.gain(.12).onTrigger(() => {}, false)'))
    button('Apply code').click()
    await until(() => status() === 'Playing')
    const beforeEject = editorSource()
    const eject = [...bay().querySelectorAll('button')].find((b) => b.textContent === 'Eject')
    eject.click()
    await until(() => bay().querySelector('.cartridge-eject'))
    assert(editorSource() === beforeEject, 'Warning removed source before consent')
    button('Cancel').click()
    assert(editorSource() === beforeEject, 'Cancel changed source')
    eject.click()
    await until(() => bay().querySelector('.cartridge-eject'))
    button('Eject anyway').click()
    await until(
      () => !editorSource().includes("samples('https://packs.example.test/good/strudel.json');"),
    )
    assert(
      sourceBody(editorSource()).includes('// preserve 🐒\r\n'),
      'Eject lost original comments',
    )
    checks.push(
      'Eject warns for CODE users; Cancel preserves exact source and consent removes only owned setup',
    )

    await seat('https://packs.example.test/bad/strudel.json')
    await pause(0)
    button('Add pack').click()
    await until(() => bay().querySelector('.cartridge-error'))
    assert(status() === 'Playing', 'Pack failure stopped unrelated voice')
    replaceSource(sourceBody(editorSource()) + "\n$: s('unavailable_pack_sound*8')\n")
    button('Apply code').click()
    await until(
      () =>
        status() === 'Playing' && bay().textContent.includes('Unavailable sample voice skipped'),
    )
    const pcm = await measure()
    assert(pcm.rms > 0.001, 'No synth PCM after manifest failure')
    checks.push('HTTP 503 is reported on its cartridge while unrelated real synth PCM continues')
    holdRetry = true
    replaceSource(editorSource().replace('.gain(.12)', '.gain(.11)'))
    button('Apply code').click()
    await until(() =>
      getSamplePacks().some(
        (pack) => pack.pack.source.includes('/bad/') && pack.status === 'loading',
      ),
    )
    const retryPCM = await measure()
    assert(
      status() === 'Applying code' && retryPCM.rms > 0.001,
      'Pending pack retry stopped the previous synth voice',
    )
    holdRetry = false
    releaseRetry()
    await until(() => status() === 'Playing')
    checks.push(
      'A deferred failed-pack retry keeps the previous unavailable sample nonfatal and its synth producing PCM',
    )
    await seat('github:person/cartridge-test/dev')
    await pause(0)
    button('Add pack').click()
    await until(() => bay().textContent.includes('follows dev'))
    assert(
      editorSource().includes("samples('github:person/cartridge-test/dev');"),
      'Github seat missing call',
    )
    checks.push('Github shortcut retains its moving dev branch in label and source')
    let blob
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (value) => {
      blob = value
      return create(value)
    }
    try {
      button('Export').click()
    } finally {
      URL.createObjectURL = create
    }
    const exported = await blob.text()
    const calls = sampleCalls(sourceBody(exported))
    for (const pack of FACTORY_PACKS)
      assert(
        calls.filter((call) => call.pack?.source === pack.source).length === 1,
        'Factory export duplicate/missing',
      )
    const reopened = read(exported)
    assert(reopened.layout === 'restored', 'Export did not restore saved rack')
    assert(
      JSON.stringify(reopened.patch.modules) === JSON.stringify(read(editorSource()).patch.modules),
      'Export changed modules',
    )
    checks.push('Export writes pinned factories exactly once and restores complete saved modules')
    return { checks, pcm, physicalListening: false }
  } finally {
    window.fetch = fetch
    button('Stop')?.click()
  }
}
