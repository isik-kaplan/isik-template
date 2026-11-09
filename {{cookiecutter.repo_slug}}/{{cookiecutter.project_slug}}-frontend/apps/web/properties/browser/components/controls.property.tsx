import { AutoFormButton } from '@/components/app-auth/AutoFormButton'
import { LanguageSwitcher } from '@/components/app-auth/LanguageSwitcher'
import { PasswordInput } from '@/components/app-auth/PasswordInput'
import { ProfileTabsList } from '@/components/app-auth/ProfileTabsList'
import { SocialLoginButtons } from '@/components/app-auth/SocialLoginButtons'
import { LegalTabsList } from '@/components/app-legal/LegalTabsList'
import {
  EditAction,
  EditModeProvider,
  SaveActions,
  WhileEditing,
  WhileReading,
  useEditMode,
} from '@/components/app/EditMode'
import { Editor } from '@/components/app/Editor'
import { SelectFilter } from '@/components/app/Filters/SelectFilter'
import { Drawer, DrawerContent } from '@/components/base/drawer'

import { i18next, useClientTranslation } from '@/i18n/client'
import { LanguageProvider } from '@/lib/LanguageContext'
import { LEGAL_DOCUMENTS, legalHref } from '@/lib/legalDocuments'

import { words } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const config = vi.hoisted(() => ({
  DOMAIN: 'test-project.test',
  OAUTH_PROVIDER: { MODE: 'approval' },
  SOCIAL_LOGIN: { PROVIDERS: [] as string[], ICONS: [] as string[] },
}))
vi.mock('@/config/public', () => ({ CONFIG: config }))
const project = vi.hoisted(() => ({ phone: 'required' as 'none' | 'optional' | 'required' }))
vi.mock('@/config/phone', () => ({
  get PHONE() {
    return project.phone
  },
}))

// A project generated with one language, whatever this one was generated with.
const spoken = vi.hoisted(() => ({ only: null as string[] | null, real: [] as string[] }))
vi.mock('@/i18n/config', async (actual) => {
  const real = await actual<typeof import('@/i18n/config')>()
  spoken.real.push(...real.languages)
  return Object.defineProperty({ ...real }, 'languages', { get: () => spoken.only ?? real.languages, enumerable: true })
})

const settle = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

describe('a password field', () => {
  test.prop([fc.nat(5)])(
    'shows what was typed after an odd number of presses of its eye, and hides it after an even one',
    (presses) => {
      freshDom()
      render(<PasswordInput aria-label="Secret" defaultValue="hunter22" />)
      for (let press = 0; press < presses; press++) fireEvent.click(screen.getByRole('button'))
      const revealed = presses % 2 === 1
      expect(screen.getByLabelText('Secret').getAttribute('type')).toBe(revealed ? 'text' : 'password')
      expect(screen.getByRole('button', { name: revealed ? 'Hide password' : 'Show password' })).toBeTruthy()
    }
  )
})

describe('edit mode', () => {
  test('is used only inside its provider', () => {
    freshDom()
    const Outside = () => {
      useEditMode()
      return null
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Outside />)).toThrow('within an EditModeProvider')
  })

  for (const saving of [false, true])
    test.prop([fc.boolean(), fc.option(words, { nil: undefined })])(
      `offers editing unless held back, saying why when it says, and while saving says so: ${saving ? 'saving' : 'idle'}`,
      (disabled, reason) => {
        freshDom()
        render(
          <EditModeProvider>
            <EditAction disabled={disabled} disabledReason={reason} />
            <WhileReading>reading</WhileReading>
            <WhileEditing>
              <SaveActions isSubmitting={saving} />
            </WhileEditing>
          </EditModeProvider>
        )
        expect(screen.queryByText(reason ?? '\u0000') !== null).toBe(disabled && reason !== undefined)
        const edit = screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement
        expect(edit.disabled).toBe(disabled)
        if (disabled) return
        fireEvent.click(edit)
        expect(screen.queryByText('reading')).toBeNull()
        expect(screen.getByRole('button', { name: saving ? 'Saving…' : 'Save' })).toBeTruthy()
      }
    )
})

const TABS: [string, string][] = [
  ['details', 'Details'],
  ['notifications', 'Notifications'],
  ['settings', 'Settings'],
  ['password', 'Password'],
  ['emails', 'Emails'],
  ['phone', 'Phone'],
  ['connections', 'Links'],
  ['sessions', 'Sessions'],
  ['two-factor', '2FA'],
  ['tokens', 'Tokens'],
  ['applications', 'Apps'],
]

