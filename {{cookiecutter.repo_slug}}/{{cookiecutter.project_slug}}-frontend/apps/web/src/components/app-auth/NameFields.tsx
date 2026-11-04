'use client'

import type React from 'react'

import { Input } from '@/components/base/input'
import { Label } from '@/components/base/label'

import { useClientTranslation } from '@/i18n/client'
import type { Translate } from '@/i18n/config'
import { type NameField, isNameRequired } from '@/lib/names'

import { z } from 'zod'

// Django's own max_length on all three columns.
const NAME_MAX_LENGTH = 150

const AUTOCOMPLETE: Record<NameField, string> = {
  first_name: 'given-name',
  last_name: 'family-name',
  username: 'username',
}

// Only an offered name is required, and a profile hides only a chosen handle: a hidden name never refuses.
export function nameSchema(t: Translate) {
  const field = (name: NameField, required: string) => {
    const value = z.string().max(NAME_MAX_LENGTH, t('auth:validationNameTooLong'))
    return isNameRequired(name) ? value.trim().min(1, required) : value
  }
  return {
    first_name: field('first_name', t('auth:validationFirstNameRequired')),
    last_name: field('last_name', t('auth:validationLastNameRequired')),
    username: field('username', t('auth:validationUsernameRequired')),
  }
}

/** Only the shown names, so a name this project never asks for is never sent. */
export function shownNames(value: Record<NameField, string>, shown: readonly NameField[]) {
  return Object.fromEntries(shown.map((name) => [name, value[name]])) as Partial<Record<NameField, string>>
}

export function NameFields({
  shown,
  values,
  errors,
  onChange,
}: {
  shown: readonly NameField[]
  values: Record<NameField, string>
  errors?: Partial<Record<NameField, string[]>>
  onChange: (name: NameField) => (event: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const { t } = useClientTranslation(['auth'])
  const labels: Record<NameField, string> = {
    first_name: t('auth:nameFirstNameLabel'),
    last_name: t('auth:nameLastNameLabel'),
    username: t('auth:nameUsernameLabel'),
  }

  return shown.map((name) => (
    <div key={name} className="flex flex-col gap-2">
      <Label htmlFor={name}>{labels[name]}</Label>
      <Input
        id={name}
        name={name}
        autoComplete={AUTOCOMPLETE[name]}
        value={values[name]}
        onChange={onChange(name)}
        errorText={errors?.[name]?.[0]}
      />
    </div>
  ))
}
