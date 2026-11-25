from django_hosts import host, patterns


host_patterns = patterns(
    "",
    host(r"api", "{{ cookiecutter.project_slug }}.urls.api", name="api"),
    host(r"auth", "{{ cookiecutter.project_slug }}.urls.auth", name="auth"),
)
