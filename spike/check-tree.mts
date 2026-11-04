import { buildTree, unclaimed, walkCells } from './tree.mts'
import { repoCorpus, upstreamCorpus, idioms } from './corpus.mts'
const sets = { repo: repoCorpus(), upstream: upstreamCorpus(), idioms }
for (const [name, list] of Object.entries(sets)) {
  let ok = 0; const bad: string[] = []; const left = new Map<string, number>()
  for (const s of list) {
    try {
      const t = buildTree(s); const u = unclaimed(t); ok++
      for (const c of u) left.set(c, (left.get(c) ?? 0) + 1)
    } catch (e) { bad.push(`${JSON.stringify(s)} -> ${(e as Error).message.slice(0,90)}`) }
  }
  console.log(name, list.length, 'ok', ok, 'leftover', Object.fromEntries(left)); bad.slice(0, 20).forEach((b) => console.log('  ', b))
}
