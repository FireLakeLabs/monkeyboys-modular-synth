// Test-only observation installed before navigation; never changes resource readiness.
export async function installSampleDiagnostics(page) {
  const requests = []
  const byRequest = new Map()
  page.on('request', (request) => {
    const entry = { url: request.url(), state: 'requested', status: null, at: Date.now() }
    byRequest.set(request, entry)
    requests.push(entry)
  })
  page.on('response', (response) => {
    const entry = byRequest.get(response.request())
    if (entry)
      Object.assign(entry, { state: 'headers', status: response.status(), headersAt: Date.now() })
  })
  page.on('requestfinished', (request) => {
    const entry = byRequest.get(request)
    if (entry) Object.assign(entry, { state: 'finished', finishedAt: Date.now() })
  })
  page.on('requestfailed', (request) => {
    const entry = byRequest.get(request)
    if (entry)
      Object.assign(entry, { state: 'failed', error: request.failure(), finishedAt: Date.now() })
  })
  await page.addInitScript(() => {
    const decodes = []
    const starts = []
    const contexts = new Set()
    window.sampleDiagnostics = () => ({
      clock: { timeOrigin: performance.timeOrigin, now: performance.now() },
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
    // oxlint-disable-next-line typescript/unbound-method -- Original receiver is preserved with apply.
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
    // oxlint-disable-next-line typescript/unbound-method -- Original receiver is preserved with apply.
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
    capturedAt: Date.now(),
    requests: structuredClone(requests),
    browser: await page.evaluate(() => window.sampleDiagnostics?.() ?? { readiness: 'unknown' }),
  })
}
