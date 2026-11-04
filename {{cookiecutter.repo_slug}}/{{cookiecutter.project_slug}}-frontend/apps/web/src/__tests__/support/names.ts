import type { NameRequirement } from '@/config/names'
import type { NameField } from '@/lib/names'

// Each requirement as the backend's NameRequirement has it: offered in form order, then required.
export const NAME_TABLE: [NameRequirement, NameField[], NameField[]][] = [
  ['username_with_optional_full', ['username', 'first_name', 'last_name'], ['username']],
  ['full_only', ['first_name', 'last_name'], ['first_name', 'last_name']],
  ['full_and_username', ['first_name', 'last_name', 'username'], ['first_name', 'last_name', 'username']],
  ['full_with_optional_username', ['first_name', 'last_name', 'username'], ['first_name', 'last_name']],
  ['username_only', ['username'], ['username']],
]

export const NAME_FIELDS: NameField[] = ['first_name', 'last_name', 'username']

export const NAME_LABELS: Record<NameField, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  username: 'Username',
}

export const NAME_REQUIRED_MESSAGES: Record<NameField, string> = {
  first_name: 'Enter your first name.',
  last_name: 'Enter your last name.',
  username: 'Choose a username.',
}

export const NAME_VALUES: Record<NameField, string> = { first_name: 'Jane', last_name: 'Doe', username: 'jane' }

export const NAME_AUTOCOMPLETE: Record<NameField, string> = {
  first_name: 'given-name',
  last_name: 'family-name',
  username: 'username',
}
