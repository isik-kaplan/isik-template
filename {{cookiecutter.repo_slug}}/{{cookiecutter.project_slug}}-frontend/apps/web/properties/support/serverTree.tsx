import { Children, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

// Next resolves a Server Component nested inside a route's tree before any of it reaches a browser;
// testing-library resolves only the one it was handed. Awaiting them here makes a rendered route the
// page a visitor gets rather than its top level.
export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<{ children?: ReactNode }>
  if (typeof element.type === 'function' && element.type.constructor.name === 'AsyncFunction') {
    const grown = await (element.type as (props: unknown) => Promise<ReactNode>)(element.props)
    return resolveServerTree(grown)
  }
  const { children } = element.props
  if (children === undefined) return element
  const resolved = await Promise.all(Children.toArray(children).map(resolveServerTree))
  return cloneElement(element, undefined, ...resolved)
}
