from isik.django.apps.common.email import mjml_template as _mjml_template
from isik.django.apps.common.email import text_template as _text_template


def _global_context(request):
    """site_url reflects wherever the request actually came in on (api./auth. subdomain and all),
    not a hardcoded scheme+domain - matches how HEADLESS_FRONTEND_URLS is already built."""
    return {"site_name": "{{ cookiecutter.project_name }}", "site_url": request.get_host() if request else ""}


def mjml_template(template, context, request=None):
    return _mjml_template(template, {**_global_context(request), **context}, request)


def text_template(template, context, request=None):
    return _text_template(template, {**_global_context(request), **context}, request)
