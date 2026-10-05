#!/usr/bin/env node
// Fails unless every path and method src/schema.ts declares is one the auth document (argv[2], from
// `manage.py openapi_document auth`) still serves. This client is written by hand rather than
// generated, so there is no output to diff - what can drift is allauth underneath it, through an
// upgrade or a settings change that stops mounting an endpoint the frontend still calls.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const SCHEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/schema.ts')

function nameOf(member) {
  return member.name && (ts.isStringLiteral(member.name) || ts.isIdentifier(member.name)) ? member.name.text : null
}

function declaredOperations(source) {
  const file = ts.createSourceFile(SCHEMA, source, ts.ScriptTarget.Latest)
  const paths = file.statements.find((node) => ts.isInterfaceDeclaration(node) && node.name.text === 'paths')
  if (!paths) throw new Error(`${SCHEMA} declares no \`paths\` interface.`)
  return paths.members.flatMap((route) =>
    ts.isTypeLiteralNode(route.type) ? route.type.members.map((method) => [nameOf(route), nameOf(method)]) : []
  )
}

const document = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const declared = declaredOperations(readFileSync(SCHEMA, 'utf8'))
const missing = declared.filter(([route, method]) => !document.paths[route]?.[method])

// An empty walk would pass over anything, so a schema.ts the parser no longer understands fails too.
if (declared.length === 0) {
  console.error(`openapi-check: found no operations in ${SCHEMA}, so nothing was checked.`)
  process.exitCode = 1
}
for (const [route, method] of missing) {
  console.error(`openapi-check: auth-api declares ${method.toUpperCase()} ${route}, which allauth no longer serves.`)
}
if (missing.length) {
  console.error('               Update src/schema.ts and its callers to what the auth document now says.')
  process.exitCode = 1
}
