import { queryFrom } from '@/components/app/Filters/filterSpec'
import type { Asked, FilterSpec } from '@/components/app/Filters/filterSpec'
import { pageFrom } from '@/components/app/Filters/paging'
import { Paginator } from '@/components/app/Paginator'

/**
 * The page control under a listing, carrying that listing's filters into every page link. Through
 * `queryFrom` rather than the raw search params, so paging keeps what was narrowed and drops what the
 * endpoint never offered - the same reading the listing itself did.
 */
export async function ResourcePaginator<Query>({
  specs,
  asked,
  totalPages,
}: {
  specs: FilterSpec<Query>[]
  asked?: Asked
  totalPages: number
}) {
  return Paginator({
    queryParams: queryFrom(specs, asked) as Record<string, string | number | boolean | undefined>,
    currentPage: pageFrom(asked),
    totalPages,
  })
}
