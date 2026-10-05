import { Paginator } from '@/components/app/Paginator'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href')

describe('Paginator', () => {
  it('renders nothing for a single page, or none', async () => {
    expect(await Paginator({ queryParams: {}, currentPage: 1, totalPages: 1 })).toBeNull()
    expect(await Paginator({ queryParams: {}, currentPage: 1, totalPages: 0 })).toBeNull()
  })

  it('links to the pages either side, keeping the query, and says where it is', async () => {
    render(await Paginator({ queryParams: { action: 'update' }, currentPage: 2, totalPages: 3 }))

    expect(hrefOf('Previous page')).toBe('?action=update&page=1')
    expect(hrefOf('Next page')).toBe('?action=update&page=3')
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
    expect(screen.getByRole('navigation')).toBeTruthy()
  })

  it('offers no previous page from the first, and no next page from the last', async () => {
    const { unmount } = render(await Paginator({ queryParams: {}, currentPage: 1, totalPages: 2 }))
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull()
    const stuck = screen.getByLabelText('Previous page')
    expect(stuck.tagName).toBe('SPAN')
    expect(stuck.getAttribute('aria-disabled')).toBe('true')
    expect(stuck.classList.contains('pointer-events-none')).toBe(true)
    expect(stuck.classList.contains('opacity-50')).toBe(true)
    // The same outline icon button whether it links anywhere or not.
    for (const step of [stuck, screen.getByRole('link', { name: 'Next page' })]) {
      expect(step.classList.contains('border-border')).toBe(true)
      expect(step.classList.contains('size-8')).toBe(true)
    }
    expect(hrefOf('Next page')).toBe('?page=2')
    unmount()

    render(await Paginator({ queryParams: {}, currentPage: 2, totalPages: 2 }))
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull()
    expect(screen.getByLabelText('Next page').getAttribute('aria-disabled')).toBe('true')
    expect(hrefOf('Previous page')).toBe('?page=1')
  })
})
