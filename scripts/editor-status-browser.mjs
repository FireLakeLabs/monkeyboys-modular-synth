// Run in the Vite browser preview:
// await (await import('/scripts/editor-status-browser.mjs')).checkEditorStatus()
import { editorSource, editorView, replaceSource } from './editor-browser.mjs'

export async function checkEditorStatus() {
  const checks = []
  const assert = (value, message) => {
    if (!value) throw new Error(message)
  }
  async function until(predicate, timeout = 10000) {
    const deadline = performance.now() + timeout
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Timed out: ' + predicate.toString())
      await new Promise(requestAnimationFrame)
    }
  }
  const button = (name) =>
    [...document.querySelectorAll('button')].find(
      (item) => (item.getAttribute('aria-label') ?? item.textContent) === name,
    )
  const status = () => document.querySelector('.transport-status')?.textContent
  const accepted = () =>
    document.querySelector('.sync-status')?.textContent.startsWith('Rack matches code')
  const footer = () => document.querySelector('.editor-status')
  const restore = button('Discard saved patch')
  restore?.click()
  await until(() => document.querySelector('.cm-content'))
  const original = editorSource()
  const bar = footer()
  assert(bar && document.querySelectorAll('.editor-status').length === 1, 'One editor footer')
  assert(document.querySelector('.code').lastElementChild === bar, 'Status is at editor foot')
  for (const selector of ['.sync-status', '.transport-status', '.cursor-position', '.engine-info'])
    assert(bar.contains(document.querySelector(selector)), selector + ' lives in the footer')
  assert(status() === 'Ready', 'Stopped engine says Ready')
  const info = bar.querySelector('.engine-info')
  assert(!info.open && !bar.querySelector('.audio-note').checkVisibility(), 'Caveats start hidden')
  info.querySelector('summary').click()
  assert(info.open && bar.querySelector('.audio-note').checkVisibility(), 'Info opens caveats')
  assert(
    info.textContent.includes('decoding and output unverified') ||
      info.textContent.includes('audio has not initialized'),
    'Info describes readiness limits',
  )
  assert(info.textContent.includes('tails may ring out'), 'Info retains Stop caveat')
  info.querySelector('summary').click()
  checks.push(
    'One footer holds sync, cursor and Ready; engine caveats are hidden behind an operable info control',
  )

  const voice = 'setcpm(30)\n$: note("c3 e3").s("sine")\n'
  replaceSource(voice)
  await until(() => document.querySelector('.sync-status').textContent === 'Unapplied changes')
  const view = editorView()
  view.dispatch({ selection: { anchor: 24, head: 14 } })
  assert(
    bar.querySelector('.cursor-position').textContent === 'Ln 2, Col 4',
    'Backward selection uses its active head',
  )
  view.dispatch({ changes: { from: 0, insert: '// heading\n' } })
  assert(
    bar.querySelector('.cursor-position').textContent === 'Ln 3, Col 4',
    'Typing maps cursor coordinates',
  )
  button('Revert to last readable code').click()
  await until(accepted)
  assert(editorSource() === original, 'Revert restores exact accepted source')
  checks.push(
    'Unapplied sync state, backward selection head and mapped caret coordinates update in the footer; Revert preserves exact source',
  )

  replaceSource('$: note("c3"\n')
  button('Apply code').click()
  await until(() => bar.querySelector('[role=alert]'))
  assert(
    bar.querySelector('[role=alert]').textContent.includes('Line 1, column'),
    'Parser error remains in footer',
  )
  assert(document.querySelector('.source-error-marker'), 'Code-line diagnostic remains reachable')
  button('Revert to last readable code').click()
  await until(accepted)
  assert(!bar.querySelector('[role=alert]'), 'Revert clears footer error')
  checks.push(
    'Invalid draft reports its line/column in the same footer, retains gutter marker and offers working Revert',
  )

  const clear = globalThis.clearInterval
  let failStop = false
  globalThis.clearInterval = (...args) => {
    if (failStop) {
      failStop = false
      throw new Error('Status bar Stop fixture')
    }
    return clear(...args)
  }

  const observed = []
  const observer = new MutationObserver(() => observed.push(status()))
  observer.observe(bar.querySelector('.transport-status'), {
    childList: true,
    subtree: true,
    characterData: true,
  })
  replaceSource(voice)
  button('Apply code').click()
  await until(() => status() === 'Playing', 60000)
  observer.disconnect()
  assert(observed.includes('Loading samples'), 'Manifest registration says Loading samples')
  assert(
    !info.open && !bar.querySelector('.audio-note').checkVisibility(),
    'Playing keeps caveats hidden',
  )
  checks.push(
    'Real Strudel startup reports Loading samples then Playing without expanding engine caveats',
  )

  replaceSource('$: note("c3").statusBarMissingMethod()\n')
  button('Apply code').click()
  await until(() => status() === 'Audio error')
  assert(
    bar.querySelector('[role=alert]').textContent.includes('Current draft retained'),
    'Runtime recovery guidance remains visible',
  )
  const details = [...bar.querySelectorAll('details')].find(
    (item) => item.querySelector('summary').textContent === 'Audio error details',
  )
  details.querySelector('summary').click()
  assert(
    details.open && details.textContent.includes('statusBarMissingMethod'),
    'Runtime details remain reachable',
  )
  replaceSource(voice)
  button('Apply code').click()
  await until(() => status() === 'Playing')
  assert(!bar.querySelector('[role=alert]'), 'Correct and apply clears runtime error')
  checks.push(
    'Real evaluation failure retains source and visible recovery guidance; details open and corrected Apply recovers',
  )

  failStop = true
  try {
    button('Stop').click()
    await until(() => status() === 'Audio state unknown')
    assert(button('Stop') && !button('Stop').disabled, 'Stop retry remains reachable')
    assert(
      bar.querySelector('[role=alert]').textContent.includes('Stop can be retried'),
      'Footer explains retry',
    )
    button('Stop').click()
    await until(() => status() === 'Ready')
  } finally {
    globalThis.clearInterval = clear
    button('Stop')?.click()
  }
  checks.push(
    'Real scheduler Stop failure reports unknown audio state with guidance in the footer; header Stop retry returns to Ready',
  )
  return {
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
    checks,
    physicalListening: false,
  }
}
