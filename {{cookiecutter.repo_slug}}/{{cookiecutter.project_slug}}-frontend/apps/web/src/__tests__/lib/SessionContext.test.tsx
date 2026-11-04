import { SessionProvider, useSession } from '@/lib/SessionContext'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function ShowSession() {
  const session = useSession()
  return <span>{session ? session.user.display : 'anonymous'}</span>
}

describe('SessionContext', () => {
  it('gives useSession the session a provider passed down', () => {
    const session = { user: { id: '1', display: 'Jane Doe', email: 'jane@example.test' } }
    render(
      <SessionProvider session={session}>
        <ShowSession />
      </SessionProvider>
    )

    expect(screen.getByText('Jane Doe')).toBeTruthy()
  })

  it('defaults to null outside any provider', () => {
    render(<ShowSession />)

    expect(screen.getByText('anonymous')).toBeTruthy()
  })
})
