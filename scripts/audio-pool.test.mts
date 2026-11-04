import { execFileSync } from 'node:child_process'
import test from 'node:test'

await test('installed audio pools retain context ownership across live/offline/live transitions', () => {
  // Exercise the installed implementation; the browser suite covers its bundled copy.
  const pools = new URL('../node_modules/superdough/nodePools.mjs', import.meta.url).href
  const contexts = new URL('../node_modules/superdough/audioContext.mjs', import.meta.url).href
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import assert from 'node:assert/strict';
    import { getNodeFromPool, releaseNodeToPool } from ${JSON.stringify(pools)};
    import { getAudioContext, setAudioContext } from ${JSON.stringify(contexts)};
    globalThis.AudioParam = class {};
    globalThis.AudioScheduledSourceNode = class {};
    globalThis.AudioWorkletNode = class {};
    const factory = () => ({ context: getAudioContext(), disconnect() {} });
    const live = { currentTime: 1 };
    const offline = { currentTime: 0 };
    setAudioContext(live);
    releaseNodeToPool(getNodeFromPool('filter', factory));
    setAudioContext(offline);
    const rendered = getNodeFromPool('filter', factory);
    assert.equal(rendered.context, offline, 'live node crossed into offline graph');
    releaseNodeToPool(rendered);
    setAudioContext(live);
    const replay = getNodeFromPool('filter', factory);
    assert.equal(replay.context, live, 'offline node crossed into replay graph');
    releaseNodeToPool(replay);
    assert.equal(getNodeFromPool('filter', factory), replay, 'same-context reuse was lost');
  `,
    ],
    { stdio: 'pipe' },
  )
})
