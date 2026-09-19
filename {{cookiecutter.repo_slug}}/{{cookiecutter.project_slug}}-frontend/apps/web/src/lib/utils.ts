import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Hyphens/dots/underscores count as name-part separators too, since usernames commonly use them
// in place of a space; single-word names fall back to the first two characters.
export function getInitials(name: string): string {
  // Stryker disable all: equivalent mutants. \s is already a separator, so any leading/trailing
  // whitespace .trim() would remove instead splits off as an empty token that .filter(Boolean)
  // below removes just the same - dropping .trim(), or the split regex's "+" (single separators
  // instead of runs), changes the token boundaries but not which non-empty tokens come out the
  // other side of that filter.
  const parts = name
    .trim()
    .split(/[\s\-_.]+/)
    .filter(Boolean)
  // Stryker restore all
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
