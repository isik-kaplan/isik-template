// Generated from packages/api/src/schema.ts by scripts/generate-query-grammar.mjs; a test fails until they match.

/** What a resource may be narrowed by, and the values a field accepts where it names a few. */
export type QueryField = { values?: readonly string[] }

export const QUERY_GRAMMAR: Readonly<Record<string, Readonly<Record<string, QueryField>>>> = {
  users: {
    is_active: {},
    is_staff: {},
    is_superuser: {},
  },
  applications: {},
  applicationReviews: {
    approval: { values: ['approved', 'disabled', 'pending', 'withdrawn'] },
  },
  notifications: {
    unread: {},
  },
{%- if cookiecutter.webhooks != "none" %}
  webhooks: {},
{%- endif %}
}
