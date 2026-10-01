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

### Etapa 7 — Firmas y finalización offline ✅

La firma general puede dibujarse con dedo, stylus o mouse, o cargarse como imagen PNG/JPEG. El archivo se conserva primero en almacenamiento persistente y su referencia se registra en SQLite; el Base64 solo se genera o lee al sincronizar.

La app reutiliza el flujo existente del backend:

- `maintenance.signature.link`;
- `maintenance.signature.public.submit`;
- `maintenance.finalize`.

No se crearon rutas ni permisos nuevos. La firma respeta los permisos de lectura de mantenimiento existentes y la finalización conserva `USUARIOS_GESTIONAR` como permiso autoritativo del backend.

La firma continúa siendo **opcional** para finalizar. Si no existe, el backend conserva su política actual y genera las boletas/PDF sin firma. Si existe una firma local pendiente, esta debe sincronizarse antes del cierre.

La solicitud de cierre se registra localmente como `FINALIZE_PENDING`; no cambia `Estado` a `FINALIZADO` de forma optimista. La outbox aplica una barrera por mantenimiento: el cierre no se ejecuta mientras exista una edición, evidencia, firma o conflicto previo sin resolver para ese mismo mantenimiento.

Cuando la solicitud llega a `maintenance.finalize`, el backend sigue siendo la fuente de verdad y devuelve el estado de finalización escalonada. El `PULL` final conserva la reconciliación autoritativa.

Guardar firma o solicitar finalización **no inicia sincronización automática**. Fuera de 07:00–17:00 todo queda local; el botón manual puede sincronizar 24/7.

### Etapa 8 — Triggers automáticos ✅

La sincronización automática reutiliza exclusivamente el mismo `SyncCoordinator`.

Triggers habilitados:

- apertura/restauración de sesión;
- regreso a foreground;
- recuperación real de conectividad;
- cambios locales registrados en la outbox;
- `expo-background-task` / `TaskManager` como apoyo diferible.

Todos los triggers automáticos verifican primero la ventana `07:00 <= hora < 17:00` en `America/Costa_Rica`. Fuera de horario no se inicia `sync.delta`, upload ni otra operación remota automática. El botón **Sincronizar ahora** continúa funcionando 24/7.

Si un ciclo automático cruza las 17:00, la unidad atómica que ya está en vuelo puede finalizar de forma segura, pero no se inicia otra unidad, página de snapshot, `sync.delta`, recurso estático u operación de outbox.

Los cambios locales emiten una señal en memoria con debounce; los repositorios nunca llaman red directamente. El background task abre la misma SQLite, recupera la misma sesión segura, usa el mismo scope y adquiere el mismo lease de sincronización.

No existe un servicio vivo ni polling agresivo. BackgroundTask usa un intervalo mínimo de 60 minutos y el sistema operativo decide cuándo ejecutarlo. En foreground solo existe un timer hacia el siguiente límite horario (07:00 o 17:00).

### Etapa 9 — Hardening ✅

Se reforzó la arquitectura existente sin introducir un segundo motor de sincronización.

#### Concurrencia y lease

- foreground, background y sincronización manual siguen compitiendo por el mismo lease SQLite;
- el lease se renueva antes de cada nueva unidad de red;
- snapshots, `sync.delta`, firma y cada chunk de evidencia mantienen vivo el lease durante operaciones largas;
- antes de aplicar un éxito remoto localmente se comprueba nuevamente que la instancia conserva el lease;
- si aparece `SYNC_LOCK_LOST`, la instancia vieja deja la operación `IN_FLIGHT` sin mutarla y el nuevo propietario la recupera mediante el flujo existente.

SQLite mantiene WAL y ahora usa `busy_timeout=5000` para reducir fallos transitorios entre foreground/background. También se ejecuta `PRAGMA optimize` tras inicializar/migrar.

#### Conflictos

El registro local de conflictos es idempotente por entidad mientras exista un conflicto abierto.

Cuando un mantenimiento fue eliminado remotamente pero el dispositivo conserva cambios offline, se registra además una fila autoritativa en `sync_conflicts`; el contador y estado visual ya no dependen únicamente del estado `CONFLICT` de la outbox.

