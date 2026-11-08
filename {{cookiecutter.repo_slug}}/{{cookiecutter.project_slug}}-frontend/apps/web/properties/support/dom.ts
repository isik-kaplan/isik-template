import { navigation, toast } from './requests'
import { cleanup } from '@testing-library/react'

/**
 * Empties the document and the spies before this example. The suite's hooks run once per property, not
 * per example, so without it 25 renders pile into one document and a toast or a navigation from the
 * example before reads as this one's.
 */
export function freshDom() {
  cleanup()
  for (const spy of [toast.success, toast.error, toast.info, navigation.push, navigation.refresh, navigation.replace])
    spy.mockClear()
}
