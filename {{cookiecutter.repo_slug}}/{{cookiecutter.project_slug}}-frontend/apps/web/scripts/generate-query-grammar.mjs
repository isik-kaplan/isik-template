#!/usr/bin/env node
/**
 * Writes the command palette's `field:value` grammar out of the generated API schema, so what a
 * resource may be narrowed by is the API document's answer rather than a hand-kept list that drifts.
 * A choice field is published as a union of string literals, so its values come along too.
 *
 *     node scripts/generate-query-grammar.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const WEB = path.join(import.meta.dirname, '..')
const SCHEMA = path.join(WEB, '..', '..', 'packages', 'api', 'src', 'schema.ts')
export const TARGET = path.join(WEB, 'src', 'lib', 'queryGrammar.generated.ts')

// The palette's resource keys, each with the list operation it searches.
export const RESOURCES = {
  users: 'users_list',
  applications: 'oauth_applications_list',
  applicationReviews: 'oauth_application_reviews_list',
  notifications: 'notifications_inbox_list',
{%- if cookiecutter.webhooks != "none" %}
  webhooks: 'notifications_endpoints_list',
{%- endif %}
}

// Paging, ordering and field narrowing say nothing about which rows match; `page:2` is no filter.
const NOT_A_FILTER = new Set(['page', 'page_size', 'ordering', 'only', 'exclude', 'search'])

/** The balanced `{...}` block that starts at `opening`. */
export function block(source, opening) {
  const start = source.indexOf(opening)
  if (start < 0) throw new Error(`${opening.trim()} is not in the schema any more`)
  let depth = 0
  for (let at = start; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1
    if (source[at] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, at + 1)
    }
  }
  throw new Error(`${opening.trim()} never closes`)
}

/** The string literals a type is a union of, or null when it is not a union of them. */
export function literalsIn(type) {
  const literals = type.match(/"[^"]*"/g)
  return literals && type.includes('|') ? literals.map((one) => one.slice(1, -1)) : null
}

/** An operation's query parameters that filter, each with its values where it names a few. */
export function fieldsOf(source, operation) {
  const operationBlock = block(source, `\n    ${operation}: {`)
  // An operation that takes no query declares `query?: never`, with no block to read.
  if (!operationBlock.includes('query?: {')) return {}
  const fields = {}
  for (const [, name, type] of block(operationBlock, 'query?: {').matchAll(/^\s{16}(\w+)\?: ([^;]+);$/gm)) {
    if (NOT_A_FILTER.has(name)) continue
    // Inline where the parameter is its own union, and through the component where it names one.
    const component = /components\["schemas"\]\["(\w+)"\]/.exec(type)
    const declared = component && new RegExp(`\\n        ${component[1]}: ([^;]+);`).exec(source)
    const values = component ? declared && literalsIn(declared[1]) : literalsIn(type)
    fields[name] = values ? { values } : {}
  }
  return fields
}

export function render(source = readFileSync(SCHEMA, 'utf8')) {
  const body = Object.entries(RESOURCES)
    .map(([resource, operation]) => {
      const fields = Object.entries(fieldsOf(source, operation)).map(([name, field]) =>
        field.values
          ? `    ${name}: { values: [${field.values.map((one) => `'${one}'`).join(', ')}] },`
          : `    ${name}: {},`
      )
      return fields.length ? `  ${resource}: {\n${fields.join('\n')}\n  },` : `  ${resource}: {},`
    })
    .join('\n')
  return `// Generated from packages/api/src/schema.ts by scripts/generate-query-grammar.mjs; a test fails until they match.

/** What a resource may be narrowed by, and the values a field accepts where it names a few. */
export type QueryField = { values?: readonly string[] }

export const QUERY_GRAMMAR: Readonly<Record<string, Readonly<Record<string, QueryField>>>> = {
${body}
}
`
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  writeFileSync(TARGET, render())
  process.stdout.write(`wrote ${path.relative(process.cwd(), TARGET)}\n`)
}
