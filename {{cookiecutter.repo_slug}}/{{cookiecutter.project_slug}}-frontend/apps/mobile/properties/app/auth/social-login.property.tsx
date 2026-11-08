import { SocialLoginButtons } from '@/components'

import { appleSignInEnabled, googleSignInEnabled } from '@/lib/socialProviders'

import {
  OUTCOMES,
  type Outcome,
  allauth,
  answerFor,
  refusalMessage,
  said,
  t,
  waitMessage,
} from '../../support/auth/allauth'
import { forgetNavigation, navigation } from '../../support/navigation'
import { kept } from '../../support/store'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import fc from 'fast-check'
import { Platform } from 'react-native'

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { hasPlayServices: jest.fn(), signIn: jest.fn() },
}))
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 'EMAIL' },
}))

const hasPlayServices = GoogleSignin.hasPlayServices as jest.Mock
const googleSignIn = GoogleSignin.signIn as jest.Mock
const appleSignIn = AppleAuthentication.signInAsync as jest.Mock

const originalOS = Platform.OS
afterAll(() => {
  Platform.OS = originalOS
  delete process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS
})

// Near misses too: a provider id is matched whole, never as a part.
const PROVIDER_IDS = ['google', 'apple', 'github', 'openid_connect', 'googleplus', 'apple_id']

const token = fc.stringMatching(/^[A-Za-z0-9._-]{10,40}$/)

/** How the native picker ends, before allauth is asked anything. */
const PICKS = ['cancelled', 'failed', ...OUTCOMES] as const
type Pick = (typeof PICKS)[number]

function setUpGoogle(pick: Pick, idToken: string, userId: string) {
  hasPlayServices.mockReset().mockResolvedValue(true)
  googleSignIn.mockReset()
  if (pick === 'failed') hasPlayServices.mockRejectedValue(new Error('no play services'))
  else if (pick === 'cancelled') googleSignIn.mockResolvedValue({ type: 'cancelled', data: null })
  else googleSignIn.mockResolvedValue({ type: 'success', data: { idToken, user: { id: userId } } })
}

function setUpApple(pick: Pick, idToken: string, failure: unknown) {
  appleSignIn.mockReset()
  if (pick === 'failed') appleSignIn.mockRejectedValue(failure)
  else if (pick === 'cancelled') appleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
  else appleSignIn.mockResolvedValue({ identityToken: idToken })
}

describe('the social sign-in buttons', () => {
  it('show one button per configured provider with a native SDK on this platform, and none for the rest', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.subarray(PROVIDER_IDS), { nil: undefined }),
        fc.constantFrom<typeof Platform.OS>('ios', 'android'),
        fc.constantFrom('', ' '),
        async (providers, os, padding) => {
          if (providers === undefined) delete process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS
          else process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS = providers.map((id) => padding + id + padding).join(',')
          Platform.OS = os
          const google = providers?.includes('google') ?? false
          const apple = providers?.includes('apple') ?? false
          expect([googleSignInEnabled(), appleSignInEnabled()]).toEqual([google, apple])
          const view = await render(<SocialLoginButtons onError={jest.fn()} />)
          expect(view.queryByTestId('google-signin') !== null).toBe(google)
          expect(view.queryByTestId('apple-signin') !== null).toBe(apple && os === 'ios')
          await view.unmount()
        }
      )
    )
  })

  it('signs in with the token the picker gave and goes where the answer says, saying nothing when the picker was dismissed', async () => {
    await fc.assert(
      fc.asyncProperty(
        token,
        fc.stringMatching(/^[0-9]{6,21}$/),
        said,
        fc.constantFrom<unknown>(new Error('apple said no'), { code: 'ERR_REQUEST_UNKNOWN' }, 'apple said no', null),
        async (idToken, userId, s, appleFailure) => {
          process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS = 'google,apple'
          Platform.OS = 'ios'
          const onError = jest.fn()
          const view = await render(<SocialLoginButtons onError={onError} />)
          const destinations: Partial<Record<Outcome, [keyof typeof navigation, string]>> = {
            'signed in': ['replace', '/(authenticated)/home'],
            mfa_authenticate: ['push', '/two-factor'],
            verify_email: ['push', '/complete-signup'],
            verify_phone: ['push', '/complete-signup'],
            'refused with an empty list': ['push', '/complete-signup'],
            'refused without a list': ['push', '/complete-signup'],
          }
          for (const provider of ['google', 'apple'] as const) {
            for (const pick of PICKS) {
              forgetNavigation()
              kept.clear()
              onError.mockClear()
              if (provider === 'google') setUpGoogle(pick, idToken, userId)
              else setUpApple(pick, idToken, appleFailure)
              const sent = allauth(() => answerFor(pick as Outcome, s))
              await fireEvent.press(view.getByTestId(`${provider}-signin`))
              if (pick === 'cancelled') {
                await waitFor(() => expect(provider === 'google' ? googleSignIn : appleSignIn).toHaveBeenCalled())
                await new Promise((resolve) => setTimeout(resolve, 0))
                expect([sent, onError.mock.calls, navigation.push.mock.calls]).toEqual([[], [], []])
                continue
              }
              if (pick === 'failed') {
                await waitFor(() => expect(onError).toHaveBeenCalledWith(t('socialLoginError')))
                expect(sent).toEqual([])
                continue
              }
              const destination = destinations[pick]
              if (destination) {
                await waitFor(() => expect(navigation[destination[0]]).toHaveBeenCalledWith(destination[1]))
                expect(onError).not.toHaveBeenCalled()
              } else {
                const shown = waitMessage(pick, s) ?? refusalMessage(pick, s)
                await waitFor(() => expect(onError).toHaveBeenCalledWith(shown))
                expect(navigation.replace).not.toHaveBeenCalled()
              }
              const providerToken =
                provider === 'google' ? { id_token: idToken, client_id: userId } : { id_token: idToken }
              expect(sent).toEqual([
                {
                  method: 'POST',
                  path: '/v0/app/auth/provider/token',
                  body: { provider, process: 'login', token: providerToken },
                },
              ])
            }
          }
          expect(appleSignIn).toHaveBeenCalledWith({ requestedScopes: ['EMAIL'] })
          await view.unmount()
        }
      )
    )
  })
})