describe('the profile tabs', () => {
  test.prop([
    fc.constantFrom(...(['none', 'optional', 'required'] as const)),
    fc.constantFrom('off', 'approval'),
    fc.constantFrom(...TABS.map(([segment]) => segment), 'unknown'),
    fc.nat(),
  ])(
    'offer phone and apps only where they exist, mark the page shown, the first when none is, and go to the one chosen',
    async (phone, mode, here, pick) => {
      freshDom()
      project.phone = phone
      config.OAUTH_PROVIDER.MODE = mode
      navigation.push.mockClear()
      navigation.pathname = `/profile/${here}`
      render(<ProfileTabsList />)
      const offered = TABS.filter(
        ([segment]) => (segment !== 'phone' || phone !== 'none') && (segment !== 'applications' || mode !== 'off')
      )
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(offered.map(([, label]) => label))
      const shown = offered.find(([segment]) => segment === here) ?? offered[0]
      expect(screen.getByRole('tab', { name: shown[1] }).getAttribute('aria-selected')).toBe('true')
      const [chosen, label] = offered[pick % offered.length]
      fireEvent.click(screen.getByRole('tab', { name: label }))
      await settle()
      if (chosen !== shown[0])
        expect(navigation.push).toHaveBeenCalledWith(
          `/profile/${here === 'unknown' ? 'unknown' : here}`.replace(/[^/]+$/, chosen)
        )
    }
  )
})

describe('the legal tabs', () => {
  test.prop([fc.option(fc.constantFrom(...LEGAL_DOCUMENTS.map(({ slug }) => slug)), { nil: null }), fc.nat()])(
    'mark the document shown, none off a document, and go to the one chosen',
    async (here, pick) => {
      freshDom()
      navigation.push.mockClear()
      navigation.pathname = here ? legalHref(here) : '/legal'
      render(<LegalTabsList />)
      const tabs = screen.getAllByRole('tab')
      expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length).toBe(here ? 1 : 0)
      const chosen = LEGAL_DOCUMENTS[pick % LEGAL_DOCUMENTS.length].slug
      fireEvent.click(tabs[pick % tabs.length])
      await settle()
      if (chosen !== here) expect(navigation.push).toHaveBeenCalledWith(legalHref(chosen))
    }
  )
})

