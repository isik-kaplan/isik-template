import WebhooksPage from '@/app/webhooks/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/app/PageShell', () => ({
  PageShell: (props: {
    title: string
    description: string
    backHref: string
    backLabel: string
    children: React.ReactNode
  }) => (
    <main>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      <a href={props.backHref}>{props.backLabel}</a>
      {props.children}
    </main>
  ),
}))
vi.mock('@/components/app-webhooks/WebhookEndpoints', () => ({
  WebhookEndpoints: ({ endpoints, kinds }: { endpoints: { url: string }[]; kinds: { kind: string }[] }) => (
    <p>
      endpoints {endpoints.length}:{endpoints.map((endpoint) => endpoint.url).join(',')} kinds {kinds.length}:
      {kinds.map((kind) => kind.kind).join(',')}
    </p>
  ),
}))
const me = vi.fn()
const notificationEndpoints = vi.fn()
const notificationKinds = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, notificationEndpoints, notificationKinds }) }))

function asked(fields: { is_staff?: boolean } = {}) {
  me.mockResolvedValue({ data: { is_staff: false, is_superuser: false, permissions: [], ...fields } })
}

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notificationEndpoints.mockResolvedValue({ data: { results: [{ url: 'https://a.test/hook' }] } })
    notificationKinds.mockResolvedValue({ data: [{ kind: 'account_changed' }] })
  })

  it('lists the endpoints and the kinds they may be sent, under a title that says what they are', async () => {
    asked({ is_staff: true })

    render(await WebhooksPage())

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Webhooks')
    expect(screen.getByText("Addresses notifications are POSTed to, signed with each one's secret.")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(screen.getByText('endpoints 1:https://a.test/hook kinds 1:account_changed')).toBeTruthy()
  })

  it('lists nothing when the backend answered with nothing', async () => {
    asked({ is_staff: true })
    notificationEndpoints.mockResolvedValue({ data: undefined })
    notificationKinds.mockResolvedValue({ data: undefined })

    render(await WebhooksPage())

    expect(screen.getByText('endpoints 0: kinds 0:')).toBeTruthy()
  })

  it('is not found for somebody the backend could not name', async () => {
    me.mockResolvedValue({ data: undefined })

    await expect(WebhooksPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notificationEndpoints).not.toHaveBeenCalled()
  })
{%- if cookiecutter.webhooks == "staff" %}

  it("is not found for anybody but staff, since the endpoints are the whole deployment's", async () => {
    asked()

    await expect(WebhooksPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notificationEndpoints).not.toHaveBeenCalled()
  })
{%- else %}

  it("is anybody's, for their own endpoints", async () => {
    asked()

    render(await WebhooksPage())

    expect(screen.getByText('endpoints 1:https://a.test/hook kinds 1:account_changed')).toBeTruthy()
  })
{%- endif %}
})
