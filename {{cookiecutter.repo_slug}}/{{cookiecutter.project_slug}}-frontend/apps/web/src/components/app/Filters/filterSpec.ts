// "No filter": not '', which is a select's nothing-chosen. Not in the client hook, so a server
// component gets the string rather than a client reference.
export const ANY = 'any'

export type FilterOption = { value: string; label: string }

/** The search params a page is handed - a repeated key arrives as a list. */
export type Asked = Record<string, string | string[] | undefined>

/** The values a parameter's control may offer, from the generated client. */
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
 * Controls typed against one endpoint's query, so an unaccepted filter is a compile error. Curried:
 * TypeScript infers no type argument once one is written out.
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

/** The address bar as the client's query; unknown values are dropped, so a hand-edited URL shows no error. */
export function queryFrom<Query>(specs: FilterSpec<Query>[], asked: Asked = {}): Query {
  return specs.reduce((query, spec) => {
    const held = asked[spec.name]
    if (!spec.options.some((option) => option.value === held)) {
      return query
    }
    return { ...query, [spec.name]: spec.boolean ? held === 'true' : held }
  }, {} as Query)
}
