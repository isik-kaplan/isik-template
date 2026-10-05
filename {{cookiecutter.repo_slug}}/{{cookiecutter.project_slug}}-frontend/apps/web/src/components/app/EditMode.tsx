'use client'

import { createContext, useContext, useState } from 'react'
import type React from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'

// Read first, edit on request: always-live inputs make a page somebody came to read look like a
// half-filled form. Context, because the toggle and the fields sit at opposite ends of the page.
type EditModeValue = { editing: boolean; start: () => void; stop: () => void }

const EditModeContext = createContext<EditModeValue | null>(null)

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false)
  const value = { editing, start: () => setEditing(true), stop: () => setEditing(false) }
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>
}

export function useEditMode(): EditModeValue {
  const value = useContext(EditModeContext)
  if (!value) {
    throw new Error('useEditMode must be used within an EditModeProvider.')
  }
  return value
}

/** The action beside the title. Hidden while editing, because the form carries its own way out. */
export function EditAction({ disabled = false, disabledReason }: { disabled?: boolean; disabledReason?: string }) {
  const { t } = useClientTranslation(['common'])
  const { editing, start } = useEditMode()

  if (editing) {
    return null
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={disabled} onClick={start}>
        {t('common:editAction')}
      </Button>
      {/* A control that will not move and says nothing reads as a bug rather than as a rule. */}
      {disabled && disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
    </div>
  )
}

/** Shows its children only while reading, so a page can keep its read-only rows beside the form. */
export function WhileReading({ children }: { children: React.ReactNode }) {
  return useEditMode().editing ? null : <>{children}</>
}

/** Shows its children only while editing - so a form inside it starts fresh on every entry. */
export function WhileEditing({ children }: { children: React.ReactNode }) {
  return useEditMode().editing ? <>{children}</> : null
}

/** The way out of a form: save, or put it back the way it was. Shared so every screen agrees. */
export function SaveActions({ isSubmitting, disabled = false }: { isSubmitting: boolean; disabled?: boolean }) {
  const { t } = useClientTranslation(['common'])
  const { stop } = useEditMode()

  return (
    <div className="flex items-center gap-2">
      <Button type="submit" className="w-fit" disabled={disabled || isSubmitting}>
        {isSubmitting ? t('common:savingAction') : t('common:saveAction')}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={isSubmitting} onClick={stop}>
        {t('common:cancelAction')}
      </Button>
    </div>
  )
}