describe('social login buttons', () => {
  test('are none when no provider is configured', () => {
    freshDom()
    config.SOCIAL_LOGIN.PROVIDERS = []
    const { container } = render(
      <SocialLoginButtons action="http://auth.test-project.test/x" callbackUrl="http://test-project.test/y" />
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('a button that posts a form', () => {
  test.prop([fc.dictionary(fc.stringMatching(/^[a-z]{1,6}$/), fc.stringMatching(/^[a-z0-9]{0,6}$/), { maxKeys: 3 })])(
    'also does whatever else its click was given, asking for a CSRF cookie first when there is none',
    async (payload) => {
      // Both cookie states in each example: a new visitor has none, and that is the path that reads the session.
      for (const cookie of ['csrftoken=abc; path=/', 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/']) {
        freshDom()
        document.cookie = cookie
        const primed = vi.fn(async (_input: RequestInfo | URL) => new Response(null))
        vi.stubGlobal('fetch', primed)
        const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
        const clicked = vi.fn()
        render(
          <AutoFormButton action="http://auth.test-project.test/post" payload={payload} onClick={clicked}>
            Go
          </AutoFormButton>
        )
        fireEvent.click(screen.getByRole('button', { name: 'Go' }))
        expect(clicked).toHaveBeenCalledTimes(1)
        await vi.waitFor(() => expect(submit).toHaveBeenCalled())
        expect(primed).toHaveBeenCalledTimes(cookie.includes('abc') ? 0 : 1)
        submit.mockRestore()
      }
    }
  )
})

describe('a select filter', () => {
  test.prop([fc.uniqueArray(fc.stringMatching(/^[a-z]{2,6}$/), { minLength: 1, maxLength: 3 }), fc.nat()])(
    'puts the chosen value in the address, back on page one',
    (values, pick) => {
      freshDom()
      navigation.push.mockClear()
      navigation.pathname = '/things'
      render(
        <SelectFilter
          name="kind"
          label="Kind"
          anyLabel="Any"
          options={values.map((value) => ({ value, label: value }))}
        />
      )
      const chosen = values[pick % values.length]
      fireEvent.change(screen.getByLabelText('Kind'), { target: { value: chosen } })
      expect(navigation.push).toHaveBeenCalledWith(`/things?kind=${chosen}`)
    }
  )
})

describe('the editor', () => {
  test.prop([words])('hands on what was typed into it', async (text) => {
    freshDom()
    const changed = vi.fn()
    const { container } = render(<Editor content="<p></p>" onChange={changed} />)
    await settle(10)
    const surface = container.querySelector('[contenteditable]') as HTMLElement
    surface.innerHTML = `<p>${text}</p>`
    await settle(30)
    expect(changed).toHaveBeenLastCalledWith(`<p>${text}</p>`)
  })
})

describe('a drawer', () => {
  test('is opened only inside its root', () => {
    freshDom()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<DrawerContent>x</DrawerContent>)).toThrow('within a Drawer')
  })

  // One property per backdrop and snap points: a backdrop marking snap points is one draw in six otherwise.
  for (const [modal, snapPoints, label] of [
    [true, [0.5, 1], 'modal, snapping'],
    [true, undefined, 'modal'],
    [false, [], 'not modal, no snap points'],
  ] as const)
    test.prop([fc.constantFrom(...(['down', 'up', 'left', 'right'] as const)), fc.boolean()])(
      `slides from the side it is told, with a handle and a backdrop only when asked, marking its snap points: ${label}`,
      async (side, handle) => {
        freshDom()
        render(
          <Drawer
            open
            swipeDirection={side}
            showSwipeHandle={handle}
            modal={modal}
            snapPoints={snapPoints && [...snapPoints]}
          >
            <DrawerContent>inside</DrawerContent>
          </Drawer>
        )
        await settle()
        const popup = document.querySelector('[data-slot=drawer-popup]') as HTMLElement
        expect(popup.getAttribute('data-swipe-axis')).toBe(side === 'down' || side === 'up' ? 'y' : 'x')
        expect(popup.hasAttribute('data-snap-points')).toBe((snapPoints?.length ?? 0) > 0)
        expect(document.querySelector('[data-slot=drawer-swipe-handle]') !== null).toBe(handle)
        expect(document.querySelector('[data-slot=drawer-overlay]') !== null).toBe(modal)
      }
    )
})

describe('the language switcher', () => {
  test('is not there with only one language to speak', () => {
    freshDom()
    spoken.only = ['en']
    const { container } = render(<LanguageSwitcher />)
    spoken.only = null
    expect(container.innerHTML).toBe('')
  })

  // Two languages even in a project generated with one, whose switcher would otherwise never show.
  const two = () => (spoken.real.length > 1 ? [...spoken.real] : [spoken.real[0], 'xx'])
  test.prop([fc.nat(), fc.nat()])(
    'saves another language and moves the page to it, and does nothing for the same one',
    async (from, to) => {
      freshDom()
      navigation.refresh.mockClear()
      spoken.only = two()
      const [current, chosen] = [spoken.only[from % spoken.only.length], spoken.only[to % spoken.only.length]]
      const sent = vi.fn(
        async (_input: RequestInfo | URL) =>
          new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      vi.stubGlobal('fetch', sent)
      render(
        <LanguageProvider language={current as never}>
          <LanguageSwitcher />
        </LanguageProvider>
      )
      fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: chosen } })
      if (chosen === current) {
        expect(sent).not.toHaveBeenCalled()
      } else {
        await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
        const patch = sent.mock.calls
          .map(([input]) => input as Request)
          .find((request) => request.method === 'PATCH') as Request
        expect(await patch.json()).toEqual({ language: chosen })
        expect(patch.headers.get('If-Match')).toBe('*')
      }
      spoken.only = null
    }
  )
})

describe('the translations in the browser', () => {
  test.prop([fc.constantFrom('xx', 'yy')])('catch up with the language the page was rendered in', async (rendered) => {
    freshDom()
    const Reader = () => {
      useClientTranslation(['common'])
      return null
    }
    render(
      <LanguageProvider language={rendered as never}>
        <Reader />
      </LanguageProvider>
    )
    await vi.waitFor(() => expect(i18next.language).toBe(rendered))
    await act(() => i18next.changeLanguage('en'))
  })
})
