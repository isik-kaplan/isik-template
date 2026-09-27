import type { ExpoConfig } from 'expo/config'

// A plain object, not app.json: this project's identifiers are derived from the cookiecutter
// answers, which app.json's static JSON can't express.
const config: ExpoConfig = {
  name: '{{ cookiecutter.project_name }}',
  slug: '{{ cookiecutter.project_slug }}',
  scheme: '{{ cookiecutter.project_slug }}',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    // Reverse-DNS of the project's own domain, same convention a real bundle ID follows -
    // {{ cookiecutter.domain }} becomes {{ cookiecutter.domain.split('.') | reverse | join('.') }}.
    bundleIdentifier: '{{ cookiecutter.domain.split(".") | reverse | join(".") }}.mobile',
    supportsTablet: true,
  },
  android: {
    package: '{{ cookiecutter.domain.split(".") | reverse | join(".") }}.mobile',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Adds the Sign in with Apple entitlement automatically - no options of its own.
    'expo-apple-authentication',
    // No iosUrlScheme configured here on purpose: it's the reversed form of a real Google OAuth
    // iOS client ID, a per-project credential this template has no value for (see the README's
    // social login section). Google sign-in on Android needs no extra config; iOS needs this
    // added once real credentials exist.
    '@react-native-google-signin/google-signin',
  ],
}

export default config
