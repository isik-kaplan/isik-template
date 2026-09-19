import type { SVGProps } from 'react'

// Real, simplified brand marks for the providers social login most commonly configures - every
// other allauth provider (there are ~100) has no bundled icon here and falls back to
// social_login_provider_icons' own URL, or no icon at all. See ProviderIcon.

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.87c2.27-2.09 3.58-5.17 3.58-8.68Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.87-3.02c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.12-6.73-4.96H1.28v3.11A11.99 11.99 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.28a11.99 11.99 0 0 0 0 10.76l3.99-3.11Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.28 6.62l3.99 3.11C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

function AppleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.24 3.06-.86.98-2.24 1.72-3.4 1.62-.12-1.1.42-2.24 1.22-3.06.85-.94 2.28-1.65 3.42-1.62Zm3.36 16.3c-.5 1.16-.98 2.05-1.6 2.9-.86 1.18-2.16 2.66-3.7 2.68-1.37.02-1.72-.9-3.58-.9-1.86 0-2.26.88-3.58.9-1.5.03-2.66-1.35-3.53-2.53-2.4-3.32-3.06-8.34-1.28-11.4a5.65 5.65 0 0 1 4.72-2.87c1.4-.03 2.42.94 3.32.94.9 0 2.28-1.16 3.9-.99a5.35 5.35 0 0 1 3.94 2.18 5.24 5.24 0 0 0-2.5 4.5c0 2.53 1.53 3.72 1.9 3.99Z" />
    </svg>
  )
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M18.24 2h3.02l-6.6 7.54L22.5 22h-6.1l-4.78-6.26L6.1 22H3.07l7.06-8.07L1.5 2h6.26l4.32 5.72L18.24 2Zm-1.06 18.13h1.68L7.9 3.77H6.1l11.08 16.36Z" />
    </svg>
  )
}

function MicrosoftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  )
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.135.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
    </svg>
  )
}

function SlackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...props}>
      <path
        fill="#36C5F0"
        d="M5.042 15.165a2.528 2.528 0 1 1-2.52-2.523h2.52v2.523ZM6.313 15.165a2.528 2.528 0 0 1 5.052 0v6.32a2.528 2.528 0 1 1-5.052 0v-6.32Z"
      />
      <path
        fill="#2EB67D"
        d="M8.839 5.042a2.528 2.528 0 1 1 2.523-2.52v2.52H8.839ZM8.839 6.313a2.528 2.528 0 0 1 0 5.052h-6.32a2.528 2.528 0 1 1 0-5.052h6.32Z"
      />
      <path
        fill="#ECB22E"
        d="M18.956 8.839a2.528 2.528 0 1 1 2.52 2.523h-2.52V8.839ZM17.685 8.839a2.528 2.528 0 0 1-5.052 0v-6.32a2.528 2.528 0 1 1 5.052 0v6.32Z"
      />
      <path
        fill="#E01E5A"
        d="M15.161 18.956a2.528 2.528 0 1 1-2.523 2.52v-2.52h2.523ZM15.161 17.685a2.528 2.528 0 0 1 0-5.052h6.32a2.528 2.528 0 1 1 0 5.052h-6.32Z"
      />
    </svg>
  )
}

function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124ZM7.114 20.452H3.558V9h3.556v11.452Z" />
    </svg>
  )
}

// Keyed by allauth provider id, matching SOCIAL_PROVIDERS[].id exactly (e.g. the provider is
// "twitter_oauth2", not "twitter" or "x").
export const BRAND_ICONS: Record<string, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  google: GoogleIcon,
  apple: AppleIcon,
  twitter_oauth2: XIcon,
  microsoft: MicrosoftIcon,
  github: GithubIcon,
  facebook: FacebookIcon,
  slack: SlackIcon,
  linkedin_oauth2: LinkedinIcon,
}
