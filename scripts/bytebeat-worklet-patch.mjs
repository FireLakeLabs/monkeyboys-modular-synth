// #143: keep this pinned exception until upstream BYTEBEAT forwards DSP failures.
const method = `callFormula(t) {
  if (this.failed) return 127.5;
  try { return this.func(t); }
  catch (error) {
    this.failed = true;
    this.port.postMessage({ type: 'monkeyboy-bytebeat-error', message: String(error) });
    return 127.5;
  }
}`

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error(`Unexpected BYTEBEAT worklet: ${before}`)
  return source.replace(before, after)
}

function patchProcessor(source, bundled) {
  const end = source.indexOf(
    bundled ? 'registerProcessor("byte-beat-processor"' : "registerProcessor('byte-beat-processor'",
  )
  const start = source.lastIndexOf('class ', end)
  if (start < 0 || end < start) throw Error('Missing BYTEBEAT processor')
  let processor = source.slice(start, end)
  processor = replaceOnce(
    processor,
    bundled ? 'if(this.disconnected)' : 'if (this.disconnected)',
    bundled ? 'if(this.disconnected||this.failed)' : 'if (this.disconnected || this.failed)',
  )
  processor = replaceOnce(
    processor,
    bundled ? 'this.func(h)' : 'this.func(local_t)',
    bundled ? 'this.callFormula(h)' : 'this.callFormula(local_t)',
  )
  processor = replaceOnce(
    processor,
    bundled ? 'd=S(u*.2,-.4,.4);' : 'const funcValue = this.callFormula(local_t);',
    bundled
      ? 'd=S(u*.2,-.4,.4);if(this.failed){for(const channel of i)channel.fill(0);return!1;}'
      : 'const funcValue = this.callFormula(local_t);\n      if (this.failed) { for (const channel of output) channel.fill(0); return false; }',
  )
  processor = replaceOnce(
    processor,
    bundled ? 'static get parameterDescriptors(){' : 'static get parameterDescriptors() {',
    `${method}\n${bundled ? 'static get parameterDescriptors(){' : 'static get parameterDescriptors() {'}`,
  )
  return source.slice(0, start) + processor + source.slice(end)
}

export function patchBytebeatArtifact(source, bundled) {
  if (!bundled) return patchProcessor(source, false)
  let count = 0
  const patched = source.replace(
    /data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g,
    (url, payload) => {
      const decoded = Buffer.from(payload, 'base64').toString()
      if (!decoded.includes('byte-beat-processor')) return url
      count++
      return `data:text/javascript;base64,${Buffer.from(patchProcessor(decoded, true)).toString('base64')}`
    },
  )
  if (count !== 1) throw Error('Expected exactly one bundled BYTEBEAT worklet')
  return patched
}
