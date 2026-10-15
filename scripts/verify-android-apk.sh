#!/usr/bin/env bash
set -euo pipefail

# Reusable in CI and on a local machine after Expo prebuild + assembleRelease.
APK="${1:-android/app/build/outputs/apk/release/app-release.apk}"
PACKAGE="com.solutionsdms.dmsmantenimientos"
EXPECTED_VERSION="$(node -p "require('./app.json').expo.android.versionCode")"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

if [[ ! -s "$APK" ]]; then
  echo "::error::Falta la APK de prueba en $APK" >&2
  exit 1
fi
if [[ -z "$ANDROID_SDK" || ! -d "$ANDROID_SDK/build-tools" ]]; then
  echo "::error::Se requiere ANDROID_HOME o ANDROID_SDK_ROOT con build-tools instalados." >&2
  exit 1
fi
TOOLS="$(find "$ANDROID_SDK/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
test -x "$TOOLS/aapt"
test -x "$TOOLS/apksigner"

# Una APK debug puede instalarse, pero sin este bundle necesitará Metro.
contents="$(mktemp)"
trap 'rm -f "$contents"' EXIT
unzip -Z1 "$APK" > "$contents"
if ! grep -Eq '^assets/index[.]android[.]bundle([.]hbc)?$' "$contents"; then
  echo "::error::La APK no contiene un bundle JavaScript/Hermes autónomo." >&2
  exit 1
fi

metadata="$("$TOOLS/aapt" dump badging "$APK")"
if ! grep -Fq "package: name='$PACKAGE'" <<< "$metadata"; then
  echo "::error::El identificador de paquete no corresponde a DMS Mantenimientos." >&2
  exit 1
fi
if ! grep -Fq "versionCode='$EXPECTED_VERSION'" <<< "$metadata"; then
  echo "::error::El versionCode del APK no coincide con app.json." >&2
  exit 1
fi
"$TOOLS/apksigner" verify --verbose "$APK"

# SHA256 sólo sobre el binario, no sobre claves ni archivos privados.
hash="$(sha256sum "$APK" | cut -d ' ' -f1)"
printf '%s  %s\n' "$hash" "$(basename "$APK")" > android-apk.sha256
echo "Paquete: $PACKAGE | versión Android: $EXPECTED_VERSION"
echo "SHA256: $hash"
echo "Bundle incluido: sí | firma Android: válida"
