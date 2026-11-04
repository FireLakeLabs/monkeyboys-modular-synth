export type SampleBank = readonly string[] | Readonly<Record<string, readonly string[]>>
export interface SampleSound {
  name: string
  /** Relative paths; resource.base resolves them. Arrays support the sampler's n variants. */
  bank: SampleBank
}

/** Validate inventory before handing a manifest to the installed sampler. */
export function sampleInventory(value: unknown): {
  names: string[]
  sounds: SampleSound[]
  sampleCount: number
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid sample manifest')
  const files = (bank: unknown): string[] => {
    if (typeof bank === 'string') return [bank]
    if (Array.isArray(bank) && bank.every((url: unknown) => typeof url === 'string')) return bank
    throw new Error('Invalid sample bank')
  }
  const sounds = Object.entries(value).flatMap(([name, bank]): SampleSound[] => {
    if (name.startsWith('_')) return []
    if (bank && typeof bank === 'object' && !Array.isArray(bank)) {
      return [
        {
          name,
          bank: Object.fromEntries(
            Object.entries(bank)
              .filter(([key]) => !key.startsWith('_'))
              .map(([note, urls]) => [note, files(urls)]),
          ),
        },
      ]
    }
    return [{ name, bank: files(bank) }]
  })
  const sampleCount = sounds.reduce(
    (total, sound) =>
      total +
      (Array.isArray(sound.bank)
        ? sound.bank.length
        : Object.values(sound.bank).reduce((sum, urls) => sum + urls.length, 0)),
    0,
  )
  return { names: sounds.map((sound) => sound.name), sounds, sampleCount }
}
