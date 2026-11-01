'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState } from 'react'
import type React from 'react'

import { ScopeChecklist } from '@/components/app-applications/ScopeChecklist'
import { Badge } from '@/components/base/badge'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit, useValidatedFormState } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { anyVersion } from '@isikk/core'
import { useIdempotencyKey } from '@isikk/core/hooks'
import { z } from 'zod'

type Endpoint = ApiType<'Endpoint'>
type Kind = ApiType<'NoticeKind'>
// The secret is readable only in the answer that made it, so it is held here until the page is left.
type Issued = { id: string; secret: string | null; rotated: boolean }

// Parked first: it is off for a reason somebody has to act on, which "paused" would not say.
function standingOf(endpoint: Endpoint, t: Translate) {
  if (endpoint.parked_at) {
    return {
      variant: 'destructive' as const,
      label: t('auth:webhooksParked', { count: endpoint.consecutive_failures }),
    }
  }
  if (endpoint.is_active) return { variant: 'default' as const, label: t('auth:webhooksActive') }
  return { variant: 'secondary' as const, label: t('auth:webhooksPaused') }
}

/** The webhook endpoints, a way to register one, and what can be done to each. */
export function WebhookEndpoints({ endpoints, kinds }: { endpoints: Endpoint[]; kinds: Kind[] }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [issued, setIssued] = useState<Issued | null>(null)
  const { isSubmitting: isActing, submit: act } = useAPISubmit()
  // One per act, so a retry after a lost answer is the same act rather than a second one.
  const toggling = useIdempotencyKey()
  const unparking = useIdempotencyKey()
  const rotating = useIdempotencyKey()
  const finishing = useIdempotencyKey()
  const deleting = useIdempotencyKey()
  const schema = useMemo(
    () =>
      z.object({
        url: z.url(t('auth:webhooksUrlInvalid')),
        kinds: z.array(z.string()).min(1, t('auth:webhooksKindsRequired')),
      }),
    [t]
  )
  const { formState, formErrors, handleFormStateEvent, handleFormStateValue, isSubmitting, resetFormState, submit } =
    useValidatedFormState(schema, { url: '', kinds: [] as string[] })
  const choices = kinds.map((kind) => ({ name: kind.kind, label: kind.label ?? kind.kind }))
  const labelOf = (name: string) => choices.find((choice) => choice.name === name)?.label ?? name
  const api = () => createApi(apiOrigin())

  async function register(event: React.FormEvent) {
    event.preventDefault()
    await submit(
      ({ url, kinds: wanted }, idempotencyKey) =>
        api().registerNotificationEndpoint({ url, kinds: wanted.map((kind) => ({ kind })) }, idempotencyKey),
      {
        failure: t('auth:webhooksRegisterError'),
        onSuccess: ({ data }) => {
          setIssued({ id: data.id, secret: data.secret, rotated: false })
          resetFormState()
          router.refresh()
        },
      }
    )
  }

  // The list carries no version per row, so a change is made against whatever is current.
  function headers(key: ReturnType<typeof useIdempotencyKey>, payload: unknown) {
    return { ...anyVersion(), ...key.headerFor(payload) }
  }

  async function change(
    call: () => Promise<{ data?: unknown; error?: unknown; response: Response }>,
    key: ReturnType<typeof useIdempotencyKey>,
    failure: string,
    then?: (data: Endpoint) => void
  ) {
    await act(call, {
      failure,
      onSuccess: ({ data }) => {
        key.used()
        then?.(data as Endpoint)
        router.refresh()
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {issued && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <p className="font-semibold">{t('auth:webhooksSecretTitle')}</p>
          <p className="text-muted-foreground">{t('auth:webhooksSecretHint')}</p>
          <p className="font-mono break-all">{issued.secret}</p>
          {issued.rotated && (
            <>
              <p className="text-muted-foreground">{t('auth:webhooksRotatedHint')}</p>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={isActing}
                onClick={() =>
                  change(
                    () => api().finishNotificationEndpointRotation(issued.id, headers(finishing, issued.id)),
                    finishing,
                    t('auth:webhooksActionError'),
                    () => setIssued({ ...issued, rotated: false })
                  )
                }
              >
                {t('auth:webhooksFinishRotation')}
              </Button>
            </>
          )}
        </div>
      )}

      <form onSubmit={register} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook_url">{t('auth:webhooksUrlLabel')}</Label>
          <Input
            id="webhook_url"
            name="url"
            inputMode="url"
            placeholder="https://example.com/webhooks"
            value={formState.url}
            onChange={handleFormStateEvent('url')}
            errorText={formErrors?.url?.[0]}
          />
        </div>
        <ScopeChecklist
          legend={t('auth:webhooksKindsLabel')}
          scopes={choices}
          value={formState.kinds}
          onChange={handleFormStateValue('kinds')}
        />
        {formErrors?.kinds && <p className="text-sm text-destructive">{formErrors.kinds[0]}</p>}
        <Button type="submit" className="self-start" disabled={isSubmitting}>
          {t('auth:webhooksRegister')}
        </Button>
      </form>

      {endpoints.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:webhooksEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {endpoints.map((endpoint) => {
            const standing = standingOf(endpoint, t)
            return (
              <li key={endpoint.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 font-mono text-sm break-all">{endpoint.url}</code>
                  <Badge variant={standing.variant}>{standing.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {endpoint.kinds?.map(({ kind }) => labelOf(kind)).join(', ')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {endpoint.parked_at && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isActing}
                      onClick={() =>
                        change(
                          () => api().unparkNotificationEndpoint(endpoint.id, headers(unparking, endpoint.id)),
                          unparking,
                          t('auth:webhooksActionError')
                        )
                      }
                    >
                      {t('auth:webhooksUnpark')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isActing}
                    onClick={() => {
                      const body = { is_active: !endpoint.is_active }
                      change(
                        () =>
                          api().updateNotificationEndpoint(
                            endpoint.id,
                            body,
                            headers(toggling, { id: endpoint.id, ...body })
                          ),
                        toggling,
                        t('auth:webhooksActionError')
                      )
                    }}
                  >
                    {endpoint.is_active ? t('auth:webhooksPause') : t('auth:webhooksResume')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isActing}
                    onClick={() =>
                      change(
                        () => api().rotateNotificationEndpointSecret(endpoint.id, headers(rotating, endpoint.id)),
                        rotating,
                        t('auth:webhooksActionError'),
                        (rotated) => setIssued({ id: endpoint.id, secret: rotated.secret, rotated: true })
                      )
                    }
                  >
                    {t('auth:webhooksRotate')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isActing}
                    onClick={() =>
                      change(
                        () => api().deleteNotificationEndpoint(endpoint.id, headers(deleting, endpoint.id)),
                        deleting,
                        t('auth:webhooksDeleteError')
                      )
                    }
                  >
                    {t('auth:webhooksDelete')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
