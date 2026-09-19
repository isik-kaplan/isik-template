import ProfileDetailsPage from '@/app/profile/(tabs)/details/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ requireSession: () => requireSession() }))

describe('ProfileDetailsPage', () => {
  it("renders the visitor's username and email", async () => {
    requireSession.mockResolvedValue({ user: { id: '1', username: 'jane', email: 'jane@test.test' } })

    render(await ProfileDetailsPage())

    expect(screen.getByText('jane')).toBeTruthy()
    expect(screen.getByText('jane@test.test')).toBeTruthy()
    expect(screen.getByText('Username')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
  })
})
