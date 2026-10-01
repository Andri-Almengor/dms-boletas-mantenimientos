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

- Esquema SQLite para mantenimientos, dispositivos, evidencias, archivos y catálogos.
- Aislamiento por UsuarioID + huella exacta de permisos.
- IDs locales estables compatibles con los IDs generados por cliente del backend.
- Escritura local + outbox en una misma transacción.
- Dependencias:
  - mantenimiento → dispositivo;
  - dispositivo → evidencia.
- Outbox persistente con recuperación de operaciones interrumpidas.
- Evidencias referenciadas por URI local; no se almacenan fotografías Base64 en SQLite.
- Estado de `cursor / generation / schemaVersion / cacheScope`.
- Tabla de conflictos.

### Etapa 3 — SyncCoordinator ✅

Se implementó un único motor reutilizable:

```
PULL
  ↓
RECONCILIACIÓN / CATÁLOGOS
  ↓
PUSH OUTBOX
  ↓
PULL FINAL
```

Incluye:

- `sync.delta` con `SYNC_SCHEMA_VERSION=2`.
- Snapshot inicial y recuperación cuando cambia `generation`, `schemaVersion` o `cacheScope`.
- Paginación de snapshots de hasta 1000 filas por solicitud.
- Recursos incrementales reutilizados del backend:
  - mantenimientos;
  - clientes;
  - ubicaciones;
  - ubicaciones de equipo;
  - contactos;
  - categorías;
  - tipos de dispositivo;
  - fabricantes;
  - modelos;
  - tipos de falla;
  - relaciones tipo/fabricante.
- Refresco de usuarios asignables, preguntas de mantenimiento y configuración de mantenimiento.
- PULL que no sobreescribe registros con cambios locales pendientes.
- `__syncBase` compatible con la política de conflictos de la web.
- Manejo de `SYNC_CONFLICT` con persistencia local para revisión.
- Errores 4xx determinísticos pasan a `BLOCKED`; no se esconden mediante retries.
- 408, 429, errores de red y 5xx quedan preparados para reintento posterior.
- Lease/mutex persistente en SQLite para impedir ciclos simultáneos.
- Upload de evidencia pendiente leyendo el archivo local solo al momento de enviar.
- Botón **Sincronizar ahora** disponible 24/7.
- Estados visuales:
  - actualizado;
  - pendiente;
  - sin conexión;
  - fuera de horario;
  - error;
  - conflicto;
  - sesión expirada.
- Fuera de 07:00–17:00 se muestra que la sincronización automática está pausada, pero el botón manual sigue disponible.

## Política de sincronización

Zona horaria operativa:

```
America/Costa_Rica
```

Automática:

```
07:00 <= hora < 17:00
```

Manual:

```
24 horas
```

En la Etapa 3 **todavía no existen triggers automáticos**. No se registra `expo-background-task`, no se escucha foreground/red para ejecutar sync y no existe polling. El único disparador conectado es **Sincronizar ahora**.

Esto es intencional: primero se completa y prueba el motor; los disparadores automáticos se conectarán en una etapa posterior reutilizando este mismo `SyncCoordinator`.

## Conflictos

Las ediciones de registros provenientes del servidor conservan una copia `__syncBase`.

Si el servidor cambió el mismo campo mientras el técnico trabajaba localmente, el backend existente responde `SYNC_CONFLICT`. La app guarda:

- versión base;
- versión local;
- versión remota;
- campos en conflicto;
- mantenimiento relacionado.

No se fuerza automáticamente la versión local ni la remota.

## Evidencias

SQLite guarda:

- relación con mantenimiento/dispositivo;
- URI local;
- MIME;
- nombre;
- metadatos;
- estado de sync.

Al procesar la outbox, el archivo se lee como Base64 únicamente para reutilizar `maintenance.images.upload`. No se mantiene Base64 persistente en la base local.

## Próximas etapas

1. **Fundación móvil** ✅
2. **Persistencia operativa local** ✅
3. **SyncCoordinator** ✅
4. **Mantenimientos offline** — listado, detalle, filtros, navegación y snapshots locales.
5. **Edición offline** — dispositivos, proyecto/checklists, observaciones y relaciones configurables.
6. **Evidencias** — cámara/galería, almacenamiento persistente, ANTES/DESPUÉS y experiencia de upload.
7. **Firmas y finalización** — firma, `FINALIZE_PENDING`, dependencias y conflictos.
8. **Triggers automáticos** — foreground, recuperación de red, cambio local y `expo-background-task`, limitados a 07:00–17:00.
9. **Hardening** — concurrencia, recuperación, rendimiento, pruebas y consistencia web/móvil.
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
- La sincronización automática solo podrá ejecutarse entre 07:00 y 17:00.
- La sincronización manual está disponible las 24 horas.
- Fuera de horario no existe error: los cambios permanecen pendientes localmente.
