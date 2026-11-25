export type Declared = { name: string; label: string }

/** What `names` let somebody do, in the declarations' own words; a name nothing declares is shown as it is. */
export function permissionLabels(names: string[] | undefined, declared: Declared[] | undefined): string[] {
  return (names ?? []).map((name) => declared?.find((permission) => permission.name === name)?.label ?? name)
}
