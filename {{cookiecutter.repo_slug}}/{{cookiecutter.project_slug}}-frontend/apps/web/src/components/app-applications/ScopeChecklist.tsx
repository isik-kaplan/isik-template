'use client'

export type Scope = { name: string; label: string }

/** A checkbox per scope, each worded and named - the name is what an application's code asks for. */
export function ScopeChecklist({
  legend,
  scopes,
  value,
  onChange,
}: {
  legend: string
  scopes: Scope[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  if (scopes.length === 0) return null

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {scopes.map((scope) => (
        <label key={scope.name} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={value.includes(scope.name)}
            onChange={(event) =>
              onChange(
                event.target.checked ? [...value, scope.name].sort() : value.filter((name) => name !== scope.name)
              )
            }
          />
          <span className="flex flex-col">
            <span>{scope.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{scope.name}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
