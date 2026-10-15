# Etapa 12 — Paridad de progreso y fechas de evidencia (APK offline)

## Referencia
- Web: `src/components/maintenance/MaintenanceDeviceProgressSummary.jsx`, `src/components/maintenance/MaintenanceDeviceInventory.jsx`.
- Backend: `backend/src/core/maintenance-progress.js::buildMaintenanceProgress`, actualizado en PR web #363.
- Móvil: `readLocalMaintenanceDetail` carga dispositivos y evidencias **en lote**, filtrando tombstones SQLite y preservando operaciones pendientes.

## Cambios
1. `src/features/maintenance/maintenanceProgress.ts` proyecta sobre el detalle SQLite las mismas métricas de lectura del backend: cantidades por tipo histórico/dinámico, registrados, faltantes (por tipo sin compensación), evidencias, dispositivos con/sin evidencia, pares ANTES+DESPUÉS, solo ANTES (falta DESPUÉS), solo DESPUÉS y sin clasificar. Distintos archivos ANTES del mismo dispositivo no multiplican pendientes.
2. `src/components/maintenance/MaintenanceProgressSummary.tsx` sustituye el resumen global anterior en la vista detalle. Muestra conteo por tipo y resumen detallado de evidencias cuando todo el inventario planificado está completo. En PROYECTO no se confunde la categoría de evidencia con fases ANTES/DESPUÉS ni con progreso de checklist.
3. Si el detalle no fue descargado, no informa falsamente cero registrados/evidencias. El usuario mantiene la opción actual de descargar contenido.
4. `useFocusEffect` refresca el detalle al volver de un editor o tras guardar fotos sin Internet; no necesita una sincronización remota para reflejar cambios locales.
5. `maintenanceEvidence.ts::evidenceDateLabels` presenta la fecha de carga real del servidor (`FechaCreacion`) por separado de la captura (`FechaCaptura`), ambas expresadas en `America/Costa_Rica`. Si aún no se subió, muestra **Carga pendiente de sincronización**; si el servidor no entregó fecha no se inventa.
6. `MaintenanceEvidenceManager` utiliza el mismo formateador tanto para MANTENIMIENTO como PROYECTO y refresca las fechas al completar la sincronización.

## Invariantes preservados
- PostgreSQL sigue siendo fuente de verdad; solo se calculan métricas **visualizadas** desde SQLite.
- No se cambian categorías/estados almacenados, permisos, acciones sensibles ni se crean endpoints.
- Sin cambios de esquema SQLite, migraciones, backend Render, Apps Script, PDFs, Drive, Google Chat, correo, firma/finalización ni notificaciones 07:00/17:00.
- Auto sync de 07:00 inclusive a 17:00 exclusiva; manual 24/7 intacto.
- No consultas por cada tarjeta/imagen: el detalle ya trae evidencias agrupadas y `deviceType` se lee una vez del caché local.
- Si los datos locales están desactualizados, las cifras representan exactamente el contenido disponible en el dispositivo, no un estado remoto confirmado.

## Regresiones
`npm test` incluye `tests/stage12-maintenance-progress-evidence.test.mjs`, que ejecuta el cálculo TypeScript real, cubriendo duplicidad JSON/columnas, dinámicos, ANTES sin DESPUÉS, múltiples ANTES, ambas fases, borrado de DESPUÉS, evidencia inactiva, un tipo excedido y otro incompleto, separación fecha captura/carga con zona horaria CR y ausencia de red directa.

## Comprobación física pendiente
- Descargar un mantenimiento de pruebas con varios tipos, incluidas categorías dinámicas; comparar esperado/registrado con web.
- Poner modo avión, agregar/borrar evidencias ANTES/DESPUÉS, regresar a detalle; verificar actualización y persistencia tras cerrar/reabrir.
- Cargar varias fotos ANTES de un equipo, luego DESPUÉS y luego borrar la última DESPUÉS; observar 1 pendiente, luego 0 y luego 1.
- Ver evidencia local: captura con fecha, carga pendiente. Sincronizar manualmente y verificar fecha real de carga del servidor, sin sustituir captura.
- PROYECTO: evidencias no clasificadas por antes/después y checklist sigue siendo independiente.
- Validar Android tablet/móvil, scrolling de 50+ dispositivos, sin N+1.

## Relación con etapa 11
PR móvil #7 (alta masiva) seguía abierto cuando se comenzó esta etapa. Este PR se creó **independientemente desde main** para evitar mezclar funcionalidades. Los cambios en `src/app/maintenance/[maintenanceId].tsx` son distintos de los accesos masivos del PR #7; revisar posibles conflictos de merge antes de fusionar el segundo.

## Despliegue
Solo requiere nueva build móvil (APK); no migraciones ni actualización Render/Apps Script.
