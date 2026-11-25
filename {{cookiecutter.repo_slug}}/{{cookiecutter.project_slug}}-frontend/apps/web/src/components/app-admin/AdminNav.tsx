import Link from 'next/link'

type NavLink = { href: string; label: string }

/** The admin's sections, and the way back to the app, which is another host. */
export function AdminNav({ label, sections, app }: { label: string; sections: NavLink[]; app: NavLink }) {
  return (
    <nav
      aria-label={label}
      className="mx-auto mt-16 flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-6 text-sm"
    >
      {sections.map((section) => (
        <Link key={section.href} href={section.href} className="font-medium underline-offset-4 hover:underline">
          {section.label}
        </Link>
      ))}
      <a href={app.href} className="ml-auto text-muted-foreground underline underline-offset-4">
        {app.label}
      </a>
    </nav>
  )
}
