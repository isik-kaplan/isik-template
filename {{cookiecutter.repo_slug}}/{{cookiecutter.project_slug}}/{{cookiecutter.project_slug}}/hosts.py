from django_hosts import host, patterns


host_patterns = patterns(
    "",
    host(r"api", "{{ cookiecutter.project_slug }}.urls.api", name="api"),
    host(r"admin", "{{ cookiecutter.project_slug }}.urls.admin", name="admin"),
    host(r"auth", "{{ cookiecutter.project_slug }}.urls.auth", name="auth"),
)
