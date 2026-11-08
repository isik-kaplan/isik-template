import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { useIsMounted } from '@isikk/core/hooks'
import { Text } from 'react-native'

type PhoneNumber = { phone: string; verified: boolean }

/** A new number is texted a code, and replaces the old only once that code comes back. */
export default function ProfilePhone() {
  const { t } = useTranslation()
  const [phone, setPhone] = useState<PhoneNumber | null>(null)
  const [number, setNumber] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .phone()
      .then(({ data }) => {
        if (isMounted()) setPhone(data?.data[0] ?? null)
      })
  }, [isMounted])

  async function send() {
    setError(undefined)
    setSaved(false)
    const { data, error: response, response: http } = await getAuthApi().changePhone(number)
    if (data) {
      setSentTo(data.data[0].phone)
      setNumber('')
      return
    }
    setError(tooManyRequestsMessage(t, http) ?? errorsOf(response)?.[0]?.message ?? t('profilePhoneChangeError'))
  }

  async function verify() {
    setError(undefined)
    const { data, error: response, response: http } = await getAuthApi().verifyPhone(code.trim())
    if (data) {
      setPhone({ phone: sentTo as string, verified: true })
      setSentTo(null)
      setCode('')
      setSaved(true)
      return
    }
    setError(tooManyRequestsMessage(t, http) ?? errorsOf(response)?.[0]?.message ?? t('verifyPhoneError'))
  }

  return (
    <Screen testID="profile-phone">
      <Heading testID="profile-phone-heading">{t('profilePhoneHeading')}</Heading>
      <Text testID="profile-phone-current">
        {phone ? `${phone.phone}${phone.verified ? '' : t('profilePhoneUnverifiedSuffix')}` : t('profilePhoneNone')}
      </Text>
      {saved && <Text testID="profile-phone-saved">{t('profilePhoneSaved')}</Text>}
      {error && <ErrorText testID="profile-phone-error">{error}</ErrorText>}
      {sentTo ? (
        <>
          <Text testID="profile-phone-code-sent">{t('profilePhoneCodeSent', { phone: sentTo })}</Text>
          <TextField
            testID="profile-phone-code-input"
            placeholder={t('verifyPhoneCodePlaceholder')}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            value={code}
            onChangeText={setCode}
          />
          <Button
            testID="profile-phone-verify"
            label={t('profilePhoneVerify')}
            disabled={code.trim().length === 0}
            onPress={verify}
          />
        </>
      ) : (
        <>
          <TextField
            testID="profile-phone-number-input"
            placeholder={t('profilePhoneNewPlaceholder')}
            keyboardType="phone-pad"
            autoComplete="tel"
            value={number}
            onChangeText={setNumber}
          />
          <Button
            testID="profile-phone-send"
            label={t('profilePhoneSend')}
            disabled={number.length === 0}
            onPress={send}
          />
        </>
      )}
    </Screen>
  )
}
