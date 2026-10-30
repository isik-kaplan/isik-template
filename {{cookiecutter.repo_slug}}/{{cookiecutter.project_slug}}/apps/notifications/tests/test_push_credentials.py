from apps.notifications.push import push_credentials


NONE = {
    "apns_team_id": "",
    "apns_key_id": "",
    "apns_key": "",
    "apns_topic": "com.example.mobile",
    "fcm_credentials": "",
}


def test_push_is_off_until_a_service_has_credentials():
    assert push_credentials(**NONE) == {}


def test_apns_takes_its_key_with_its_line_breaks():
    apns = {"apns_team_id": "TEAM", "apns_key_id": "KEY", "apns_key": "-----BEGIN-----\\nabc\\n-----END-----"}

    assert push_credentials(**{**NONE, **apns}) == {
        "APNS": {
            "TEAM_ID": "TEAM",
            "KEY_ID": "KEY",
            "KEY": "-----BEGIN-----\nabc\n-----END-----",
            "TOPIC": "com.example.mobile",
        }
    }


def test_any_one_apns_key_turns_apns_on_so_a_missing_one_is_refused_at_startup():
    for key in ("apns_team_id", "apns_key_id", "apns_key"):
        assert push_credentials(**{**NONE, key: "set"})["APNS"][key.removeprefix("apns_").upper()] == "set"


def test_fcm_takes_the_service_account_as_given():
    assert push_credentials(**{**NONE, "fcm_credentials": '{"project_id": "p"}'}) == {
        "FCM": {"CREDENTIALS": '{"project_id": "p"}'}
    }
