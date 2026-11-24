from django.conf import settings
from isik.django.apps.common.email import mjml_template as _mjml_template
from isik.django.apps.common.email import text_template as _text_template


def _global_context():
    """The stored domain, never the request's host: a mail goes to someone who never made that request."""
    return {"site_name": settings.PROJECT_NAME, "site_url": settings.PARENT_HOST}


def notice_email_context(delivery, notice):
    """isik renders notice mails itself, so they get the site's name and domain through this hook."""
    return _global_context()


def mjml_template(template, context, request=None):
    return _mjml_template(template, {**_global_context(), **context}, request)


def text_template(template, context, request=None):
    return _text_template(template, {**_global_context(), **context}, request)
