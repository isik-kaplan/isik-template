import { queryFrom } from './filterSpec'
import type { Asked, FilterSpec } from './filterSpec'

/**
 * How many rows a listing asks for. One number for every listing, sent to the API and never put in
 * the address bar, so a shared link is a link to a page of rows rather than to a page size.
 */
export const LISTING_PAGE_SIZE = 25

/** Which page the address bar asks for. Anything that is not a page number is the first one. */
export function pageFrom(asked: Asked = {}): number {
  const page = Number(asked.page)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/** What a listing sends: its declared filters, the page asked for, and the one page size. */
export function pagedQueryFrom<Query>(
  specs: FilterSpec<Query>[],
  asked: Asked = {}
): Query & { page: number; page_size: number } {
  return { ...queryFrom(specs, asked), page: pageFrom(asked), page_size: LISTING_PAGE_SIZE }
}
