import { NAME_REQUIREMENT, type NameRequirement } from '@/config/names'

export type NameField = 'first_name' | 'last_name' | 'username'

const FULL: readonly NameField[] = ['first_name', 'last_name']

// The backend's apps/users/names.py, in the order a form asks for them.
const OFFERED: Record<NameRequirement, readonly NameField[]> = {
  full_only: FULL,
  full_and_username: [...FULL, 'username'],
  full_with_optional_username: [...FULL, 'username'],
  username_with_optional_full: ['username', ...FULL],
  username_only: ['username'],
}

const REQUIRED: Record<NameRequirement, readonly NameField[]> = {
  full_only: FULL,
  full_and_username: [...FULL, 'username'],
  full_with_optional_username: FULL,
  username_with_optional_full: ['username'],
  username_only: ['username'],
}

/** The names a signup or a profile may carry at all. */
export function offeredNames(requirement = NAME_REQUIREMENT): readonly NameField[] {
  return OFFERED[requirement]
}

export function isNameRequired(field: NameField, requirement = NAME_REQUIREMENT): boolean {
  return REQUIRED[requirement].includes(field)
}

/** A handle logs in only where every account made since has one. */
export function handleLogsIn(requirement = NAME_REQUIREMENT): boolean {
  return isNameRequired('username', requirement)
}

export type Named = { first_name?: string; last_name?: string; username?: string | null; email: string }

/** The backend's label(): name, then handle, then address. */
export function personLabel(person: Named): string {
  return `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() || person.username || person.email
}

/** The names somebody may change: a handle is chosen once, so only by somebody who has none yet. */
export function editableNames(
  person: { username?: string | null },
  requirement = NAME_REQUIREMENT
): readonly NameField[] {
  return offeredNames(requirement).filter((name) => name !== 'username' || !person.username)
}
