// Run in the Vite page: (await import('/scripts/code-conversion-check.mjs')).verifyCodeConversion()
import { editorSource, replaceSource, enableAutoApply } from './editor-browser.mjs'

const pause = () => new Promise((resolve) => setTimeout(resolve, 25))
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function until(test) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (test()) return
    await pause()
  }
  throw new Error('Timed out waiting for CODE conversion UI')
}
const buttons = () => [...document.querySelectorAll('.code-conversion')]

export async function verifyCodeConversion() {
  const { read } = await import('../src/reader/index.ts')
  const { sourceBody } = await import('../src/workspace/document.ts')
  const { default: legacy } = await import('../src/reader/fixtures/pre-77-aliases.strudel?raw')
  const results = []
  ;[...document.querySelectorAll('button')]
    .find((node) => node.textContent === 'Discard saved patch')
    ?.click()
  enableAutoApply()
  replaceSource(legacy)
  await until(() => buttons().length === 2)
  assert(buttons()[0].textContent.includes('Looks like QUANT'), 'Missing QUANT offer')
  assert(buttons()[1].textContent.includes('Looks like VCA'), 'Missing VCA offer')
  const before = editorSource()
  buttons()[0].click()
  await until(() => buttons().length === 1)
  let converted = read(editorSource())
  assert(sourceBody(editorSource()) === sourceBody(before), 'Conversion rewrote executable source')
  assert(converted.layout === 'restored', 'Converted layout did not reopen')
  assert(document.querySelector('[aria-label="QUANT quant1"]'), 'Missing QUANT panel')
  assert(document.querySelector('[aria-label="CODE code2"]'), 'Other CODE owner changed')
  results.push('Legacy QUANT and VCA offers appear; QUANT conversion changes only chosen ownership')

  const undo = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Undo')
  undo.click()
  await until(() => buttons().length === 2)
  assert(editorSource() === before, 'Undo lost exact saved CODE file')
  const redo = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Redo')
  redo.click()
  await until(() => buttons().length === 1)
  results.push('Undo restores exact source and CODE owners; Redo restores the converted module')

  buttons()[0].click()
  await until(() => buttons().length === 0)
  converted = read(editorSource())
  assert(
    !converted.patch.modules.some((module) => module.type === 'code'),
    'CODE was not converted',
  )
  assert(sourceBody(editorSource()) === sourceBody(before), 'VCA conversion changed source')
  const saved = editorSource()
  replaceSource(saved)
  await until(() => document.querySelector('.sync-status').textContent.startsWith('Rack matches'))
  assert(
    JSON.stringify(read(editorSource()).patch) === JSON.stringify(converted.patch),
    'Reopen changed rack',
  )
  results.push(
    'VCA converts independently; both conversions preserve source and reopened saved rack',
  )

  replaceSource(legacy)
  await until(() => buttons().length === 2)
  const toggle = document.querySelector('.auto-apply input')
  toggle.click()
  replaceSource(legacy.replace('g:minor', 'c:minor'))
  await until(() => buttons().every((button) => button.disabled))
  assert(sourceBody(editorSource()).includes('c:minor'), 'Disabled conversion overwrote draft')
  results.push('Unapplied draft disables conversion and keeps unfinished text')

  enableAutoApply()
  replaceSource('$: note("c3").s("sine").dec(.1).o(2)\n')
  await until(() => document.querySelector('.sync-status').textContent.startsWith('Rack matches'))
  assert(buttons().length === 0, 'Unsupported envelope/routing offered conversion')
  results.push(
    'Partial envelope and custom routing stay CODE with no misleading offer; audio stayed stopped',
  )
  return results
}

// Real-engine playback regression: conversion must wait for confirmed Stop.
export async function verifyConversionPlayback() {
  const { read } = await import('../src/reader/index.ts')
  const { saveLayout } = await import('../src/workspace/document.ts')
  const { default: legacy } = await import('../src/reader/fixtures/pre-77-aliases.strudel?raw')
  ;[...document.querySelectorAll('button')]
    .find((node) => node.textContent === 'Discard saved patch')
    ?.click()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true }))
  await until(() => document.querySelector('.transport-status')?.textContent === 'Ready')
  const key = '__monkeyboyConversionEvaluations'
  globalThis[key] = 0
  const setup = `globalThis.${key} = (globalThis.${key} ?? 0) + 1;\n`
  const fixture = saveLayout(read(setup + legacy))
  enableAutoApply()
  replaceSource(fixture.source)
  await until(() => buttons().length === 2 && buttons().every((button) => !button.disabled))
  const before = editorSource()
  const status = () => document.querySelector('.transport-status')?.textContent
  try {
    document.querySelector('[aria-label="Play"]').click()
    await pause()
    assert(
      buttons().every((button) => button.disabled),
      'Conversion enabled during playback',
    )
    for (let attempt = 0; attempt < 1200 && status() !== 'Playing'; attempt++) {
      assert(!status()?.startsWith('Audio error'), `Playback failed: ${status()}`)
      await pause()
    }
    assert(status() === 'Playing', `Playback did not start: ${status()}`)
    assert(globalThis[key] === 1, 'Fixture did not evaluate once')
    assert(
      buttons().every((button) => button.disabled),
      'Conversion enabled while playing',
    )
    buttons()[0].click()
    assert(editorSource() === before, 'Disabled conversion changed running source')
    assert(globalThis[key] === 1, 'Disabled conversion re-evaluated setup')
    document.querySelector('[aria-label="Stop"]').click()
    await until(() => status() === 'Ready')
    await until(() => buttons().every((button) => !button.disabled))
    buttons()[0].click()
    await until(() => buttons().length === 1)
    assert(globalThis[key] === 1, 'Stopped conversion re-evaluated setup')
    assert(status() === 'Ready', 'Conversion restarted playback')
    return 'Starting/playing conversion is disabled; after confirmed Stop it converts without re-evaluating stateful setup or restarting audio'
  } finally {
    document.querySelector('[aria-label="Stop"]')?.click()
  }
}
