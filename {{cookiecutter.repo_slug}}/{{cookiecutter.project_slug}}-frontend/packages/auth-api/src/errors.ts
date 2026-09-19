export type AllauthError = { code: string; param?: string; message: string }
export type AllauthErrorResponse = { status: number; errors?: AllauthError[] }
export type FormErrors = Record<string, string[]>

/** allauth's flat {errors: [{code, param, message}]} shape, grouped by field DRF-style so auth
 * forms can reuse the same error-rendering as every DRF-backed form. */
export function extractAuthErrors(response: unknown): AllauthError[] | undefined {
  if (!response || typeof response !== 'object') return undefined
  const errors = (response as AllauthErrorResponse).errors
  return Array.isArray(errors) ? errors : undefined
}

export function toFormErrors(errors: AllauthError[] | undefined): FormErrors | undefined {
  if (!errors || errors.length === 0) return undefined
  const grouped: FormErrors = {}
  for (const error of errors) {
    const field = error.param || 'non_field_errors'
    grouped[field] = [...(grouped[field] ?? []), error.message]
  }
  return grouped
}
