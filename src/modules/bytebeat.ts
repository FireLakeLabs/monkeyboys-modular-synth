import { parse } from 'acorn'

/** superdough 1.3.0 synth.mjs, in engine preset order (n = 0…14). */
export const BYTEBEAT_PRESETS = [
  '(t%255 >= t/255%255)*255',
  '(t*(t*8%60 <= 300)|(-t)*(t*4%512 < 256))+t/400',
  't',
  't*(t >> 10^t)',
  't&128',
  't&t>>8',
  '((t%255+t%128+t%64+t%32+t%16+t%127.8+t%64.8+t%32.8+t%16.8)/3)',
  '((t%64+t%63.8+t%64.15+t%64.35+t%63.5)/1.25)',
  '(t&(t>>7)-t)',
  '(sin(t*PI/128)*127+127)',
  '((t^t/2+t+64*(sin((t*PI/64)+(t*PI/32768))+64))%128*2)',
  '((t^t/2+t+64*(cos >> 0))%127.85*2)',
  '((t^t/2+t+64)%128*2)',
  '(((t * .25)^(t * .25)/100+(t * .25))%128)*2',
  '((t^t/2+t+64)%7 * 24)',
] as const

/** Syntax only, never execution or a sandbox. Mirrors the pinned worklet body. */
export function bytebeatSyntax(formula: string): boolean {
  if (!formula) return true
  try {
    parse(`function bytebeat(t) { return 0,\n${formula};\n}`, { ecmaVersion: 'latest' })
    return true
  } catch {
    return false
  }
}

export function bytebeatFormula(values: Readonly<Record<string, unknown>>): string {
  if (typeof values.formula === 'string' && values.formula) return values.formula
  if (values.presetMode === 'pattern') return 'Preset follows incoming n (default 0)'
  const preset = typeof values.preset === 'number' ? values.preset : 0
  return BYTEBEAT_PRESETS[preset] ?? BYTEBEAT_PRESETS[0]
}

/** A pure, single-quoted literal avoids Strudel's mini-notation string parser. */
export const bytebeatLiteral = (text: string): string =>
  `'${JSON.stringify(text).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`
