import type { MetadataRoute } from 'next'

// Independent of the backend, which is why the Docker healthcheck hits this instead of "/".
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
