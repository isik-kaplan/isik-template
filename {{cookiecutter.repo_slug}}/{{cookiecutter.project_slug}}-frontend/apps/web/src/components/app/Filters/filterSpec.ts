// What a select offers for "no filter". A real word rather than '', because '' is how a select says
// nothing is chosen. Never reaches a query. Here rather than in the client hook, so a server
// component reading it gets the string and not a client reference.
export const ANY = 'any'

export type FilterOption = { value: string; label: string }

/** The search params a page is handed - a repeated key arrives as a list. */
export type Asked = Record<string, string | string[] | undefined>

/**
 * The words a parameter's control may offer, taken from the generated client. A boolean parameter is
 * `true`/`false` in a URL and a real boolean in the query, the one place the two differ.
 */
type ValueWord<T> =
  NonNullable<T> extends boolean ? 'true' | 'false' : NonNullable<T> extends string ? NonNullable<T> : string

export type FilterSpec<Query> = {
  name: keyof Query & string
  label: string
  anyLabel: string
  options: FilterOption[]
  boolean?: true
}

/**
 * Controls over one endpoint's query, named and valued against what that endpoint takes, so a filter
 * the API does not accept is a compile error instead of a word it quietly ignores.
 *
 * Curried because TypeScript infers no type argument once one is written out, and the parameter's
 * name has to be inferred for its values to be checked against that parameter alone.
 */
export function filtersFor<Query>() {
  return {
    on<Name extends keyof Query & string>(spec: {
      name: Name
      label: string
      anyLabel: string
      options: { value: ValueWord<Query[Name]>; label: string }[]
    }): FilterSpec<Query> {
      return spec as FilterSpec<Query>
    },

    /** The same, for a parameter the API takes as a boolean. */
    boolean<Name extends keyof Query & string>(spec: {
      name: Name
      label: string
      anyLabel: string
      yes: string
      no: string
    }): FilterSpec<Query> {
      return {
        name: spec.name,
        label: spec.label,
        anyLabel: spec.anyLabel,
        options: [
          { value: 'true', label: spec.yes },
          { value: 'false', label: spec.no },
        ],
        boolean: true,
      }
    },
  }
}

/**
 * What the address bar holds, as the query the client sends. Anything that is not one of the words
 * its control offers is dropped rather than forwarded, so a hand-edited URL shows the unfiltered list
 * instead of an error.
 */
export function queryFrom<Query>(specs: FilterSpec<Query>[], asked: Asked = {}): Query {
  return specs.reduce((query, spec) => {
    const held = asked[spec.name]
    if (!spec.options.some((option) => option.value === held)) {
      return query
    }
    return { ...query, [spec.name]: spec.boolean ? held === 'true' : held }
  }, {} as Query)
}
