import { ErrorText } from '@/components/ErrorText'
import { LegalConsentNotice } from '@/components/LegalConsentNotice'
import { NameFields } from '@/components/NameFields'

import { LEGAL_SLUGS, legalUrl } from '@/lib/legalDocuments'
import type { NameField } from '@/lib/names'
import { themeOf } from '@/theme'

import { fireEvent, render, screen } from '@testing-library/react-native'
import fc from 'fast-check'
import { Linking, StyleSheet } from 'react-native'

const FIELDS: NameField[] = ['first_name', 'last_name', 'username']
const TEST_IDS = { first_name: 'first-name-input', last_name: 'last-name-input', username: 'username-input' }

describe('an error', () => {
  it('keeps the shared look whatever style it is handed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z ]{1,20}$/),
        fc.constantFrom('red', 'blue'),
        async (message, color) => {
          const style = { color }
          const view = await render(<ErrorText style={style}>{message}</ErrorText>)
          expect(StyleSheet.flatten(screen.getByText(message).props.style).color).toBe(themeOf('light').colors.error)
          await view.unmount()
        }
      )
    )
  })
})

describe('the name fields', () => {
  it('show only the names asked for, and hand on what is typed into each', async () => {
    await fc.assert(
      fc.asyncProperty(fc.subarray(FIELDS), fc.stringMatching(/^[A-Za-z]{1,8}$/), async (shown, typed) => {
        const changed = jest.fn()
        const values = { first_name: '', last_name: '', username: '' }
        const view = await render(<NameFields shown={shown} values={values} onChange={changed} />)
        for (const name of FIELDS) expect(screen.queryByTestId(TEST_IDS[name]) !== null).toBe(shown.includes(name))
        for (const name of shown) await fireEvent.changeText(screen.getByTestId(TEST_IDS[name]), typed)
        expect(changed.mock.calls).toEqual(shown.map((name) => [name, typed]))
        await view.unmount()
      })
    )
  })
})

describe('the legal consent notice', () => {
  it('links every document, each opening its own page', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat(), async (pick) => {
        const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
        const view = await render(<LegalConsentNotice />)
        const slug = LEGAL_SLUGS[pick % LEGAL_SLUGS.length]
        await fireEvent.press(screen.getByTestId(`legal-link-${slug}`))
        expect(opened).toHaveBeenCalledWith(legalUrl(slug))
        opened.mockRestore()
        await view.unmount()
      })
    )
  })
})
