// Jest's automatic node_modules mock (see the Jest docs on __mocks__ adjacent to node_modules) -
// applied to every test file that transitively imports this native module, without each one
// needing its own jest.mock() call. A test that actually exercises Apple sign-in behavior
// (lib/nativeSignIn.test.ts, components/SocialLoginButtons.test.tsx) overrides this explicitly.
export const AppleAuthenticationScope = { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' }
export const signInAsync = jest.fn()
