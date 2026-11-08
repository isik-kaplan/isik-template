import type { NameRequirement } from '@/lib/nameRequirement'
import type { NameField } from '@/lib/names'
import type { Phone } from '@/lib/phoneOption'

import { text } from '../backend'
import fc from 'fast-check'

export const REQUIREMENTS: NameRequirement[] = [
  'username_with_optional_full',
  'full_only',
  'full_and_username',
  'full_with_optional_username',
  'username_only',
]

export const PHONES: Phone[] = ['none', 'optional', 'required']

// The backend's apps/users/names.py, restated: the names each requirement lets a signup carry.
export const ASKED: Record<NameRequirement, NameField[]> = {
  full_only: ['first_name', 'last_name'],
  full_and_username: ['first_name', 'last_name', 'username'],
  full_with_optional_username: ['first_name', 'last_name', 'username'],
  username_with_optional_full: ['username', 'first_name', 'last_name'],
  username_only: ['username'],
}

export const NAME_INPUTS: Record<NameField, string> = {
  first_name: 'first-name-input',
  last_name: 'last-name-input',
  username: 'username-input',
}

export const names = fc.record({
  first_name: text,
  last_name: text,
  username: fc.stringMatching(/^[a-z][a-z0-9_]{1,11}$/),
})

/** Only the names asked for, as the screen should send them. */
export function askedOf(requirement: NameRequirement, values: Record<NameField, string>) {
  return Object.fromEntries(ASKED[requirement].map((name) => [name, values[name]]))
}
