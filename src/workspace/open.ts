import type { createPlayback } from '../strudel/playback'

/** A file replacement is silent even when ordinary live typing applies to running audio. */
export async function openFile(
  file: Pick<File, 'text'>,
  playback: Pick<ReturnType<typeof createPlayback>, 'stop' | 'getSnapshot'>,
): Promise<string> {
  return prepareReplacement(() => file.text(), playback)
}

/** Retain current work until loading and Stop succeed; intervening edits cancel replacement. */
export async function prepareReplacement<T>(
  load: () => Promise<T>,
  playback: Pick<ReturnType<typeof createPlayback>, 'stop' | 'getSnapshot'>,
  isCurrent: () => boolean = () => true,
): Promise<T> {
  const replacement = await load()
  if (!isCurrent()) throw new Error('Replacement cancelled; current work retained')
  await playback.stop()
  if (playback.getSnapshot().status !== 'stopped')
    throw new Error('Could not replace patch: scheduling has not stopped')
  if (!isCurrent()) throw new Error('Replacement cancelled; current work retained')
  return replacement
}
