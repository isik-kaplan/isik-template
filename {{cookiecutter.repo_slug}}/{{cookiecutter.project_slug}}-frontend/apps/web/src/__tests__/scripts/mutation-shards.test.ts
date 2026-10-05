import { SHARDS, mutateFor } from '../../../scripts/mutation-shards.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../..')
const SCRIPT = join(ROOT, 'scripts/mutation-shards.mjs')

const config = JSON.parse(readFileSync(join(ROOT, 'stryker.config.json'), 'utf8')) as { mutate: string[] }

// The config's globs, applied without a glob library: a policy test should not be the first thing
// to break when a dependency moves. Only the shapes the config uses are understood, and an
// unfamiliar one throws rather than quietly matching nothing.
function matches(pattern: string, file: string): boolean {
  const body = pattern.startsWith('!') ? pattern.slice(1) : pattern
  const suffixed = /^(.*?)\/\*\*\/\*(\.[\w.]+)$/.exec(body)
  if (suffixed) return file.startsWith(`${suffixed[1]}/`) && file.endsWith(suffixed[2])
  const below = /^(.*?)\/\*\*$/.exec(body)
  if (below) return file.startsWith(`${below[1]}/`)
  const named = /^src\/\*\*\/([^*]+)$/.exec(body)
  if (named) return file === `src/${named[1]}` || file.endsWith(`/${named[1]}`)
  if (!body.includes('*')) return file === body
  throw new Error(`unsupported mutate pattern: ${pattern}`)
}

function everySource(): string[] {
  const walk = (directory: string): string[] =>
    readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
      const relative = `${directory}/${entry.name}`
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(relative)
      return /\.tsx?$/.test(entry.name) ? [relative] : []
    })

  return walk('src')
}

function mutatedFiles(): string[] {
  return everySource().filter(
    (file) =>
      config.mutate.some((pattern) => !pattern.startsWith('!') && matches(pattern, file)) &&
      !config.mutate.some((pattern) => pattern.startsWith('!') && matches(pattern, file))
  )
}

// Everything under src/ that the config does not mutate, and why. A source file measured by nothing
// is invisible from every side anyone looks at: the shards agree with the config, the config agrees
// with itself, and the score is quietly computed over less than the tree.
const NOT_MUTATED: Record<string, string> = {
  'src/global.d.ts': 'A type declaration; it emits nothing to run and so has no mutants.',
  'src/i18n/index.ts': 'A barrel re-exporting what the shards measure where it is defined.',
  'src/i18n/i18next.d.ts': 'A type declaration; it emits nothing to run and so has no mutants.',
}

function cli(...args: string[]) {
  try {
    return { out: execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' }), code: 0 }
  } catch (error) {
    const failure = error as { stderr: string; status: number }
    return { out: failure.stderr, code: failure.status }
  }
}

describe('mutation shards', () => {
  const owners = new Map<string, string[]>()
  for (const [shard, files] of Object.entries(SHARDS)) {
    for (const file of files) owners.set(file, [...(owners.get(file) ?? []), shard])
  }

  it('measures every file the whole-tree run would, and each in exactly one shard', () => {
    expect(mutatedFiles().filter((file) => !owners.has(file))).toEqual([])
    expect([...owners].filter(([, shards]) => shards.length > 1).map(([file]) => file)).toEqual([])
  })

  // A stale entry is how a shard silently shrinks after a rename: the name matches nothing, the
  // shard measures less, and the score still reads 100.
  it('names no file that is gone, or that the config excludes', () => {
    const expected = new Set(mutatedFiles())

    expect([...owners.keys()].filter((file) => !expected.has(file))).toEqual([])
  })

  it('mutates every source, or says in one place why it does not', () => {
    const mutated = new Set(mutatedFiles())
    const sources = everySource()

    expect(sources.filter((file) => !mutated.has(file) && !(file in NOT_MUTATED))).toEqual([])
    expect(Object.keys(NOT_MUTATED).filter((file) => !sources.includes(file) || mutated.has(file))).toEqual([])
  })

  // An unescaped `[key]` segment is a character class, so the path matches no file and the shard
  // still reports a full score.
  it('escapes the route segments that would otherwise match no file', () => {
    const bracketed = Object.entries(SHARDS).flatMap(([shard, files]) =>
      files.filter((file) => /[[\]]/.test(file)).map((file) => [shard, file])
    )

    expect(bracketed).not.toEqual([])
    for (const [shard, file] of bracketed) {
      const patterns = mutateFor(shard).split(',')

      expect(patterns).toContain(
        file
          .replaceAll('[', '[[]')
          .replace(/\](?!\])/g, '[]]')
          .replace('[[[]]', '[[]')
      )
      expect(patterns).not.toContain(file)
    }
  })

  it('carries over the exclusions a command-line --mutate would otherwise drop', () => {
    const exclusions = config.mutate.filter((pattern) => pattern.startsWith('!'))

    for (const shard of Object.keys(SHARDS)) {
      expect(mutateFor(shard).split(',').slice(-exclusions.length)).toEqual(exclusions)
    }
  })

  it('prints the shard names for the CI matrix', () => {
    expect(cli('--json')).toEqual({ out: `${JSON.stringify(Object.keys(SHARDS))}\n`, code: 0 })
  })

  it('prints one shard’s --mutate value', () => {
    expect(cli('auth')).toEqual({ out: `${mutateFor('auth')}\n`, code: 0 })
  })

  it('lists each shard with its size', () => {
    const { out } = cli('--list')

    expect(out.trim().split('\n')).toEqual(
      Object.entries(SHARDS).map(([name, files]) => `${name} (${files.length} files)`)
    )
  })

  it.each([[], ['nonsense'], ['toString']])('refuses an unknown shard %j rather than mutating nothing', (...args) => {
    const { out, code } = cli(...args)

    expect(code).toBe(2)
    expect(out).toContain('unknown shard')
  })
})
