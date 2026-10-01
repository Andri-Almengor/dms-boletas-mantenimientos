# DMS Boletas — Mantenimientos móvil

Aplicación móvil local-first para complementar **DMS Boletas** en Android/iOS, orientada al trabajo de mantenimientos con operación completa sobre SQLite y sincronización posterior contra el backend existente.

> Este repositorio no reemplaza la aplicación web. Comparte autenticación, permisos, reglas de negocio, PostgreSQL, Drive y el protocolo de sincronización de DMS Boletas.

## Estado

### Etapa 1 — Fundación móvil ✅

Incluye:

- Expo SDK 57 + React Native 0.86.
- Expo Router + TypeScript estricto.
- SQLite inicial con WAL y migraciones versionadas.
- Sesión local protegida con `expo-secure-store`.
- Contrato API compatible con `POST /api/action`.
- Login, `auth.me`, logout y cambio obligatorio de contraseña reutilizando las rutas existentes.
- Tokens visuales portados desde `dms-boletas/src/styles/tokens.css`.
- Política horaria central `America/Costa_Rica`:
  - automática: `07:00 <= hora < 17:00`;
  - manual: 24 horas.
- Sin reintentos automáticos de escrituras ambiguas.

En esta etapa **todavía no se registran BackgroundTasks ni se ejecuta sincronización automática**. Eso evita activar un flujo incompleto antes de contar con outbox, reconciliación e idempotencia.

## Próximas etapas

1. **Fundación móvil** — proyecto, SQLite base, sesión, API y política horaria.
2. **Persistencia operativa local** — esquema SQLite de mantenimientos, dispositivos, evidencias, catálogos, estado sync y outbox.
3. **SyncCoordinator** — PULL → reconciliación → PUSH → PULL final, mutex, cursores/generation y botón manual 24/7.
4. **Mantenimientos offline** — listado, detalle, filtros y snapshots locales respetando permisos/visibilidad existentes.
5. **Edición offline** — dispositivos, proyecto/checklists, observaciones y relaciones configurables.
6. **Evidencias** — cámara/galería, archivos locales, ANTES/DESPUÉS, cola de upload e idempotencia.
7. **Firmas y finalización** — firma, `FINALIZE_PENDING`, dependencias y conflictos.
8. **Triggers automáticos** — foreground, red, cambio local y `expo-background-task`, siempre limitados a 07:00–17:00.
9. **Hardening** — concurrencia, recuperación, pruebas de regresión, rendimiento y consistencia con web.
10. **APK / distribución** — EAS Build, perfiles de desarrollo/producción y validación en Android real.

## Configuración

Requiere Node.js compatible con Expo SDK 57.

```bash
cp .env.example .env
npm install
npm run start
```

Para Android con Expo Go:

```bash
npm run android
```

La URL del backend puede configurarse con:

```env
EXPO_PUBLIC_API_URL=https://dms-boletas-mfqj.onrender.com/api/action
```

Nunca incluir API keys, `DATABASE_URL`, tokens de sesión, credenciales de Google ni secretos en variables `EXPO_PUBLIC_*`.

## Regla local-first

Guardar localmente y sincronizar son conceptos separados.

- SQLite debe permitir trabajar independientemente de Internet y de la hora.
- La sincronización automática solo puede ejecutarse entre 07:00 y 17:00 en `America/Costa_Rica`.
- La sincronización manual estará disponible las 24 horas.
- Fuera de horario no se considera error: los cambios permanecen pendientes localmente.
