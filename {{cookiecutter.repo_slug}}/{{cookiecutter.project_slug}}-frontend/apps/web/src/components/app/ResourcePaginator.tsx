import { queryFrom } from '@/components/app/Filters/filterSpec'
import type { Asked, FilterSpec } from '@/components/app/Filters/filterSpec'
import { pageFrom } from '@/components/app/Filters/paging'
import { Paginator } from '@/components/app/Paginator'

/** Page links carrying the listing's filters, read through `queryFrom` as the listing reads them. */
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
