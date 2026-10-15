# Etapa 15 — Matriz de validación Android y salida a campo

**PR de referencia:** [#9](https://github.com/Andri-Almengor/dms-boletas-mantenimientos/pull/9) (etapas 12–15; etapa 11 en main). **Fecha:** 15 de octubre de 2026. **Zona horaria operativa:** America/Costa_Rica.

## Qué puede probar CI y qué no

| Comprobación | Medio | Criterio |
|---|---|---|
| Regresiones de TypeScript/SQLite/dominios | `Mobile CI` | Todas verdes |
| APK contiene bundle sin necesitar Metro | `verify-android-apk.sh` | `assets/index.android.bundle` disponible |
| Identidad, firma y versión | `aapt` + `apksigner` | paquete original, versionCode de app.json, firma válida |
| Arranque Android sin Metro/con red y offline | Emulador API 35 | instala, inicia, mantiene proceso, captura evidencia de pantalla |
| Captura y restauración tras cierre inesperado | **Android físico** | sin pérdida ni duplicación |
| Flujo completo con técnicos, usuarios y permisos reales | **Entorno de pruebas** | respeta backend y permisos actuales |
| Sincronización real, Drive y evidencias grandes | **Entorno de pruebas** | coincide con web, sin duplicados |
| Actualización in situ preservando datos | **2 APK EAS preview con la misma firma** | SQLite, sesión, archivos y outbox intactos |

**No atribuir estado APROBADO a pruebas manuales sin dispositivo, fecha, versión, resultado y evidencia.** Cada fila de abajo está inicialmente *PENDIENTE*. No usar una cuenta productiva para simular conflictos o borrar archivos.

## Instalación y huella de compilación

1. Abrir GitHub → Actions → **Android APK** → ejecución del commit final → **Artifacts**.
2. Descargar `dms-mantenimientos-android-standalone`; extraer `app-release.apk` y `android-apk.sha256`.
3. Confirmar el SHA-256 publicado por el verificador (comparar hash del archivo antes de instalar).
4. Instalar en un Android de pruebas sin instalación incompatible; el binario de GitHub CI está firmado con clave **de desarrollo**, no con las credenciales de distribución EAS.
5. Iniciar sin Metro ni PC conectada; anotar Android API, modelo, memoria disponible y versión instalada.
6. Para una APK actualizable entre versiones, utilizar `npm run build:apk` con el perfil EAS `preview` y **la misma cuenta/clave de firma** entre versiones. Nunca subir keystores ni `EXPO_TOKEN` al repositorio.

## Casos de prueba de campo

Rellenar `Ejecución` con **APROBADO / FALLÓ / NO APLICA**, fecha CR, identidad del entorno (sin tokens), modelo Android y vínculo de evidencia sin datos personales.

| ID | Escenario y datos | Resultado esperado | Ejecución |
|---|---|---|---|
| F01 | APK nueva sin Metro, modo avión | abre sin cierre inesperado; informa falta de sesión/red | PENDIENTE |
| F02 | Login autorizado; descargar un MANTENIMIENTO y un PROYECTO | solo registros visibles por el usuario; SQLite poblado | PENDIENTE |
| F03 | Rol Técnico; editar/agregar dispositivo, foto, nota, según permiso | UI y backend preservan capacidades existentes | PENDIENTE |
| F04 | Abrir MANTENIMIENTO con 2 tipos, 20–50 dispositivos y evidencias | cantidades esperadas/registradas y ANTES/DESPUÉS iguales a web | PENDIENTE |
| F05 | Agregar 100 dispositivos en lista de un mismo tipo, misma ubicación, sin red | 100 nombres correctos, outbox sin duplicados y detalles pendientes | PENDIENTE |
| F06 | PROYECTO con puertas y 2 lectores/magneto; editar preguntas hijas | componentes, IDs locales, serie, MAC y respuestas persisten | PENDIENTE |
| F07 | Checklist Proyecto: Pendiente con nota; reiniciar app sin red | valor, nota y porcentaje siguen presentes | PENDIENTE |
| F08 | Nuevo dispositivo: tomar 3 fotos con cámara y un vídeo | miniaturas/datos guardados y destino correcto sin Internet | PENDIENTE |
| F09 | Sin guardar F08: salir del formulario, cerrar/reabrir aplicación, volver | se recupera borrador del mantenimiento, sin pérdida de archivos | PENDIENTE |
| F10 | Interrumpir la Activity de Android al salir de cámara | `getPendingResultAsync` recupera sin agregar la misma foto dos veces | PENDIENTE |
| F11 | Eliminar una foto de borrador, volver a entrar | no reaparece; restantes siguen intactas | PENDIENTE |
| F12 | Guardar dispositivo con fotos después de F09 | dispositivo + evidencias/outbox en una transacción; manifiesto consumido | PENDIENTE |
| F13 | Crear fotos ANTES múltiples y una DESPUÉS en otro dispositivo | pendiente DESPUÉS cuenta por dispositivo, no por foto | PENDIENTE |
| F14 | Con 5–30 fotos, un vídeo grande y conectividad intermitente | reintentos controlados, no hay subidas duplicadas ni borrados | PENDIENTE |
| F15 | Borrar evidencia sincronizada desde móvil con permiso autorizado | eliminación local + posterior remoto, solo evidencia elegida | PENDIENTE |
| F16 | Borrar dispositivo local con operaciones relacionadas pendientes | outbox dependiente consistente, sin evidencia huérfana visible | PENDIENTE |
| F17 | Editar mismo campo offline en móvil y web (ambiente de pruebas) | conflicto visible; sin sobrescritura silenciosa | PENDIENTE |
| F18 | Falta física de un archivo de evidencia pendiente | error `LOCAL_FILE_MISSING`/bloqueo reportado sin reintentos infinitos | PENDIENTE |
| F19 | Sincronización automática a 06:59, 07:00, 16:59, 17:00 hora CR | ninguna red automática fuera de 07:00–17:00; conserva pendientes | PENDIENTE |
| F20 | Pulsar **Sincronizar ahora** a las 18:00 | permite sincronización manual completa | PENDIENTE |
| F21 | App en background durante sincronización | una sola instancia posee lease SQLite, sin `database is locked` permanente | PENDIENTE |
| F22 | Cambiar de cuenta y reabrir mantenimiento con borrador anterior | otra cuenta no ve datos ni fotos fuera de su `scope_key` | PENDIENTE |
| F23 | EAS preview A→B con igual firma, offline con fotos pendientes | actualización sin desinstalar; datos, fotos, outbox y sesión persisten | PENDIENTE |
| F24 | APK Android sin acciones de firma/finalización/crear mantenimiento | web permanece fuente de esas operaciones; permisos backend intactos | PENDIENTE |
| F25 | 50 dispositivos con más de 50 fotos, scroll, tablet y teléfono | carga fluida, sin N+1 en backend ni crash por memoria | PENDIENTE |

## Diagnóstico sin secretos

Para reproducir un fallo, registrar código Fxx, pasos exactos, si había modo avión, conexión real o permiso denegado, acción visible, hora `America/Costa_Rica`, estado de sincronización y versión instalada. En un equipo de pruebas puede usarse:

```bash
adb devices
adb shell dumpsys package com.solutionsdms.dmsmantenimientos
adb logcat -c
# Reproducir el fallo en un ambiente de pruebas
adb logcat -d -t 400 > android-fallo.txt
```

**Antes de compartir `android-fallo.txt`:** eliminar tokens, correos personales, nombres de clientes, URLs de Drive privadas y cualquier evidencia sensible. Reportar si falló SQLite, API, Drive, foto, firma (solo web), sincronización, sesión o red. No registrar valores de `DATABASE_URL` ni credenciales.

## Criterios de salida

**No distribuir como estable** si falla cualquiera de F01–F03, F06–F12, F14, F17–F20, F22–F24, o existen pérdidas de fotos, permisos alterados, doble sincronización, fallos SQLite persistentes o diferencias de backend.

CI aprobado + emulador aprobado → APK apta **solo para pruebas técnicas**. Para salida de campo a usuarios operativos se requiere ejecutar y documentar la matriz manual en Android, y distribuir una APK EAS preview firmada consistentemente.

Sin cambios a Render, Apps Script, PostgreSQL, funciones web-only, permisos y política 07:00–17:00.
