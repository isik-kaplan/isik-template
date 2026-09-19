export { Api } from './client'
export type { ApiOptions } from './client'
export type { components, paths } from './schema'
export type { ApiQuery, ApiResponse, ApiType, Includes } from './typeHelpers'
export { includesType, includesTypeArray } from './typeHelpers'
// This backend is DRF, not allauth (see @{{ cookiecutter.repo_slug }}/auth-api's own errors.ts
// for that shape) - @isikk/core/drf reads DRF's two refusal shapes directly, so there is nothing
// of our own to add here.
export { detailOf, messagesOf, toFormErrors } from '@isikk/core/drf'
export type { FormErrors } from '@isikk/core/drf'
