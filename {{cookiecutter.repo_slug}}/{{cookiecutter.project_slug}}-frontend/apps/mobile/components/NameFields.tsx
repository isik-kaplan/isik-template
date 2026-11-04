import { useTranslation } from '@/lib/i18n'
import type { NameField } from '@/lib/names'

import { TextField } from './TextField'

const TEST_IDS: Record<NameField, string> = {
  first_name: 'first-name-input',
  last_name: 'last-name-input',
  username: 'username-input',
}

export function NameFields({
  shown,
  values,
  onChange,
}: {
  shown: readonly NameField[]
  values: Record<NameField, string>
  onChange: (name: NameField, value: string) => void
}) {
  const { t } = useTranslation()
  const placeholders: Record<NameField, string> = {
    first_name: t('firstNamePlaceholder'),
    last_name: t('lastNamePlaceholder'),
    username: t('usernamePlaceholder'),
  }

  return shown.map((name) => (
    <TextField
      key={name}
      testID={TEST_IDS[name]}
      placeholder={placeholders[name]}
      autoCapitalize={name === 'username' ? 'none' : 'words'}
      value={values[name]}
      onChangeText={(value) => onChange(name, value)}
    />
  ))
}
