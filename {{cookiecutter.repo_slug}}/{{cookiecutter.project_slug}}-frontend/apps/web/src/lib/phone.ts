// allauth's phone field takes E.164 and nothing else: a + and up to 15 digits, no spaces.
export const E164 = /^\+[1-9]\d{1,14}$/

// Where a signup, or a login by an unverified number, answers the code allauth texted.
export const VERIFY_PHONE_PATH = '/auth/verify-phone'
