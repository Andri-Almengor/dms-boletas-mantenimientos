# Etapa 14 — Recuperación de cámara y evidencias offline

## Problema y causa raíz verificados
En la APK, al crear un dispositivo, las fotos/vídeos seleccionados ya eran copiados a `FileSystem.documentDirectory`, pero la lista de borradores solo existía en el estado React. El efecto de desmontaje de `DeviceEditorScreen` eliminaba todos esos archivos si el usuario no había guardado el dispositivo. Una recreación de la pantalla Android después de usar cámara provocaba por tanto pérdida real de evidencias. Además, `MaintenanceEvidencePickerControls` volvía a ejecutar `ImagePicker.getPendingResultAsync()` cada vez que cambiaba la identidad de `onAssets`; esto podía volver a procesar la misma captura.

## Solución integrada en el PR #9
- **Reutilización de SQLite existente**, sin migraciones: `local_resource_items` guarda el manifiesto `maintenanceEvidenceDraft` por `scope_key` y `maintenanceId`, y `local_files` conserva metadatos/rutas de imágenes copiadas en el `documentDirectory` persistente. No es un nuevo sistema de almacenamiento.
- `saveMaintenanceEvidenceDrafts` actualiza el manifiesto en **una transacción SQLite** y las escrituras concurrentes se serializan desde el editor con `draftWritesRef`; el guardado del dispositivo espera a que terminen.
- `listMaintenanceEvidenceDrafts` recupera fotos cuando se recrea la vista; verifica existencia física y informa si faltan archivos. Las fotos no se eliminan en `useEffect` de desmontaje.
- `saveLocalDeviceWithEvidence` usa su **misma transacción** para guardar dispositivo + evidencias + outbox y **consumir el manifiesto**. Ante error se revierte todo, dejando el borrador recuperable. La sincronización remota sigue usando `maintenance.images.upload` y `maintenance.devices.create` existentes.
- La limpieza `listOrphanedLocalFiles` protege específicamente archivos de borrador con registro vigente, además de las evidencias y outbox ya protegidas. Un archivo eliminado del borrador se limpia solo por la política conservadora de huérfanos.
- La cámara usa un **handler estable** para `getPendingResultAsync`, ignora URIs repetidas en la sesión y bloquea selecciones paralelas mientras persiste. Las selecciones de galería y video comparten el mismo flujo.
- `MaintenanceEvidenceDraftSection` evita reañadir el mismo resultado desde la cámara, espera la confirmación de persistencia y al eliminar borra primero el manifiesto y luego el archivo.

## Comportamiento y seguridad que NO cambian
- PostgreSQL / backend siguen siendo fuente de verdad.
- Ningún estado, permiso, rol, asignación, firma, finalización, correo, Google Chat, PDFs, Drive, auditoría o endpoint se modifica.
- No se crean boletas ni mantenimientos desde el móvil.
- La sincronización automática opera **solo 07:00 ≤ hora < 17:00 America/Costa_Rica** y el botón manual permanece habilitado siempre.
- Los borradores no se envían al servidor hasta que un dispositivo válido se guarde; no se crean dispositivos fantasmas.
- Los borradores están aislados por cuenta/scope y mantenimiento; no afectan la pantalla de finalizados u otras cuentas.
- El tiempo de eliminación conservadora de archivos huérfanos sigue siendo 24 horas; **los borradores activos quedan protegidos**.

## Pruebas
`tests/stage14-camera-draft-recovery.test.mjs` ejecuta el repositorio TypeScript real sobre transacción SQLite simulada y verifica: lectura tras remonte, aislamiento scope/mantenimiento, edición y limpieza de manifiesto sin borrar archivo pendiente, protección ante housekeeping, consumo atómico en guardado, recuperación Android con deduplicación y ausencia de borrado al desmontar. Se incluyen pruebas de regresión de etapas 11/12/13.

Comandos del pipeline: `npm test`, `npm run typecheck`, export Android + workflow APK.

## Validación física pendiente
1. En Proyecto y Mantenimiento, abrir «Agregar dispositivo», tomar 3 fotos y un video, salir y volver sin guardar: deben restaurarse. Confirmar en modo avión y tras cerrar/reabrir Android.
2. Cambiar el destino a un componente relacionado; verificar que se conservan las fotos y el destino asignado.
3. Cambiar el tipo ANTES/DESPUÉS, editar notas y guardar el dispositivo. Comprobar outbox y ausencia de duplicados al sincronizar manualmente.
4. Provocar poca capacidad de almacenamiento y falta del archivo: debe haber error claro; nunca mostrar evidencia «guardada» si el archivo no existe.
5. Alternar cuentas/usuarios: no mostrar borradores de otra cuenta.
6. Simular cierre de la actividad de Android después de la cámara, verificar `getPendingResultAsync` y no duplicación. Verificar 07:00/17:00.
7. Inspeccionar sincronización de lote grande, conflictos 409, archivo local faltante y `SQLITE_BUSY`; la cola existente conserva errores y no los oculta con retries indeterminados.

## Despliegue
Solo nueva APK después de merge y pruebas en teléfono físico. No hay cambios de esquema, migrations SQL, Render, Apps Script, permisos ni variables de entorno.
