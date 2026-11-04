import { NAME_REQUIREMENT, type NameRequirement } from './nameRequirement'

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

/** The names a signup may carry at all. */
export function offeredNames(requirement = NAME_REQUIREMENT): readonly NameField[] {
  return OFFERED[requirement]
}

// Where the handle is required: only there does every account made since have one to log in with.
const HANDLE_LOGS_IN: readonly NameRequirement[] = ['full_and_username', 'username_with_optional_full', 'username_only']

export function handleLogsIn(requirement = NAME_REQUIREMENT): boolean {
  return HANDLE_LOGS_IN.includes(requirement)
}

/** Only the offered names, so a name this project never asks for is never sent. */
export function offeredValues(values: Record<NameField, string>, requirement = NAME_REQUIREMENT) {
  return Object.fromEntries(offeredNames(requirement).map((name) => [name, values[name]])) as Partial<
    Record<NameField, string>
  >
}
