import fc from 'fast-check'

/** The type of what an arbitrary draws. */
export type Drawn<A> = A extends fc.Arbitrary<infer T> ? T : never

// A path on this site as the app builds one: no `//`, which a link collapses and the app never makes.
export const sitePath = fc.stringMatching(/^(\/[a-z0-9-]{1,8}){1,3}$/)

// Words as a person reads them: no leading, trailing or doubled space, which an accessible name and a
// text match both normalize away.
export const words = fc.stringMatching(/^[A-Za-z][a-z0-9]{0,8}( [a-z0-9]{1,6}){0,2}$/)

// An address the forms' own validation takes; fast-check's emailAddress() draws ones it rightly refuses.
export const address = fc
  .stringMatching(/^[a-z][a-z0-9.]{0,8}[a-z0-9]@[a-z]{2,8}\.[a-z]{2,4}$/)
  .filter((value) => !value.includes('..'))

// The field a refusal is about, or none: a form shows one about no field under itself, so both are drawn.
// None drawn half the time, however many fields there are.
export const about = (...fields: string[]) => fc.oneof(fc.constant(undefined), fc.constantFrom(...fields))
// An allauth refusal, carrying `param` only when it is about a field.
export const allauthRefusal = (message: string, param: string | undefined) =>
  new Response(JSON.stringify({ status: 400, errors: [{ code: 'invalid', message, ...(param ? { param } : {}) }] }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
// A DRF refusal: under the field it is about, else under non_field_errors.
export const drfRefusal = (message: string, field: string | undefined) =>
  new Response(JSON.stringify({ [field ?? 'non_field_errors']: [{ message, code: 'invalid' }] }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
