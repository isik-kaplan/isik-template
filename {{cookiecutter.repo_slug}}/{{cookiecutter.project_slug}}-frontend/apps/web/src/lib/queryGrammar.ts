import { QUERY_GRAMMAR } from './queryGrammar.generated'

/** One `field:value` somebody typed, once it is known to name a real field. */
export type Chip = { field: string; value: string }

export type ParsedQuery = {
  // Bare words, which go to the endpoint's own `search`.
  terms: string
  chips: Chip[]
  // Refused here rather than sent: DRF drops an unknown query parameter, which would read as a
  // filter that did nothing.
  problem?: { field: string; declared: string[] }
}

const PAIR = /^([A-Za-z_]\w*):(.*)/

export function fieldsOf(resource: string): Readonly<Record<string, { values?: readonly string[] }>> {
  return QUERY_GRAMMAR[resource] ?? {}
}

/** What somebody typed, as one resource's endpoint takes it: `status` means whatever it means there. */
export function parseQuery(resource: string, input: string): ParsedQuery {
  const declared = fieldsOf(resource)
  const terms: string[] = []
  const chips: Chip[] = []
  for (const word of input.match(/\S+/g) ?? []) {
    const pair = PAIR.exec(word)
    if (!pair) {
      terms.push(word)
      continue
    }
    const [, field, value] = pair
    if (!Object.hasOwn(declared, field)) {
      return { terms: '', chips: [], problem: { field, declared: Object.keys(declared) } }
    }
    chips.push({ field, value })
  }
  return { terms: terms.join(' '), chips }
}

/** The chips and the terms as one query string's worth of parameters. */
export function queryFrom(parsed: ParsedQuery): Record<string, string> {
  const query: Record<string, string> = {}
  for (const chip of parsed.chips) query[chip.field] = chip.value
  if (parsed.terms) query.search = parsed.terms
  return query
}
