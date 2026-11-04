import type { DragEvent } from 'react'
import { SOUND_MIME, soundChoice, type SoundChoice } from './crate'
export function receiveSound(event: DragEvent, accept: (choice: SoundChoice) => void) {
  if (!event.dataTransfer.types.includes(SOUND_MIME)) return
  event.preventDefault()
  event.stopPropagation()
  const value: unknown = JSON.parse(event.dataTransfer.getData(SOUND_MIME))
  accept(soundChoice(value))
}
export function allowSound(event: DragEvent) {
  if (event.dataTransfer.types.includes(SOUND_MIME)) {
    event.preventDefault()
    event.stopPropagation()
  }
}
