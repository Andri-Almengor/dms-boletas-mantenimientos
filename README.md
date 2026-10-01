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
- Dependencias mantenimiento → dispositivo → evidencia.
- Outbox persistente con recuperación de operaciones interrumpidas.
- Evidencias referenciadas por URI local; no se almacenan fotografías Base64 en SQLite.
- Estado de `cursor / generation / schemaVersion / cacheScope`.
- Tabla de conflictos.

### Etapa 3 — SyncCoordinator ✅

Motor único:

```
PULL
  ↓
RECONCILIACIÓN / CATÁLOGOS
  ↓
PUSH OUTBOX
  ↓
PULL FINAL
```

Incluye `sync.delta`, schema 2, snapshots, cursor/generation/cacheScope, lease SQLite, outbox con dependencias, `__syncBase`, conflictos, subida de evidencias y botón manual 24/7.

### Etapa 4 — Mantenimientos offline ✅

La navegación operativa ya consume SQLite como fuente inmediata.

#### Lista

- Pestañas **Pendientes / Finalizados**.
- Compatibilidad con `FINALIZADO` y `FINALIZADA`.
- Búsqueda por título, cliente, responsable, descripción y ubicación.
- Filtros por cliente y rango de fechas.
- Selector de fecha nativo Android/iOS.
- Paginación local de 40 registros.
- `COUNT(*) OVER()` para total sin cargar toda la tabla.
- Conteo de dispositivos en batch mediante CTE.
- La pantalla no consulta el backend para pintar la lista.

#### Detalle

Cada mantenimiento distingue entre:

- **resumen descargado**;
- **detalle completo disponible sin conexión**.

No se muestra falsamente “0 dispositivos” si todavía no se descargó el detalle.

El usuario puede usar **Descargar detalle / Actualizar detalle**. Es una acción manual y funciona fuera del horario automático.

La respuesta autorizada de `maintenance.get` se persiste en SQLite sin pisar:

- mantenimiento con cambios locales;
- dispositivos con outbox pendiente;
- evidencias con outbox pendiente.

#### Dispositivos

- Cada dispositivo abre en una ruta independiente.
- Navegación **Anterior / Siguiente** sin acumular pantallas en el stack.
- Fabricante, modelo, serie, estado, funcionamiento, uso y observación.
- Galería de evidencias.
- Evidencias con archivo local pueden ampliarse a pantalla completa.
- Evidencias que todavía solo existen en Drive se muestran como remotas; no se intenta acceder directamente a Drive ni saltarse el endpoint protegido.

La descarga/caché segura de imágenes remotas se completará en la etapa específica de evidencias.

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

Todavía **no existen triggers automáticos**. No se registra `expo-background-task`, no se sincroniza por foreground/red/cambio local y no existe polling.

El botón **Sincronizar ahora** y la actualización manual de un detalle son las únicas acciones de red conectadas.

## Conflictos

Las ediciones de registros provenientes del servidor conservan `__syncBase`.

Si el servidor cambió el mismo campo mientras el técnico trabajaba localmente, el backend existente responde `SYNC_CONFLICT`. La app conserva versión base, local, remota y campos en conflicto.

No se fuerza automáticamente KEEP_LOCAL ni USE_SERVER.

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
4. **Mantenimientos offline** ✅
5. **Edición offline** — dispositivos, proyecto/checklists, observaciones y relaciones configurables.
6. **Evidencias** — cámara/galería, almacenamiento persistente, ANTES/DESPUÉS y caché segura de medios remotos.
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

- SQLite permite trabajar independientemente de Internet y de la hora.
- La sincronización automática solo podrá ejecutarse entre 07:00 y 17:00.
- La sincronización manual está disponible las 24 horas.
- Fuera de horario no existe error: los cambios permanecen pendientes localmente.
