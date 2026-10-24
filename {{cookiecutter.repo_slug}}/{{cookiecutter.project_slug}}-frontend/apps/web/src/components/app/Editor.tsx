'use client'

import { cn } from '@/lib/utils'

import Mention from '@tiptap/extension-mention'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

/** A minimal rich-text editor; add tiptap extensions as needed. */
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
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: {
        // border-border: Tailwind v4 has no default border color, so a bare border draws dark.
        class: cn(
          'prose dark:prose-invert max-w-none min-h-32 rounded-md border border-border p-3 focus:outline-none',
          className
        ),
      },
    },
  })

  return <EditorContent editor={editor} />
}
