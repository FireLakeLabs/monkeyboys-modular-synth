import type { createPlayback } from '../strudel/playback'

/** A file replacement is silent even when ordinary live typing applies to running audio. */
export async function openFile(
  file: Pick<File, 'text'>,
  playback: Pick<ReturnType<typeof createPlayback>, 'stop' | 'getSnapshot'>,
): Promise<string> {
  const source = await file.text()
  await playback.stop()
  if (playback.getSnapshot().status !== 'stopped')
    throw new Error('Could not open file: scheduling has not stopped')
  return source
}
