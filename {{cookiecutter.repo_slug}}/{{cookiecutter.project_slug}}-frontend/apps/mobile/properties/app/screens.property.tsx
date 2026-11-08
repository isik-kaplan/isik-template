import { type Answers, type Visitor, backend, world } from '../support/backend'
import { forgetNavigation } from '../support/navigation'
import { kept } from '../support/store'
import { render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'
import { readdirSync } from 'node:fs'
import path from 'node:path'

// Every screen file, found rather than listed, so a new screen has something said about it the day it lands.
const APP = path.join(__dirname, '../../app')
const files = (readdirSync(APP, { recursive: true }) as string[]).filter(
  (file) => file.endsWith('.tsx') && !file.includes('_layout')
)
let screens: { file: string; Screen: () => React.ReactElement }[] = []

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  screens = files.map((file) => ({ file, Screen: require(`../../app/${file.replace(/\.tsx$/, '')}`).default }))
})

describe('every screen', () => {
  it('is found by the sweep at all', () => {
    expect(screens.length).toBeGreaterThan(10)
  })

  it('renders, whoever is signed in and whatever the backend answers', async () => {
    await fc.assert(
      fc.asyncProperty(
        world,
        fc.constantFrom<Visitor>('anonymous', 'member', 'staff'),
        fc.constantFrom<Answers>('everything', 'no collections', 'nothing at all'),
        async (w, visitor, answering) => {
          forgetNavigation()
          kept.clear()
          if (visitor !== 'anonymous') kept.set('session_token', 'a-token')
          global.fetch = backend(w, visitor, answering) as unknown as typeof fetch
          for (const { file, Screen } of screens) {
            const view = await render(<Screen />)
            await waitFor(() => expect(view.toJSON() !== undefined).toBe(true))
            await view.unmount()
            expect(file).toBeTruthy()
          }
        }
      )
    )
  })
})
