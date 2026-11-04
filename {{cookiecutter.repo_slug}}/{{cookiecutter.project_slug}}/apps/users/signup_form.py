from django import forms
from django.utils.translation import gettext_lazy as _

from apps.users.names import NAMES, NameRequirement


class SignupNames(forms.Form):
    """allauth's signup forms, password and social alike, extend this.

    Every field is optional here, so the API schema is the same under every NameRequirement; `clean()`
    applies the one this project was generated with.
    """

    first_name = forms.CharField(label=_("First name"), max_length=150, required=False)
    last_name = forms.CharField(label=_("Last name"), max_length=150, required=False)

    def clean(self):
        cleaned_data = super().clean()
        given = {name: cleaned_data.get(name) for name in NAMES if name not in self.errors}
        for name, (message, code) in NameRequirement.current().refusals(given).items():
            self.add_error(name, forms.ValidationError(message, code=code))
        return cleaned_data

    def signup(self, request, user):
        """allauth's adapter already saved the names off cleaned_data."""
