from types import SimpleNamespace

import pytest
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount, SocialLogin
from django.apps import apps as django_apps
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.auth.signals import user_logged_out
from django.contrib.contenttypes.models import ContentType
from django.contrib.sessions.backends.db import SessionStore
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.test import RequestFactory
from hypothesis import given
from hypothesis import strategies as st

from apps.users import headless_urls
from apps.users.adapters.social_account import SocialAccountAdapter
from apps.users.backends import PermissionsBackend
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.names import NameRequirement
from apps.users.permissions import VOCABULARY
from apps.users.reauthentication.views.provider_token import ProviderTokenView
from conftest import versioned


EMAILS = st.text(alphabet="abcdefghij", min_size=1, max_size=10).map(lambda local: f"{local}@example.test")
NAMES = sorted(VOCABULARY.by_name)


@pytest.mark.django_db
@pytest.mark.parametrize("terms_version", ["", "terms-v1"])
@given(email=EMAILS, uid=st.text(alphabet="0123456789", min_size=1, max_size=8))
def test_a_social_signup_is_saved_with_no_password_and_the_terms_of_the_day(monkeypatch, terms_version, email, uid):
    monkeypatch.setattr("apps.users.adapters.account.TERMS_VERSION", terms_version)
    with transaction.atomic():
        request = RequestFactory().get("/")
        request.session = SessionStore()
        adapter = SocialAccountAdapter()
        sociallogin = SocialLogin(user=User(), account=SocialAccount(provider="github", uid=uid))
        user = adapter.populate_user(request, sociallogin, {"email": email})
        # The pending signup stores this unsaved user, so the timestamps have to be real values already.
        assert user.created_at is not None

        adapter.save_user(request, sociallogin)

        saved = User.objects.get(email=email)
        assert not saved.has_usable_password()
        assert saved.terms_version == terms_version
        assert (saved.terms_accepted_at is not None) == bool(terms_version)
        assert SocialAccount.objects.get(user=saved).uid == uid
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(first=st.text(alphabet="abcdefgh ", max_size=12), last=st.text(alphabet="abcdefgh", max_size=12))
def test_a_person_changes_their_own_name_through_me_and_reads_it_back(monkeypatch, client, first, last):
    # Whatever this project's requirement, one where both names are optional takes any of them.
    monkeypatch.setattr(
        NameRequirement, "current", classmethod(lambda cls: NameRequirement.USERNAME_WITH_OPTIONAL_FULL)
    )
    with transaction.atomic():
        person = User.objects.create_user(email="ada@example.test", username="ada")
        EmailAddress.objects.create(user=person, email=person.email, verified=True, primary=True)
        client.force_login(person)

        response = client.patch(
            "/v0/users/me/",
            {"first_name": first, "last_name": last},
            content_type="application/json",
            headers=versioned(person),
        )

        assert response.status_code == 200, response.content
        person.refresh_from_db()
        assert (person.first_name, person.last_name) == (first.strip(), last.strip())
        assert client.get("/v0/users/me/").json()["first_name"] == person.first_name
        transaction.set_rollback(True)


@given(times=st.integers(min_value=1, max_value=3))
def test_the_app_refuses_to_start_twice_rather_than_suppress_nothing(times):
    config = django_apps.get_app_config("users")
    for _ in range(times):
        with pytest.raises(ImproperlyConfigured, match="create_permissions"):
            config.ready()


@pytest.mark.parametrize("serve_specification", [False, True])
@given(extra=st.integers(min_value=0, max_value=2))
def test_the_headless_routes_mount_only_allauths_one_version(monkeypatch, serve_specification, extra):
    monkeypatch.setattr(headless_urls.app_settings, "SERVE_SPECIFICATION", serve_specification, raising=False)
    built = headless_urls.build_urlpatterns
    monkeypatch.setattr(headless_urls, "build_urlpatterns", lambda client: built(client) + built(client)[:1] * extra)

    if extra:
        with pytest.raises(ImproperlyConfigured, match="no longer one"):
            headless_urls.headless_urlpatterns()
    else:
        names = [str(pattern.pattern) for pattern in headless_urls.headless_urlpatterns()]
        assert ("" in names) == serve_specification
        assert all(name.endswith("/") for name in names if name)


@pytest.mark.parametrize(("process", "is_an_act"), [("connect", True), ("login", False)])
@given(method=st.sampled_from(["POST", "GET", "DELETE"]))
def test_a_provider_token_is_an_act_only_when_posted_to_connect(process, is_an_act, method):
    view = ProviderTokenView()
    view.request = RequestFactory().generic(method, "/")
    view.input = SimpleNamespace(cleaned_data={"process": process})

    assert view.is_an_act() is (is_an_act and method == "POST")


@pytest.mark.django_db
@given(held=st.sets(st.sampled_from(NAMES), max_size=4), module=st.sampled_from(["users", "oauth", "nothing"]))
def test_what_somebody_was_granted_reads_the_same_twice_and_shows_in_their_modules(held, module):
    with transaction.atomic():
        person = User.objects.create_user(email="ada@example.test")
        sentinel = ContentType.objects.get_for_model(PermissionRow)
        person.user_permissions.set(PermissionRow.objects.filter(content_type=sentinel, codename__in=held))
        person = User.objects.get(pk=person.pk)
        backend = PermissionsBackend()

        first = backend.get_user_permissions(person)
        assert first == set(held)
        assert backend.get_user_permissions(person) == first
        holds = VOCABULARY.closure(held)
        assert person.has_module_perms(module) == any(name.split(":")[0] == module for name in holds)
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(username=st.one_of(st.none(), st.just("ada")))
def test_an_account_without_an_address_is_never_made(username):
    with pytest.raises(ValueError, match="email"):
        User.objects.create_user(email="", username=username)


@given(policy=st.sampled_from(SiteSettings.LoginPolicy))
def test_the_settings_read_as_their_name_whatever_they_hold(policy):
    assert str(SiteSettings(login_policy=policy)) == "site settings"


@given(name=st.sampled_from(NAMES))
def test_a_declaration_shows_its_name(name):
    assert repr(VOCABULARY.by_name[name]) == f"<Declaration {name!r}>"


@given(sent_with=st.sampled_from([None, RequestFactory().get("/")]))
def test_a_sign_out_of_an_expired_session_names_nobody(logged, sent_with):
    logged.clear()

    user_logged_out.send(sender=User, request=sent_with, user=None)

    assert [line for line in logged if line["event"] == "logout.succeeded"] == []


@given(credentials=st.dictionaries(st.sampled_from(["username", "email", "password"]), st.text(max_size=12)))
def test_the_permission_backend_signs_nobody_in_whatever_it_is_handed(credentials):
    assert PermissionsBackend().authenticate(None, **credentials) is None
