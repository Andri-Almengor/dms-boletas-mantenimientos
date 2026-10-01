# DMS Boletas — Mantenimientos móvil

Aplicación móvil local-first para complementar **DMS Boletas** en Android/iOS, orientada al trabajo de mantenimientos con operación completa sobre SQLite y sincronización posterior contra el backend existente.

> Este repositorio no reemplaza la aplicación web. Comparte autenticación, permisos, reglas de negocio, PostgreSQL, Drive y el protocolo de sincronización de DMS Boletas.

## Estado

### Etapa 1 — Fundación móvil ✅

- Expo SDK 57 + React Native + TypeScript estricto.
- Expo Router.
- SQLite con WAL y migraciones versionadas.
- Sesión protegida con `expo-secure-store`.
- Contrato `POST /api/action` del backend existente.
- `auth.login`, `auth.me`, logout y cambio obligatorio de contraseña.
- Tokens visuales portados desde DMS Boletas.
- Política central `America/Costa_Rica`: automática 07:00–17:00; manual 24 horas.

### Etapa 2 — Persistencia operacional local ✅

- Esquema SQLite v2 para:
  - mantenimientos;
  - dispositivos;
  - evidencias;
  - archivos locales;
  - clientes/catálogos y recursos auxiliares;
  - estado de sincronización;
  - outbox persistente;
  - conflictos.
- Aislamiento de datos por usuario **y huella de permisos**.
- IDs locales estables compatibles con los IDs generados por cliente que ya acepta el backend.
- Escritura local + outbox en una misma transacción SQLite.
- Dependencias de cola:
  - dispositivo → creación del mantenimiento;
  - evidencia → creación del dispositivo.
- Coalescencia de operaciones todavía pendientes para evitar escrituras redundantes.
- Recuperación de operaciones que quedaron `IN_FLIGHT` si Android mata la aplicación.
- Las evidencias guardan URI/metadatos del archivo; no se almacenan fotos Base64 en SQLite.
- Repositorio genérico para catálogos sincronizables reutilizando los recursos del backend.
- Persistencia del descriptor `cursor / generation / schemaVersion / cacheScope`.
- Pruebas de regresión estructurales del esquema y del aislamiento por scope.

En estas etapas **todavía no se registra BackgroundTask ni se ejecuta sincronización automática**. El motor se activa después de tener reconciliación y exclusión mutua completas.

## Próximas etapas

1. **Fundación móvil** ✅
2. **Persistencia operativa local** ✅
3. **SyncCoordinator** — PULL → reconciliación → PUSH → PULL final, mutex, cursores/generation, snapshot y botón manual 24/7.
4. **Mantenimientos offline** — listado, detalle, filtros y snapshots locales respetando permisos/visibilidad existentes.
5. **Edición offline** — dispositivos, proyecto/checklists, observaciones y relaciones configurables.
6. **Evidencias** — cámara/galería, archivos locales, ANTES/DESPUÉS, cola de upload e idempotencia.
7. **Firmas y finalización** — firma, `FINALIZE_PENDING`, dependencias y conflictos.
8. **Triggers automáticos** — foreground, red, cambio local y `expo-background-task`, limitados a 07:00–17:00.
9. **Hardening** — concurrencia, recuperación, pruebas de regresión, rendimiento y consistencia con web.
10. **APK / distribución** — EAS Build y validación en Android real.

## Configuración

```bash
cp .env.example .env
npm install
npm test
npm run typecheck
npm run start
```

Para Android con Expo Go:

```bash
npm run android
```

La URL pública del backend se configura con:

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
