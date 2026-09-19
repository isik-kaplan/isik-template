import type { Api } from '@{{ cookiecutter.repo_slug }}/api'
import type { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

export {}

declare global {
  interface Window {
    {{ cookiecutter.project_slug }}: { api: Api; auth: AuthApi; debug: (flag: boolean) => void }
  }
}
