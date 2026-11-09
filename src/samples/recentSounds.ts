// Recent choices last for the session; nothing is saved.
let recent: readonly string[] = []

export const recentSounds = () => recent

export function rememberSound(token: string) {
  recent = [token, ...recent.filter((other) => other !== token)].slice(0, 5)
}
