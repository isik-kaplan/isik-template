'use client'

import { Button } from '@/components/base/button'

import { SESSION_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

import Cookies from 'js-cookie'

export type AutoFormButtonProps = React.ComponentProps<typeof Button> & {
  // A full absolute URL, not a path - action is cross-origin (auth.<domain>), since this template
  // splits the frontend and backend onto separate subdomains rather than serving them same-origin.
  // Computed by the caller, server-side where request-origin info actually lives, and passed down
  // as a plain value - not built here from window.location.origin, which would be wrong during
  // this client component's own initial server render.
  action: string
  payload?: Record<string, string>
  csrfCookieName?: string
}

// Real HTML form submission, not fetch() - the provider redirect endpoint responds with a 302 to
// the IdP, and only a real browser navigation follows that natively. It's also what sidesteps
// CORS for this one cross-origin (auth.<domain>) call: a full-page form POST is a navigation, not
// an XHR, so the browser never applies CORS to it at all.
export function AutoFormButton({
  action,
  payload = {},
  csrfCookieName = 'csrftoken',
  children,
  onClick,
  ...buttonProps
}: AutoFormButtonProps) {
  async function handleClick() {
    // A brand-new visitor's browser has never made a request to auth.<domain>, so it has no
    // csrftoken cookie yet - Django only sets one once something calls get_token() during a
    // request, which the session endpoint reliably does. Without this, this button's very first
    // click on a fresh session 403s outright.
    if (!Cookies.get(csrfCookieName)) {
      await fetch(`${new URL(action).origin}${SESSION_PATH}`, { credentials: 'include' })
    }

    const form = document.createElement('form')
    form.action = action
    form.method = 'POST'
    form.style.display = 'none'

    const fields = { ...payload, csrfmiddlewaretoken: Cookies.get(csrfCookieName) ?? '' }
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }

    document.body.appendChild(form)
    form.submit()
  }

  return (
    <Button
      {...buttonProps}
      onClick={(event) => {
        void handleClick()
        onClick?.(event)
      }}
    >
      {children}
    </Button>
  )
}
