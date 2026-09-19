import type { MetadataRoute } from 'next'

// A plain route handler, not a rendered page - unaffected by getSession()/the backend being
// reachable, which is why the frontend's Docker healthcheck hits this instead of "/".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '{{ cookiecutter.project_name }}',
    short_name: '{{ cookiecutter.project_name }}',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [],
  }
}
