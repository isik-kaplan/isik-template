import { Card, CardContent } from '@/components/base/card'

import { cn } from '@/lib/utils'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Renders markdown source (content policy, ToS, changelogs, ...) inside a styled card, so a
 * static .md file can become a real page without hand-writing its layout. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <Card className={cn('prose dark:prose-invert max-w-none', className)}>
      <CardContent>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
      </CardContent>
    </Card>
  )
}
