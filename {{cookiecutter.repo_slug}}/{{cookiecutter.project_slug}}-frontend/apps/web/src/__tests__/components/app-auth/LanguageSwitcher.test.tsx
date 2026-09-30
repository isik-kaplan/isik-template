import { LanguageSwitcher } from '@/components/app-auth/LanguageSwitcher'

import { LanguageProvider } from '@/lib/LanguageContext'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The checked-in default template only ever configures one language - a real second one has to be
// mocked in to exercise this component's actual body (it renders nothing below two languages).
vi.mock('@/i18n/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/config')>()),
  languages: ['en', 'tr'],
}))

const { changeLanguage } = vi.hoisted(() => ({ changeLanguage: vi.fn() }))
vi.mock('@/i18n/client', () => ({ i18next: { changeLanguage } }))

const updateMe = vi.fn()
vi.mock('@/lib/apiClients', () => ({ createApi: () => ({ updateMe }) }))
vi.mock('@/lib/apiOrigin', () => ({ apiOrigin: () => 'http://api.test-project.test' }))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows every configured language, with the current one selected', () => {
    render(
      <LanguageProvider language="en">
        <LanguageSwitcher />
      </LanguageProvider>
    )

    const select = screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement
    expect(select.value).toBe('en')
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['en', 'tr'])
    // Each option's own language names itself - "Türkçe", not "Turkish" (that would be English's
    // name for it, what an empty display-locale falls back to).
    expect(screen.getByRole('option', { name: 'Türkçe' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'English' })).toBeTruthy()
  })

  it('saves the new preference and refreshes when a different language is picked', async () => {
    updateMe.mockResolvedValue({})
    render(
      <LanguageProvider language="en">
        <LanguageSwitcher />
      </LanguageProvider>
    )
    const select = screen.getByRole('combobox', { name: 'Language' })

    fireEvent.change(select, { target: { value: 'tr' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(updateMe).toHaveBeenCalledWith({ language: 'tr' })
    expect(changeLanguage).toHaveBeenCalledWith('tr')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does nothing when the same language is picked again', async () => {
    render(
      <LanguageProvider language="en">
        <LanguageSwitcher />
      </LanguageProvider>
    )
    const select = screen.getByRole('combobox', { name: 'Language' })

    fireEvent.change(select, { target: { value: 'en' } })
    await Promise.resolve()

    expect(updateMe).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