No se aplica automáticamente KEEP_LOCAL ni USE_SERVER.

#### Housekeeping seguro

Después de un ciclo completo se realiza limpieza conservadora:

- operaciones `SUCCEEDED` de más de 7 días se eliminan solo si ninguna operación no completada depende de ellas;
- archivos locales de más de 24 horas se consideran huérfanos únicamente si no están referenciados por evidencia activa, firma ni outbox no resuelta;
- el borrado físico ocurre antes de eliminar su registro SQLite;
- si el sistema operativo no permite borrar un archivo, el registro se conserva para reintentar posteriormente.

Se agregaron índices para la barrera por `aggregate_id` y para la búsqueda de archivos antiguos, evitando escaneos completos en esos flujos.

#### Diagnóstico

Los errores reales del ciclo y las operaciones bloqueadas quedan reflejados en `sync_state`. Un cierre de ventana automática continúa siendo `PAUSED`, no un error.

No se modificaron rutas, permisos, estados de negocio, PostgreSQL, Drive, PDFs, correo, Google Chat ni Apps Script.

### Etapa 10 — APK / distribución ✅

La app ya tiene identidad Android estable:

```
com.solutionsdms.dmsmantenimientos
```

y `versionCode: 1`.

Se agregaron dos perfiles EAS:

- `preview`: distribución interna, genera APK instalable;
- `production`: genera AAB para Google Play.

Comandos:

```bash
npm run build:apk
npm run build:aab
```

Los scripts usan `npx eas-cli@latest`; EAS CLI no se agrega a las dependencias de la aplicación.

Para crear el primer proyecto EAS, una sola vez:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

No se guardan `EXPO_TOKEN`, keystores ni credenciales Android en Git.

Además, el workflow `Android APK` genera en GitHub Actions una APK debug instalable usando el proyecto Android real de Expo Prebuild y la publica como artefacto `dms-mantenimientos-android-debug`. Esta APK es para validación técnica; para actualizaciones firmadas de forma estable se usa EAS preview.

El checklist completo de dispositivo físico está en `docs/android-validation-checklist.md` e incluye SQLite, offline prolongado, cámara, galería, videos, firma, recuperación de red, límite de las 17:00, sync manual, BackgroundTask, conflictos y actualización conservando datos.

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

Los triggers automáticos están activos únicamente dentro de la ventana operativa. El botón **Sincronizar ahora** y las acciones manuales siguen disponibles fuera de horario cuando el usuario las solicita explícitamente.

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
7. **Firmas y finalización** ✅
8. **Triggers automáticos** ✅
9. **Hardening** ✅
10. **APK / distribución** ✅ — EAS Build, APK nativa de CI y checklist de validación Android.

## Configuración

```bash
cp .env.example .env
npm install
npm test
npm run typecheck
npm run start
```

Para Android durante desarrollo rápido:

```bash
npm run android
```

Para validar las APIs nativas y BackgroundTask, usar la APK propia o una build EAS; Expo Go no sustituye la validación de distribución.

Para generar APK interna estable con EAS:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npm run build:apk
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


## Corrección de bootstrap de mantenimientos

Durante la primera prueba real desde Expo se detectó que el login funcionaba pero los mantenimientos existentes podían no aparecer en SQLite.

Se corrigieron dos diferencias respecto al cliente web existente:

1. `maintenance.list` ya no recibe `activo:true` desde el móvil. El endpoint de backend ya aplica `excludeInactive` y considera válidos registros históricos sin valor explícito en `Activo`; forzar el booleano desde el móvil podía excluirlos.
2. Si `sync.delta` está deshabilitado, marcado `sync_unsafe` o no puede inicializarse, el móvil ahora utiliza el mismo principio que la web: descarga el snapshot desde la ruta autoritativa (`maintenance.list`) y mantiene SQLite utilizable offline, sin inventar `generation` ni `cacheScope`.

No se ampliaron permisos. El fallback sigue pasando por `POST /api/action` y las validaciones del backend.
