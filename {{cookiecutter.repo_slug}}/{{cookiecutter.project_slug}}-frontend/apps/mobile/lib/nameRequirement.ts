export const NAME_REQUIREMENTS = [
  'username_with_optional_full',
  'full_only',
  'full_and_username',
  'full_with_optional_username',
  'username_only',
] as const

export type NameRequirement = (typeof NAME_REQUIREMENTS)[number]

// EXPO_PUBLIC_NAME_REQUIREMENT, the backend's ACCOUNTS__NAME_REQUIREMENT; unset, the answer given at generation.
export function nameRequirement(): NameRequirement {
  const value = process.env.EXPO_PUBLIC_NAME_REQUIREMENT ?? '{{ cookiecutter.name_requirement }}'
  if (!(NAME_REQUIREMENTS as readonly string[]).includes(value)) {
    throw new Error(
      `EXPO_PUBLIC_NAME_REQUIREMENT is ${JSON.stringify(value)}; it is one of ${NAME_REQUIREMENTS.join(', ')}`
    )
  }
  return value as NameRequirement
}
