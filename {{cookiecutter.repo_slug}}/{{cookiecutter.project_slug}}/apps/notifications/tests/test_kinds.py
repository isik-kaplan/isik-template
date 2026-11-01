"""What the database tells each owner, a token made or revoked, an application approved or withdrawn; and what
it tells the reviewers."""

import pytest
from django.core import mail
from isik.django.apps.notifications.kinds import kinds, rendered, text_of
from oauth2_provider.models import get_application_model

from apps.notifications.models import InboxItem, Notice, NoticeKindPolicy
from apps.oauth_provider.services import approve_application, disable_application, withdraw_application
from apps.users.models import PersonalAccessToken
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token
from conftest import deliver_waiting_notices


Application = get_application_model()


@pytest.mark.django_db
def test_every_declared_kind_has_its_row():
    assert set(NoticeKindPolicy.objects.values_list("name", flat=True)) == set(kinds())


@pytest.mark.django_db
def test_a_new_token_is_told_to_its_owner_in_the_inbox_and_by_mail(alice):
    make_token(user=alice, scopes=[], name="Bob's CI & <deploy>")

    deliver_waiting_notices()

    (item,) = InboxItem.objects.filter(user=alice)
    assert (item.kind.name, item.payload["data"]["name"]) == ("token_created", "Bob's CI & <deploy>")
    (sent,) = mail.outbox
    assert (sent.to, sent.subject) == ([alice.email], "A personal access token was created")
    assert 'named "Bob\'s CI & <deploy>"' in sent.body


@pytest.mark.django_db
def test_a_revoked_token_is_told_by_what_it_was_since_its_row_is_gone(alice):
    token = make_token(user=alice, scopes=[], name="CI")
    token.delete()

    notice = Notice.objects.get(kind__name="token_revoked")

    assert notice.snapshot == {"user": str(alice.pk), "name": "CI"}
    assert not PersonalAccessToken.objects.exists()


@pytest.fixture
def application(alice):
    return Application.objects.create(
        user=alice, name="Notes", client_type="confidential", authorization_grant_type="authorization-code"
    )


@pytest.mark.django_db
def test_an_owner_hears_their_application_was_approved_and_then_withdrawn(application):
    approve_application(application, [])
    withdraw_application(application)

    notices = Notice.objects.filter(kind__name="application_reviewed").order_by("occurred_at")

    assert [(notice.variant, notice.snapshot["user"]) for notice in notices] == [
        ("approved", str(application.user_id)),
        ("withdrawn", str(application.user_id)),
    ]


@pytest.mark.django_db
def test_an_edit_that_leaves_the_approval_alone_tells_nobody(application):
    Application.objects.filter(pk=application.pk).update(name="Notes 2")

    assert not Notice.objects.filter(kind__name="application_reviewed").exists()


@pytest.fixture
def reviewer(db):
    return User.objects.create_superuser(username="root", email="root@example.test", password="x")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("take_down", "variant", "said"),
    [
        (withdraw_application, "withdrawn", 'The application "Notes" was withdrawn.'),
        (disable_application, "disabled", 'The application "Notes" was switched off by whoever registered it.'),
    ],
)
def test_the_reviewers_hear_an_application_was_taken_down(application, reviewer, take_down, variant, said):
    User.objects.create_superuser(username="gone", email="gone@example.test", password="x", is_active=False)
    approve_application(application, [])
    take_down(application)

    deliver_waiting_notices()

    (item,) = InboxItem.objects.filter(kind__name="application_taken_down")
    assert (item.user, item.variant) == (reviewer, variant)
    assert rendered(text_of(item.kind.name).message, item.payload["data"], item.variant) == said
    assert reviewer.email in {address for sent in mail.outbox for address in sent.to}


@pytest.mark.django_db
def test_approving_tells_the_reviewers_nothing(application, reviewer):
    approve_application(application, [])

    assert not Notice.objects.filter(kind__name="application_taken_down").exists()
