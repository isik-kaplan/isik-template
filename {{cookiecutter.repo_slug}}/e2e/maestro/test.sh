#!/bin/sh
# Installs a build from build.sh on the running emulator or booted simulator, and runs every flow against the stack.
# Usage: e2e/maestro/test.sh <built app or apk>   (from the repo root)
# DEVICE picks the emulator or simulator when more than one is running.
set -eu
app=${1:?the .apk or .app build.sh printed}
here=$(dirname "$0")
# The seeded superuser the login flow signs in as, from the same .env the stack read.
env_file="$here/../../.env"
value() { sed -n "s/^{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__$1=//p" "$env_file"; }
device=${DEVICE:-booted}
case "$app" in
  *.apk) adb ${DEVICE:+-s "$DEVICE"} install -r "$app" ;;
  *.app)
    xcrun simctl install "$device" "$app"
    # Otherwise iOS offers to save each password over the next screen, where the flows can't reach the offer.
    xcrun simctl spawn "$device" defaults write com.apple.WebUI AutoFillPasswords -bool NO
    # A fresh simulator introduces its keyboard on first use, and the introduction swallows what is typed.
    xcrun simctl spawn "$device" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool YES
    xcrun simctl spawn "$device" defaults write com.apple.keyboard.preferences DidShowGestureKeyboardIntroduction -bool YES
    ;;
esac
maestro ${DEVICE:+--device "$DEVICE"} test "$here" \
  -e SUPERUSER_EMAIL="$(value EMAIL)" \
  -e SUPERUSER_PASSWORD="$(value PASSWORD)" \
  -e AUTH_HOST=auth.{{ cookiecutter.domain }} \
  -e MAILPIT="${MAILPIT:-http://127.0.0.1:8025}" \
{%- if cookiecutter.phone == "required" %}
  -e SMS="${SMS:-http://127.0.0.1:8026}" \
{%- endif %}
  --format junit --output "$here/report.xml"
