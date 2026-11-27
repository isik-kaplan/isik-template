import { nameRequirement } from '@/lib/nameRequirement'

afterEach(() => {
  delete process.env.EXPO_PUBLIC_NAME_REQUIREMENT
})

it.each([
  ['full_only', 'full_only'],
  [undefined, '{{ cookiecutter.name_requirement }}'],
])('reads EXPO_PUBLIC_NAME_REQUIREMENT=%s, defaulting to the generated answer', (value, requirement) => {
  if (value === undefined) delete process.env.EXPO_PUBLIC_NAME_REQUIREMENT
  else process.env.EXPO_PUBLIC_NAME_REQUIREMENT = value

  expect(nameRequirement()).toBe(requirement)
})

it('refuses a build whose requirement is not one, naming the five', () => {
  process.env.EXPO_PUBLIC_NAME_REQUIREMENT = 'nickname'

  expect(() => nameRequirement()).toThrow(
    'EXPO_PUBLIC_NAME_REQUIREMENT is "nickname"; it is one of username_with_optional_full, full_only, ' +
      'full_and_username, full_with_optional_username, username_only'
  )
})
