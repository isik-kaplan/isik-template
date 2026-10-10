export type AllauthError = { code: string; param?: string; message: string }
export type AllauthErrorResponse = { status: number; errors?: AllauthError[] }

/** allauth's flat {errors: [{code, param, message}]} list, for the app client's screens to read per field. */
export function extractAuthErrors(response: unknown): AllauthError[] | undefined {
  if (!response || typeof response !== 'object') return undefined
  const errors = (response as AllauthErrorResponse).errors
  return Array.isArray(errors) ? errors : undefined
}
