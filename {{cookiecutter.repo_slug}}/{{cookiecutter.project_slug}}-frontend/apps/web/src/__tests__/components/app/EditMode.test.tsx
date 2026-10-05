import type { ReactNode } from 'react'

import {
  EditAction,
  EditModeProvider,
  SaveActions,
  WhileEditing,
  WhileReading,
  useEditMode,
} from '@/components/app/EditMode'

import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function Page({ children }: { children?: ReactNode }) {
  return (
    <EditModeProvider>
      <EditAction />
      <WhileReading>
        <p>reading</p>
      </WhileReading>
      <WhileEditing>
        <form>
          <p>editing</p>
          <SaveActions isSubmitting={false} />
        </form>
      </WhileEditing>
      {children}
    </EditModeProvider>
  )
}

describe('EditMode', () => {
  it('opens read-only, with the edit action and no form', () => {
    render(<Page />)

    expect(screen.getByText('reading')).toBeTruthy()
    expect(screen.queryByText('editing')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('swaps the read-only rows for the form once Edit is pressed, and hides Edit', () => {
    render(<Page />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.queryByText('reading')).toBeNull()
    expect(screen.getByText('editing')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('goes back to reading on Cancel', () => {
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('reading')).toBeTruthy()
    expect(screen.queryByText('editing')).toBeNull()
  })

  it('throws when used outside its provider, naming the provider', () => {
    expect(() => renderHook(() => useEditMode())).toThrow('useEditMode must be used within an EditModeProvider.')
  })
})

describe('EditAction', () => {
  it('can be disabled, saying why', () => {
    render(
      <EditModeProvider>
        <EditAction disabled disabledReason="Only an admin can change this." />
      </EditModeProvider>
    )

    expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Only an admin can change this.')).toBeTruthy()
  })

  it('says nothing beneath an enabled button, even when given a reason', () => {
    render(
      <EditModeProvider>
        <EditAction disabledReason="Only an admin can change this." />
      </EditModeProvider>
    )

    expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('Only an admin can change this.')).toBeNull()
  })
})

describe('SaveActions', () => {
  function editing(node: ReactNode) {
    function Start() {
      const { start } = useEditMode()
      return (
        <button type="button" onClick={start}>
          start
        </button>
      )
    }
    render(
      <EditModeProvider>
        <Start />
        <WhileEditing>{node}</WhileEditing>
      </EditModeProvider>
    )
    fireEvent.click(screen.getByText('start'))
  }

  it('offers an enabled Save submit button and Cancel', () => {
    editing(<SaveActions isSubmitting={false} />)

    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.type).toBe('submit')
    expect(save.disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).type).toBe('button')
  })

  it('says it is saving and refuses both buttons while a submit is in flight', () => {
    editing(<SaveActions isSubmitting />)

    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('can disable Save on its own, leaving Cancel available', () => {
    editing(<SaveActions isSubmitting={false} disabled />)

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
