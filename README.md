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

### Etapa 5 — Edición offline ✅

La edición ya funciona sin depender de Internet. **Guardar** siempre escribe primero en SQLite y crea/actualiza la outbox.

#### Mantenimientos

- Un único `MaintenanceEditorScreen` sirve para **Nuevo** y **Editar**.
- Reutiliza los permisos existentes:
  - `MANTENIMIENTOS_CREAR` / `MANTENIMIENTOS_GESTIONAR` / `BOLETAS_CREAR`;
  - `MANTENIMIENTOS_EDITAR` / `MANTENIMIENTOS_GESTIONAR` / `BOLETAS_EDITAR`;
  - `USUARIOS_GESTIONAR` conserva el comportamiento administrativo existente.
- Cliente, ubicación y responsables se leen de catálogos SQLite.
- Fechas usan selector nativo.
- Cantidades esperadas reutilizan los mismos 11 tipos históricos de mantenimiento.
- Proyecto permite configurar checklist propio por tipo de dispositivo.
- No se permite cambiar Mantenimiento↔Proyecto si ya existen dispositivos. La validación considera tanto dispositivos locales como el conteo conocido del resumen remoto.
- `FINALIZADO` y `FINALIZADA` quedan solo lectura para usuarios no administrativos.

#### Dispositivos

Un único `DeviceEditorScreen` sirve para **Agregar** y **Editar**.

Incluye:

- ubicación de equipo;
- fecha de trabajo;
- técnicos;
- tipo;
- fabricante;
- modelo;
- nombre;
- serie;
- MAC;
- funcionamiento;
- en uso;
- estado;
- observaciones.

Crear/editar reutiliza:

- `maintenance.devices.create`;
- `maintenance.devices.update`;
- IDs locales estables;
- `__syncBase`;
- dependencias de outbox.

Si el mantenimiento todavía es local, el dispositivo queda dependiente del `CREATE` del mantenimiento.

#### Preguntas dinámicas y Proyecto

La app no mantiene un catálogo paralelo.

Las preguntas se obtienen de `maintenance.config` ya sincronizado y soportan:

- `SI_NO`;
- `OPCIONES`;
- `MAC`;
- `NUMERO`;
- `CANTIDAD`;
- `RELACION_DISPOSITIVO`.

Se conservan preguntas históricas y el snapshot enviado en `RespuestasJSON/questionDetails`.

Las relaciones de Proyecto reutilizan tipo relacionado, cantidad, fabricante, modelo, nombre, serie, MAC y preguntas hijas. Las validaciones de campos obligatorios y MAC se realizan localmente y vuelven a validarse en backend al sincronizar.

El checklist de progreso puede permanecer incompleto: igual que en la web, eso mantiene el dispositivo en estado pendiente automático pero **no impide guardar el trabajo parcial**.

#### Eliminación de dispositivos

Se reutiliza `maintenance.devices.delete` y los permisos actuales del backend:

- administración puede eliminar;
- técnicos con permiso de edición pueden eliminar mientras el mantenimiento siga `PENDIENTE`.

Para dispositivos únicamente locales, el alta pendiente se cancela localmente.

Si un `CREATE` ya está `IN_FLIGHT`, no se borra a ciegas: el `DELETE` queda dependiente de ese alta. La respuesta del `CREATE` tampoco vuelve a materializar el dispositivo porque el SyncCoordinator detecta el trabajo local más nuevo.

Las evidencias todavía no se editan en este formulario. Cámara, galería, ANTES/DESPUÉS y gestión completa de archivos corresponden a la Etapa 6.

### Etapa 6 — Evidencias offline ✅

La captura, edición de metadatos, eliminación y visualización de evidencias ya funciona sobre la arquitectura local-first.

#### Captura y selección

Desde el detalle de un dispositivo se puede:

- tomar una fotografía con la cámara;
- seleccionar una fotografía y usar el editor nativo de recorte/rotación;
- seleccionar varias imágenes o videos de la galería;
- grabar videos de hasta 90 segundos.

Se conservan los límites actuales de DMS Boletas:

- imagen: hasta **15 MB**;
- video: hasta **300 MB**;
- duración máxima de video: **90 segundos**.

#### Persistencia local

El archivo se copia a almacenamiento persistente del dispositivo antes de depender de la red.

En SQLite se guarda únicamente:

- URI local;
- MIME;
- nombre;
- tamaño;
- metadatos;
- relación con mantenimiento/dispositivo;
- estado de sincronización.

No se persiste Base64 en SQLite.

El registro de `local_files`, la evidencia local y la operación de outbox se escriben dentro de la misma transacción SQLite.

#### Mantenimiento y Proyecto

Para mantenimiento se conservan:

- **Antes**;
- **Después**;
- nota;
- fecha/hora original de captura.

Para Proyecto se conserva la misma política del backend:

- evidencia del dispositivo principal;
- evidencia de un componente relacionado;
- clave de relación;
- ID local del componente;
- tipo y nombre del componente.

La aplicación reutiliza los componentes ya configurados en las preguntas dinámicas; no crea un catálogo paralelo.

#### Edición y borrado

Los metadatos pueden modificarse sin conexión.

Si una evidencia todavía no llegó al servidor, la outbox reutiliza una única intención de subida en lugar de duplicarla.

Si la subida ya está `IN_FLIGHT`, una edición o eliminación posterior queda ordenada detrás de esa operación para evitar estados ambiguos.

El borrado reutiliza `maintenance.images.delete` y los permisos existentes.

#### Subidas grandes

Las imágenes pequeñas reutilizan `maintenance.images.upload`.

Los videos y archivos mayores a 6 MB reutilizan el flujo segmentado existente:

- `maintenance.images.large.init`;
- `maintenance.images.large.chunk`.

Los bloques son de hasta 6 MB y se leen desde el archivo local por posición/longitud, evitando convertir un video completo de cientos de MB a Base64 en memoria.

#### Evidencia remota protegida

Una evidencia que solo existe en el servidor se obtiene mediante `maintenance.media.get`.

El backend devuelve un enlace temporal protegido y la app lo copia a caché local persistente. No se accede directamente a Google Drive ni se hacen públicos los archivos.

Una vez descargada, la evidencia puede volver a abrirse offline.

#### Reproductor

Las imágenes se amplían en un lightbox compartido.

Los videos locales/caché se reproducen con `expo-video` y controles nativos.

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
5. **Edición offline** ✅
6. **Evidencias** ✅
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
