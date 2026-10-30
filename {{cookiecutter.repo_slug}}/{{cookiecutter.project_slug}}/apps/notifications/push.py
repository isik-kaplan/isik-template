"""The push services' credentials, from the environment. A service is on once any of its own keys is set, so a
half-configured one is refused at startup (isik.E014) rather than quietly sending nothing."""


def push_credentials(*, apns_team_id, apns_key_id, apns_key, apns_topic, fcm_credentials):
    credentials = {}
    if apns_team_id or apns_key_id or apns_key:
        credentials["APNS"] = {
            "TEAM_ID": apns_team_id,
            "KEY_ID": apns_key_id,
            # A .p8 key is PEM: a literal \n stands for a line break, as the OAuth signing key's does.
            "KEY": apns_key.replace("\\n", "\n"),
            "TOPIC": apns_topic,
        }
    if fcm_credentials:
        credentials["FCM"] = {"CREDENTIALS": fcm_credentials}
    return credentials
