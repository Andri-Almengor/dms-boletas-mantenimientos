#!/usr/bin/env bash
set -euo pipefail
APK="${1:?Se requiere la ruta a app-release.apk}"
PACKAGE="com.solutionsdms.dmsmantenimientos"
REPORT="${GITHUB_WORKSPACE:-.}/android-smoke"
mkdir -p "$REPORT"

dump_on_error() {
  echo "Falló la prueba Android; registrando estado nativo sin datos de usuario."
  adb shell dumpsys activity activities > "$REPORT/activity.txt" 2>&1 || :
  adb logcat -d -t 300 > "$REPORT/logcat.txt" 2>&1 || :
  adb exec-out screencap -p > "$REPORT/screen.png" 2>/dev/null || :
}
trap dump_on_error ERR

test -s "$APK"
adb wait-for-device
adb install -r "$APK"
# Prueba solo la pantalla de inicio, sin usar credenciales operativas.
adb shell am force-stop "$PACKAGE" || :
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1
sleep 12
if ! adb shell pidof "$PACKAGE" | grep -Eq '[0-9]'; then
  echo "La aplicación terminó inesperadamente en el primer arranque."
  exit 1
fi

# También debe abrir sin red: el primer render no puede depender de Metro.
adb shell am force-stop "$PACKAGE"
adb shell svc wifi disable || :
adb shell svc data disable || :
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1
sleep 12
if ! adb shell pidof "$PACKAGE" | grep -Eq '[0-9]'; then
  echo "La aplicación terminó inesperadamente durante el arranque offline."
  exit 1
fi
adb exec-out screencap -p > "$REPORT/screen-offline.png"
printf 'APK instala y abre con/sin red (sin login y sin Metro).\n' > "$REPORT/result.txt"
echo "Smoke Android completo; ver $REPORT"
