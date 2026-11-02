import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import lock from '../.agents/skills-lock.json' with { type: 'json' }

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

export function checkSkills(root = repoRoot, manifest = lock): string[] {
  const errors: string[] = []
  const knownFiles = new Set<string>()
  const names = new Set(manifest.skills.map((skill) => skill.name))
  const inside = (path: string) => {
    const rel = relative(root, path)
    return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep)
  }
  if (manifest.version !== 1) errors.push('Unsupported skill lock version')
  if (names.size !== manifest.skills.length) errors.push('Duplicate skill name')

  for (const source of Object.values(manifest.sources)) {
    const path = resolve(root, source.license.path)
    if (!/^[a-f0-9]{40}$/.test(source.revision)) errors.push('Source revision must be a full commit SHA')
    if (!inside(path) || !existsSync(path) || digest(path) !== source.license.sha256) {
      errors.push(`Missing or changed license: ${source.license.path}`)
    }
  }

  for (const skill of manifest.skills) {
    if (!(skill.source in manifest.sources)) errors.push(`Unknown source: ${skill.source}`)
    for (const dependency of skill.dependencies) {
      if (!names.has(dependency)) errors.push(`${skill.name}: missing dependency ${dependency}`)
    }
    const entry = `.agents/skills/${skill.name}/SKILL.md`
    if (!skill.files.some((file) => file.path === entry)) errors.push(`${skill.name}: missing entry point`)
    for (const file of skill.files) {
      const path = resolve(root, file.path)
      if (knownFiles.has(file.path)) errors.push(`Duplicate file: ${file.path}`)
      knownFiles.add(file.path)
      if (!file.path.startsWith(`.agents/skills/${skill.name}/`) || !inside(path)) {
        errors.push(`File outside its skill: ${file.path}`)
        continue
      }
      if (!existsSync(path) || !lstatSync(path).isFile()) {
        errors.push(`Missing regular file: ${file.path}`)
        continue
      }
      if (digest(path) !== file.sha256) errors.push(`Content drift: ${file.path}`)
      if (!/^[a-f0-9]{64}$/.test(file.upstreamSha256)) errors.push(`Invalid upstream hash: ${file.path}`)
      if (!skill.adapted && file.sha256 !== file.upstreamSha256) {
        errors.push(`Unmodified vendor file differs from upstream: ${file.path}`)
      }
      if (process.platform !== 'win32' && Boolean(lstatSync(path).mode & 0o111) !== file.executable) {
        errors.push(`Executable mode drift: ${file.path}`)
      }
      if (!file.path.endsWith('.md')) continue
      const text = readFileSync(path, 'utf8')
      if (file.path === entry && (!text.startsWith(`---\nname: ${skill.name}\n`) || !/^description: .+/m.test(text))) {
        errors.push(`Invalid skill identity/frontmatter: ${file.path}`)
      }
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1]?.split('#')[0]
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
        const linked = resolve(dirname(path), target)
        if (!inside(linked) || !existsSync(linked)) errors.push(`Broken local link: ${file.path} -> ${target}`)
      }
    }
  }

  function walk(directory: string): void {
    if (!existsSync(directory)) return
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name)
      if (item.isDirectory()) walk(path)
      else if (item.isSymbolicLink() || !knownFiles.has(relative(root, path).split(sep).join('/'))) {
        errors.push(`Unregistered file or symlink: ${relative(root, path)}`)
      }
    }
  }
  walk(resolve(root, '.agents/skills'))
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--update-hashes')) {
    throw new Error('Usage: node scripts/check-skills.mts [--update-hashes]')
  }
  const updating = args[0] === '--update-hashes'
  const next = structuredClone(lock)
  if (updating) {
    for (const skill of next.skills) {
      if (!skill.adapted) continue
      for (const file of skill.files) file.sha256 = digest(resolve(repoRoot, file.path))
    }
  }
  const errors = checkSkills(repoRoot, next)
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    if (updating) writeFileSync(resolve(repoRoot, '.agents/skills-lock.json'), `${JSON.stringify(next, null, 2)}\n`)
    process.stdout.write(`Verified ${next.skills.length} skills and their local dependencies${updating ? '; updated reviewed adaptation hashes' : ''}.\n`)
  }
}
