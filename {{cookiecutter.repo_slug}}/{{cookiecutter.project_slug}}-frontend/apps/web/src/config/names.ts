export type NameRequirement =
  'username_with_optional_full' | 'full_only' | 'full_and_username' | 'full_with_optional_username' | 'username_only'

// The backend's NAME_REQUIREMENT, chosen when the project was generated.
export const NAME_REQUIREMENT: NameRequirement = '{{ cookiecutter.name_requirement }}'
