import pytest
from django.conf import settings


@pytest.mark.django_db
def test_session_endpoint_reports_anonymous(client):
    response = client.get("/v0/browser/v1/auth/session", HTTP_HOST=f"auth.{settings.PARENT_HOST}")
    assert response.status_code == 401
    assert response.json()["meta"]["is_authenticated"] is False


@pytest.mark.django_db
def test_signup_via_headless_api_leaves_email_verification_pending(client):
    host = f"auth.{settings.PARENT_HOST}"
    # Primes the csrftoken cookie, same as the frontend's own client does on a first visit.
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)
    response = client.post(
        "/v0/browser/v1/auth/signup",
        data={"username": "newuser", "email": "newuser@example.test", "password": "correct-horse-battery-staple"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    # Mandatory email verification means signup succeeds but the session isn't authenticated yet -
    # allauth reports this as a 401 with a pending verify_email flow, not a 2xx.
    assert response.status_code == 401
    flows = {flow["id"]: flow for flow in response.json()["data"]["flows"]}
    assert flows["verify_email"]["is_pending"] is True
