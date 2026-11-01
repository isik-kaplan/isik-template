import { RESOURCES, TARGET, block, fieldsOf, literalsIn, render } from '../../../scripts/generate-query-grammar.mjs'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The shape openapi-typescript writes: operations at four spaces, their query fields at sixteen.
const SOURCE = `
    things_list: {
        parameters: {
            query?: {
                kind?: "a" | "b";
                named?: components["schemas"]["Choice"];
                plain?: components["schemas"]["Plain"];
                missing?: components["schemas"]["Missing"];
                is_open?: boolean;
                page?: number;
                search?: string;
            };
        };
    };
    nothing_list: {
        parameters: {
            query?: never;
        };
    };
        Choice: "x" | "y";
        Plain: string;
`

describe('generate-query-grammar', () => {
  it('matches the committed grammar, so the palette offers what the API declares', () => {
    expect(readFileSync(TARGET, 'utf8')).toBe(render())
  })

  it('reads the filters of an operation, with the values of an inline or a named union', () => {
    expect(fieldsOf(SOURCE, 'things_list')).toEqual({
      kind: { values: ['a', 'b'] },
      named: { values: ['x', 'y'] },
      plain: {},
      missing: {},
      is_open: {},
    })
  })

  it('reads no filters off an operation that takes no query', () => {
    expect(fieldsOf(SOURCE, 'nothing_list')).toEqual({})
  })

  it('says which operation is gone from the schema, or never closes', () => {
    expect(() => block(SOURCE, '    gone_list: {')).toThrow('gone_list: { is not in the schema any more')
    expect(() => block('    open_list: { {', '    open_list: {')).toThrow('open_list: { never closes')
  })

  it('takes a union of string literals as values, and nothing else', () => {
    expect(literalsIn('"a" | "b"')).toEqual(['a', 'b'])
    expect(literalsIn('"a"')).toBeNull()
    expect(literalsIn('string | null')).toBeNull()
  })

  it('names every resource the palette searches', () => {
    expect(Object.keys(RESOURCES)).toEqual(['users', 'applications', 'applicationReviews', 'notifications'{% if cookiecutter.webhooks != "none" %}, 'webhooks'{% endif %}])
  })
})
