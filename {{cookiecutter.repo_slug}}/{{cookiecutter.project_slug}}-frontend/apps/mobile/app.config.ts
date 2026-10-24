import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: '{{ cookiecutter.project_name }}',
  slug: '{{ cookiecutter.project_slug }}',
  scheme: '{{ cookiecutter.project_slug }}',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    // Reverse-DNS: {{ cookiecutter.domain }} becomes {{ cookiecutter.domain.split('.') | reverse | join('.') }}.
    bundleIdentifier: '{{ cookiecutter.domain.split(".") | reverse | join(".") }}.mobile',
    supportsTablet: true,
  },
  android: {
    package: '{{ cookiecutter.domain.split(".") | reverse | join(".") }}.mobile',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    // iOS needs iosUrlScheme (from a real Google iOS client ID) added once credentials exist.
    '@react-native-google-signin/google-signin',
  ],
}

export default config
