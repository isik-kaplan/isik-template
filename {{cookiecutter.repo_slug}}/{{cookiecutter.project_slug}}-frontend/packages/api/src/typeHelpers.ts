import type { components, paths } from './schema'

export type ApiQuery<T extends keyof paths> = paths[T] extends { get: { parameters: { query?: infer Q } } } ? Q : never
export type ApiResponse<T extends keyof paths, TMethod extends keyof paths[T]> = paths[T][TMethod]

export type ApiType<T extends keyof components['schemas']> = components['schemas'][T]
export type Includes<T, K extends keyof T, F> = Omit<T, K> & { [P in K]: F }

// openapi-typescript can't express that a DRF ?include= narrows a related field from a bare id to
// a nested object at request time - these are type-assertion escape hatches for exactly that gap,
// asserting what the caller already knows from which ?include= it actually sent.
export function includesType<
  T extends object,
  K extends keyof T,
  S extends keyof components['schemas'],
  IsArray extends boolean = false,
>(obj: T, _key: K, _type: S, _isArray?: IsArray): Includes<T, K, IsArray extends true ? ApiType<S>[] : ApiType<S>> {
  return obj as unknown as Includes<T, K, IsArray extends true ? ApiType<S>[] : ApiType<S>>
}

export function includesTypeArray<
  T extends object,
  K extends keyof T,
  S extends keyof components['schemas'],
  IsArray extends boolean = false,
>(obj: T[], _key: K, _type: S, _isArray?: IsArray): Includes<T, K, IsArray extends true ? ApiType<S>[] : ApiType<S>>[] {
  return obj as unknown[] as Includes<T, K, IsArray extends true ? ApiType<S>[] : ApiType<S>>[]
}
