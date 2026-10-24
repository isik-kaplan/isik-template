import { Card, CardContent } from '@/components/base/card'

import { cn } from '@/lib/utils'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Markdown in a styled card. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <Card className={cn('prose dark:prose-invert max-w-none', className)}>
      <CardContent>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
      </CardContent>
    </Card>
  )
}
