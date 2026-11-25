#!/bin/sh
# Builds the mobile app for the flows: release JavaScript, pointed at the e2e stack's plain-http origins.
# Usage: e2e/maestro/build.sh android|ios   (from the repo root; prints the path of what it built)
set -eu
platform=${1:?android or ios}
domain={{ cookiecutter.domain }}
cd "$(dirname "$0")/../../{{ cookiecutter.project_slug }}-frontend/apps/mobile"
export EXPO_PUBLIC_API_ORIGIN="http://api.$domain" EXPO_PUBLIC_AUTH_ORIGIN="http://auth.$domain"
npx expo prebuild --platform "$platform" --clean --no-install >&2
if [ "$platform" = android ]; then
  # Release, signed with the debug key prebuild sets up: nothing here is ever published.
  (cd android && ./gradlew assembleRelease --no-daemon >&2)
  echo "$PWD/android/app/build/outputs/apk/release/app-release.apk"
else
  (cd ios && pod install >&2)
  scheme=$(basename ios/*.xcworkspace .xcworkspace)
  (cd ios && xcodebuild -workspace "$scheme.xcworkspace" -scheme "$scheme" -configuration Release \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build >&2)
  echo "$PWD/ios/build/Build/Products/Release-iphonesimulator/$scheme.app"
fi
