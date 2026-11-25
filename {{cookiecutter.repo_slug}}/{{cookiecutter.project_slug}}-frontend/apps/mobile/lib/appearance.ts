import { useCallback, useEffect, useState } from 'react'

import type { Appearance } from '@/theme'

import * as SecureStore from 'expo-secure-store'

const KEY = 'appearance'

/** What the person chose last on this phone, or to follow the phone. */
export async function storedAppearance(): Promise<Appearance> {
  const stored = await SecureStore.getItemAsync(KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

/** The appearance the root layout provides, read once from the phone and kept when changed. */
export function useAppearanceChoice() {
  const [appearance, setAppearance] = useState<Appearance>('system')

  // A locked keychain leaves the phone's own.
  useEffect(() => {
    storedAppearance().then(setAppearance, () => undefined)
  }, [])

  const choose = useCallback((next: Appearance) => {
    setAppearance(next)
    void SecureStore.setItemAsync(KEY, next).catch(() => undefined)
  }, [])

  return { appearance, choose }
}
