'use client'

import { Button } from '@/components/base/button'

import { SESSION_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

import Cookies from 'js-cookie'

export type AutoFormButtonProps = React.ComponentProps<typeof Button> & {
  // An absolute URL on auth.<domain>, computed server-side by the caller: window.location is
  // wrong during this component's server render.
  action: string
  payload?: Record<string, string>
  csrfCookieName?: string
}

// A real form submission, not fetch(): the endpoint 302s to the IdP, and a navigation is exempt from CORS.
export function AutoFormButton({
  action,
  payload = {},
  csrfCookieName = 'csrftoken',
  children,
  onClick,
  ...buttonProps
}: AutoFormButtonProps) {
  async function handleClick() {
    // A new visitor has no csrftoken cookie yet; the session endpoint sets one, or the first click 403s.
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
