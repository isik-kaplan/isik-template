'use client'

import { cn } from '@/lib/utils'

import Mention from '@tiptap/extension-mention'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

/** A minimal rich-text editor - extend with more tiptap extensions as your content model needs
 * them (e.g. mentions of real users/orgs, wired through Mention's suggestion option). */
export function Editor({
  content,
  onChange,
  editable = true,
  className,
}: {
  content?: string
  onChange?: (html: string) => void
  editable?: boolean
  className?: string
}) {
  const editor = useEditor({
    extensions: [StarterKit, Mention],
    content,
    editable,
    // Stryker disable next-line BooleanLiteral: equivalent mutant in this test suite - it exists
    // to avoid an SSR hydration mismatch, and every render() here is client-only with nothing to
    // hydrate against. Verified directly: flipping it produces no different DOM, and no
    // console.error, in a real test run.
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        // border-border, not a bare border - Tailwind v4 has no implicit default border color
        // (border-color inherits currentColor), so this rendered as a solid dark line instead of
        // a subtle input-like border. See profile/(tabs)/layout.tsx's own comment on the same bug.
        class: cn(
          'prose dark:prose-invert max-w-none min-h-32 rounded-md border border-border p-3 focus:outline-none',
          className
        ),
      },
    },
  })

  return <EditorContent editor={editor} />
}
