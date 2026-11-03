import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { Span } from '../reader/types'
import type { SourceFeedback } from '../strudel/engine'

export type SubscribeSourceFeedback = (
  listener: (event: SourceFeedback | null) => void,
) => () => void

export const setTokenActivity = StateEffect.define<(SourceFeedback & { expires: number }) | null>()
export const expireTokenActivity = StateEffect.define<number>()

interface ActiveToken extends Span {
  expires: number
}

function tokenState(source: string, tokens: ActiveToken[]) {
  return {
    source,
    tokens,
    decorations: Decoration.set(
      tokens.map(({ start, end }) =>
        Decoration.mark({ class: 'source-sounding' }).range(start, end),
      ),
      true,
    ),
  }
}

/** Audio events change only this field: no React state, reader work or draft history. */
export const tokenActivity = StateField.define({
  create: (state) => tokenState(state.doc.toString(), []),
  update(value, transaction) {
    if (transaction.docChanged) return tokenState(transaction.state.doc.toString(), [])
    let tokens = value.tokens
    for (const effect of transaction.effects) {
      if (effect.is(setTokenActivity)) {
        const event = effect.value
        if (!event) tokens = []
        else if (event.source === value.source) {
          const incoming = event.spans.filter(
            ({ start, end }) => start >= 0 && end > start && end <= transaction.state.doc.length,
          )
          tokens = tokens.filter(
            (old) => !incoming.some((span) => span.start === old.start && span.end === old.end),
          )
          for (const span of incoming)
            if (!tokens.some((old) => old.start === span.start && old.end === span.end))
              tokens.push({ ...span, expires: event.expires })
        }
      } else if (effect.is(expireTokenActivity))
        tokens = tokens.filter((token) => token.expires > effect.value)
    }
    return tokens === value.tokens ? value : tokenState(value.source, tokens)
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

export function soundingTokens(
  subscribe: SubscribeSourceFeedback,
  ownedSpans: (event: SourceFeedback) => Span[],
) {
  return [
    tokenActivity,
    ViewPlugin.fromClass(
      class {
        timer: ReturnType<typeof setTimeout> | undefined
        motion = matchMedia('(prefers-reduced-motion: reduce)')
        unsubscribe: () => void
        view: EditorView
        clear = () => this.view.dispatch({ effects: setTokenActivity.of(null) })
        constructor(view: EditorView) {
          this.view = view
          this.motion.addEventListener('change', this.clear)
          this.unsubscribe = subscribe((event) => {
            if (!event) this.clear()
            else if (!this.motion.matches)
              view.dispatch({
                effects: setTokenActivity.of({
                  ...event,
                  spans: ownedSpans(event),
                  expires: Date.now() + 400,
                }),
              })
          })
        }
        update() {
          clearTimeout(this.timer)
          const tokens = this.view.state.field(tokenActivity).tokens
          if (!tokens.length) return
          const next = Math.min(...tokens.map((token) => token.expires))
          this.timer = setTimeout(
            () => {
              this.view.dispatch({ effects: expireTokenActivity.of(Date.now()) })
            },
            Math.max(0, next - Date.now()),
          )
        }
        destroy() {
          clearTimeout(this.timer)
          this.motion.removeEventListener('change', this.clear)
          this.unsubscribe()
        }
      },
    ),
  ]
}
