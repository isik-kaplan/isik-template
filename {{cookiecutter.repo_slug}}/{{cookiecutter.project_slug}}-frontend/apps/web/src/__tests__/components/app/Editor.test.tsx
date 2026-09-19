import { Editor } from '@/components/app/Editor'

import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('Editor', () => {
  it('renders the given content as an editable rich-text area', async () => {
    const { container } = render(<Editor content="<p>Hello</p>" />)

    await waitFor(() => expect(container.querySelector('[contenteditable="true"]')).toBeTruthy())
    expect(container.textContent).toContain('Hello')
  })

  it('renders read-only when editable is false', async () => {
    const { container } = render(<Editor content="<p>Hello</p>" editable={false} />)

    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy())
    expect(container.querySelector('[contenteditable="true"]')).toBeNull()
  })

  it('merges an extra className onto the editable surface, alongside the built-in prose styling', async () => {
    const { container } = render(<Editor content="<p>Hello</p>" className="custom-class" />)

    await waitFor(() => expect(container.querySelector('.custom-class')).toBeTruthy())
    expect(container.querySelector('.custom-class')?.className).toContain('prose')
  })

  it('calls onChange with the updated HTML when the document changes', async () => {
    // A real keystroke goes through userEvent, which needs elementFromPoint/getClientRects for
    // cursor placement - jsdom has neither. Dispatching the DOM "input" event ProseMirror listens
    // for directly, after editing textContent by hand, reaches onUpdate without either.
    const onChange = vi.fn()
    const { container } = render(<Editor content="<p>Hello</p>" onChange={onChange} />)
    const editable = await waitFor(() => {
      const el = container.querySelector('[contenteditable="true"]') as HTMLElement
      expect(el).toBeTruthy()
      return el
    })

    editable.textContent = 'Hello world'
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }))

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0]).toContain('Hello world')
  })

  it('does not throw when the document changes and no onChange was given', async () => {
    const { container } = render(<Editor content="<p>Hello</p>" />)
    const editable = await waitFor(() => {
      const el = container.querySelector('[contenteditable="true"]') as HTMLElement
      expect(el).toBeTruthy()
      return el
    })

    editable.textContent = 'Hello world'
    expect(() =>
      editable.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }))
    ).not.toThrow()
  })
})
