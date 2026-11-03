// Run in the spike page through browser evaluation:
// await (await import('/scripts/editor-probe.mjs')).probe()
// Playback deliberately requires a separate Play gesture; this probe does not start audio.
export async function probe() {
  const checks = []
  function check(value, name) {
    if (!value) throw new Error(name)
    checks.push(name)
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400))
  const api = window.editorSpike
  const view = api?.view()
  if (!api || !view) throw new Error('Open /scripts/editor-spike.html first')
  const original = api.source()
  const button = (name) => {
    const element = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === name,
    )
    if (!element) throw new Error(`Missing ${name}`)
    element.click()
  }
  check(view.state.doc.toString() === original, 'exact initial source')
  button('Show vcf1')
  await settle()
  check(
    [...document.querySelectorAll('.source-selected')].map((e) => e.textContent).join('') ===
      '.lpf(800).lpq(2)',
    'both selected-module spans',
  )
  const color = (selector) => getComputedStyle(document.querySelector(selector)).color
  check(color('.cat-sound.source-token') === 'rgb(244, 164, 98)', 'hardware category color')
  check(color('.source-alien') === 'rgb(140, 245, 218)', 'Alien glow color')
  check(color('.source-named') === 'rgb(255, 196, 143)', 'named-output treatment')
  check(
    getComputedStyle(document.querySelector('.source-cyber')).textDecorationStyle === 'dashed',
    'Cyber underline',
  )
  view.dispatch({
    selection: { anchor: original.indexOf('.lpq') + 7, head: original.indexOf('.lpq') },
  })
  view.scrollDOM.scrollTop = 120
  view.scrollDOM.scrollLeft = 80
  const before = { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft }
  button('Rack cutoff 1800')
  await settle()
  check(
    view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) ===
      '.lpq(2)' && view.state.selection.main.anchor > view.state.selection.main.head,
    'rack rewrite retains backward selection',
  )
  check(
    view.scrollDOM.scrollTop === before.top && view.scrollDOM.scrollLeft === before.left,
    'rack rewrite retains both scroll axes',
  )
  check(view.state.doc.toString().includes('.lpf(1800)'), 'rack edit changes executable source')
  button('Show code1')
  await settle()
  check(
    document.querySelector('[data-testid=cyber]').textContent.includes('code1'),
    'editing-only Cyber owner',
  )
  check(
    getComputedStyle(document.querySelector('[data-testid=cyber] span')).animationName ===
      'spike-cursor',
    'editing Cyber cursor blinks',
  )
  view.contentDOM.blur()
  await settle()
  check(
    getComputedStyle(document.querySelector('[data-testid=cyber] span')).animationName === 'none',
    'blur stops Cyber blinking',
  )
  const unfolded = api.source()
  button('Fold rack metadata')
  await settle()
  check(!!document.querySelector('.cm-foldPlaceholder'), 'rack metadata folds to one line')
  check(view.state.doc.toString() === unfolded, 'folding preserves exact source')
  view.scrollDOM.scrollTop = 500
  button('Show vcf1')
  await settle()
  const coords = view.coordsAtPos(view.state.selection.main.from)
  const bounds = view.scrollDOM.getBoundingClientRect()
  check(
    coords && coords.top >= bounds.top && coords.bottom <= bounds.bottom,
    'Show in code uses live editor geometry',
  )
  // Exercise the same composition events the props adapter observes, without claiming a native OS IME.
  api.replace('// composition\nnote("c3").s("sine")\n')
  await settle()
  view.focus()
  view.contentDOM.dispatchEvent(
    new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
  )
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: '// 東京 🐒\nnote("c3").s("sine")\n' },
  })
  await settle()
  check(
    document.querySelector('[data-testid=status]').textContent.includes('composing'),
    'composition defers reader acceptance',
  )
  view.contentDOM.dispatchEvent(
    new CompositionEvent('compositionend', { bubbles: true, data: '東京' }),
  )
  await settle()
  check(
    view.state.doc.toString().startsWith('// 東京 🐒\n'),
    'composition callback retains Unicode source',
  )
  api.replace('note(\n// ── @monkeyboy rack v1 ──\n// {}')
  await settle()
  check(
    document.querySelector('[data-testid=status]').textContent === 'invalid',
    'half-typed draft stays editable',
  )
  check(
    document.querySelector('.cm-lintRange-error, .cm-lintPoint-error')?.closest('.cm-line')
      ?.textContent === 'note(',
    'parse error decorates executable line',
  )
  api.replace(original)
  await settle()
  check(view.state.doc.toString() === original, 'restore original source after probe')
  return { checks, nativeIME: 'not exercised; synthetic composition callbacks only' }
}
