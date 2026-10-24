import { useState } from 'react'

import { SegmentedCodeInput } from '@/components/base/segmented-code-input'

import { fc, test } from '@fast-check/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const digitLabel = (position: number, total: number) => `Digit ${position} of ${total}`

function Harness({ groups = '3-3', initial = '' }: { groups?: string; initial?: string } = {}) {
  const [code, setCode] = useState(initial)
  return (
    <>
      <SegmentedCodeInput groups={groups} label="Code" digitLabel={digitLabel} value={code} onChange={setCode} />
      <output>{code}</output>
    </>
  )
}

const boxes = () => screen.getAllByRole('textbox')
const held = () => screen.getByRole('status').textContent

describe('SegmentedCodeInput', () => {
  it('draws a box per character of the shape it was given', () => {
    render(<Harness groups="3-3" />)

    expect(boxes()).toHaveLength(6)
  })

  it('draws whatever shape it is given, including one with no separator', () => {
    render(<Harness groups="4-4" />)
    expect(boxes()).toHaveLength(8)

    render(<Harness groups="6" />)
    expect(screen.getAllByRole('textbox')).toHaveLength(14)
  })

  // The whole point of the boxes: a code is read in groups, so it is typed in groups.
  it('moves to the next box as each digit is typed', async () => {
    render(<Harness />)

    await userEvent.type(boxes()[0], '123456')

    expect(held()).toBe('123456')
    expect(boxes().map((box) => (box as HTMLInputElement).value)).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  // A code is copied whole out of an app, so pasting must not land six characters in one box.
  it('spreads a pasted code across the boxes', async () => {
    render(<Harness />)

    boxes()[0].focus()
    await userEvent.paste('482913')

    expect(held()).toBe('482913')
  })

  it('takes only the digits out of a paste, so a copied 482-913 still lands', async () => {
    render(<Harness />)

    boxes()[0].focus()
    await userEvent.paste('482-913')

    expect(held()).toBe('482913')
  })

  // Overflow from a paste is dropped rather than wrapping to the first box.
  it('keeps only what fits when more is pasted than there are boxes', async () => {
    render(<Harness />)

    boxes()[4].focus()
    await userEvent.paste('482913')

    expect(held()).toBe('    48')
  })

  it('takes focus when it is asked to', () => {
    render(
      <SegmentedCodeInput groups="3-3" label="Code" digitLabel={digitLabel} value="" onChange={vi.fn()} autoFocus />
    )

    expect(document.activeElement).toBe(screen.getByLabelText('Digit 1 of 6'))
  })

  it('ignores a character that is not a digit', async () => {
    render(<Harness />)

    await userEvent.type(boxes()[0], 'a')

    expect(held()).toBe('')
  })

  // A typo is fixable without the mouse.
  it('steps back and clears on backspace in an empty box', async () => {
    render(<Harness initial="12" />)

    boxes()[2].focus()
    await userEvent.keyboard('{Backspace}')

    expect(held()).toBe('1')
    expect(boxes()[1]).toHaveProperty('value', '')
  })

  it('clears the box it is in when that box has something', async () => {
    render(<Harness initial="123" />)

    boxes()[1].focus()
    await userEvent.keyboard('{Backspace}')

    expect((boxes()[1] as HTMLInputElement).value).toBe('')
    // The third digit keeps its place rather than sliding left into the hole.
    expect((boxes()[2] as HTMLInputElement).value).toBe('3')
  })

  it('walks between boxes with the arrow keys', async () => {
    render(<Harness initial="123456" />)

    boxes()[3].focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(boxes()[2])

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(boxes()[4])
  })

  it('stays inside the control at either end', async () => {
    render(<Harness initial="123456" />)

    boxes()[0].focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(boxes()[0])

    boxes()[5].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(boxes()[5])
  })

  it('overwrites the box it is typed into rather than appending', async () => {
    render(<Harness initial="111111" />)

    await userEvent.type(boxes()[2], '9')

    expect(held()).toBe('119111')
  })

  // A screen reader lands on one box, so each says which one it is; the group carries the name.
  it('names the control once and every box by its position', () => {
    render(<Harness />)

    expect(screen.getByRole('group', { name: 'Code' })).not.toBeNull()
    expect(screen.getByLabelText('Digit 4 of 6')).not.toBeNull()
  })

  it('carries the whole code under one name for a native submit', () => {
    const { container } = render(
      <SegmentedCodeInput
        groups="3-3"
        name="code"
        label="Code"
        digitLabel={digitLabel}
        value="123456"
        onChange={vi.fn()}
      />
    )

    const hidden = container.querySelector('input[type="hidden"][name="code"]')
    expect(hidden).toHaveProperty('value', '123456')
  })

  it('refuses every box at once when it is disabled', () => {
    render(
      <SegmentedCodeInput groups="3-3" label="Code" digitLabel={digitLabel} value="" onChange={vi.fn()} disabled />
    )

    expect(screen.getAllByRole('textbox').every((box) => (box as HTMLInputElement).disabled)).toBe(true)
  })

  it('keeps the code to the shape it was given, even starting from a longer one', async () => {
    // Cut to fit rather than carried along invisibly.
    render(<Harness initial="123456789" />)

    await userEvent.type(boxes()[0], '7')

    expect(held()).toBe('723456')
  })

  it('stays where it is when a box is cleared, rather than moving on', async () => {
    // Clearing is not typing: moving forward here would walk away from the box just emptied.
    render(<Harness initial="123456" />)
    await userEvent.clear(boxes()[2])

    expect(document.activeElement).toBe(boxes()[2])
    expect(held()).toBe('12 456')
  })

  it('lands after the whole of a pasted run, not one box along', async () => {
    render(<Harness />)
    boxes()[0].focus()

    await userEvent.paste('123')

    expect(document.activeElement).toBe(boxes()[3])
  })

  it('lays the groups out in a row', () => {
    // The layout is the control: boxes stacked rather than in a line read as separate fields.
    render(<Harness />)

    expect(screen.getByRole('group', { name: 'Code' }).className).toContain('flex items-center gap-2')
  })

  it('puts a separator between groups and none in front of the first', () => {
    // The dash is what makes 123-456 read as the code on the screen it was copied from.
    const { container } = render(<Harness groups="3-3" />)

    const dashes = container.querySelectorAll('[aria-hidden="true"]')

    expect(dashes).toHaveLength(1)
    expect(container.firstElementChild?.firstElementChild?.textContent?.startsWith('–')).toBe(false)
  })

  it('draws no separator at all when the shape is one run of boxes', () => {
    const { container } = render(<Harness groups="6" />)

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0)
  })

  it('gives the id to the first box alone, which is what a label points at', () => {
    render(<Harness />)

    const identified = boxes().filter((box) => box.id !== '')

    expect(identified).toHaveLength(1)
    expect(identified[0]).toBe(boxes()[0])
  })

  it('replaces the digit in a full box rather than refusing the keystroke', () => {
    // keyDown, since the typing helper never reaches a full box.
    render(<Harness initial="123456" />)

    fireEvent.keyDown(boxes()[1], { key: '9' })

    expect(held()).toBe('193456')
  })

  it('leaves a letter to the browser rather than writing it', () => {
    render(<Harness initial="123456" />)

    fireEvent.keyDown(boxes()[1], { key: 'a' })

    expect(held()).toBe('123456')
  })

  it('treats a named key as a key, not as a character', () => {
    render(<Harness initial="123456" />)

    fireEvent.keyDown(boxes()[1], { key: 'Enter' })

    expect(held()).toBe('123456')
  })

  it('backspace in a filled box is left to the browser', () => {
    // Only an empty box steps back; a filled one is the browser's to clear.
    render(<Harness initial="123456" />)

    fireEvent.keyDown(boxes()[3], { key: 'Backspace' })

    expect(held()).toBe('123456')
  })

  it('a hole counts as empty, so backspace steps back out of it', () => {
    // A box cleared in the middle holds a space rather than nothing, and that still reads as empty.
    render(<Harness initial="12 456" />)

    fireEvent.keyDown(boxes()[2], { key: 'Backspace' })

    expect(held()).toBe('1  456')
  })

  it('selects what a box holds when it is focused', () => {
    // So the next keystroke replaces rather than being refused by maxLength.
    render(<Harness initial="123456" />)
    const box = boxes()[2] as HTMLInputElement

    fireEvent.focus(box)

    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 1])
  })

  it('a function key is not a digit, however it is spelled', () => {
    // "F5" contains a digit, so the pattern has to match the whole key rather than any part of it.
    render(<Harness initial="123456" />)

    fireEvent.keyDown(boxes()[1], { key: 'F5' })

    expect(held()).toBe('123456')
  })

  it('only backspace steps back out of an empty box', () => {
    render(<Harness initial="12 456" />)

    fireEvent.keyDown(boxes()[2], { key: 'F5' })

    expect(held()).toBe('12 456')
  })

  it('keeps the last character when a box is handed more than one', () => {
    // The browser appends, so a box holding 1 receives "19" and keeps the 9.
    render(<Harness initial="123456" />)

    fireEvent.change(boxes()[0], { target: { value: '19' } })

    expect(held()).toBe('923456')
  })

  it('keeps the last of three, not everything after the first', () => {
    render(<Harness initial="123456" />)

    fireEvent.change(boxes()[0], { target: { value: '178' } })

    expect(held()).toBe('823456')
  })

  test.prop([fc.stringMatching(/^[0-9a-z -]{0,12}$/)], { numRuns: 25 })(
    'a paste keeps exactly the first six digits it carries',
    async (text) => {
      cleanup()
      render(<Harness />)
      boxes()[0].focus()

      await userEvent.paste(text)

      const digits = text.replace(/\D/g, '').slice(0, 6)
      expect(held()).toBe(digits)
    }
  )

  it('reports nothing for a paste with no digit in it', async () => {
    const onChange = vi.fn()
    render(<SegmentedCodeInput groups="3-3" label="Code" digitLabel={digitLabel} value="12" onChange={onChange} />)
    boxes()[2].focus()

    await userEvent.paste('abc')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes only a single digit as a key, not a longer key that opens with one', () => {
    render(<Harness initial="123456" />)

    fireEvent.keyDown(boxes()[1], { key: '98' })

    expect(held()).toBe('123456')
  })
})
