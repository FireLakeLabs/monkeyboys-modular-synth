// Test-only observation installed before navigation; never changes resource readiness.
export async function installSampleDiagnostics(page) {
  const requests = []
  page.on('response', (response) =>
    requests.push({ url: response.url(), status: response.status(), at: Date.now() }),
  )
  page.on('requestfailed', (request) =>
    requests.push({ url: request.url(), error: request.failure(), at: Date.now() }),
  )
  await page.addInitScript(() => {
    const decodes = []
    const starts = []
    const contexts = new Set()
    window.sampleDiagnostics = () => ({
      decodes,
      starts,
      contexts: [...contexts].map((context) => ({
        state: context.state,
        currentTime: context.currentTime,
        sampleRate: context.sampleRate,
      })),
      readiness:
        'Decode observations are not mapped to sound names; fetched bytes alone do not prove decoded readiness.',
    })
    const decode = BaseAudioContext.prototype.decodeAudioData
    BaseAudioContext.prototype.decodeAudioData = function (...args) {
      contexts.add(this)
      const entry = { at: performance.now(), bytes: args[0].byteLength, state: 'pending' }
      decodes.push(entry)
      const result = decode.apply(this, args)
      result.then(
        (buffer) =>
          Object.assign(entry, {
            state: 'decoded',
            duration: buffer.duration,
            channels: buffer.numberOfChannels,
          }),
        (error) => Object.assign(entry, { state: 'failed', error: String(error) }),
      )
      return result
    }
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) {
      contexts.add(this.context)
      starts.push({
        at: performance.now(),
        now: this.context.currentTime,
        when: args[0] ?? 0,
        buffer: this.buffer
          ? { duration: this.buffer.duration, channels: this.buffer.numberOfChannels }
          : null,
      })
      return start.apply(this, args)
    }
  })
  return async () => ({
    requests,
    browser: await page.evaluate(() => window.sampleDiagnostics?.() ?? { readiness: 'unknown' }),
  })
}
