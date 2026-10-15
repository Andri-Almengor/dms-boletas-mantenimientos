# Paridad funcional DMS Boletas web ↔ APK (octubre 2026)

## Contrato de producto
La APK es una **alternativa de trabajo de campo local-first** para mantenimientos ya creados en la web (MANTENIMIENTO / PROYECTO). No debe convertirse en un backend paralelo: PostgreSQL, permisos, reglas de negocio, auditoría, Google Drive y notificaciones siguen centralizados en DMS Boletas.

**Decisiones previas que se conservan:** crear mantenimientos, firmar y finalizar solo desde la web. No incorporar en móvil los canales de correo, Google Chat, worker de progreso, generación de PDF ni Gemini como operaciones offline; se ejecutan en el backend o web al corresponder. El usuario no debe perder ningún avance capturado sin red.

**Sincronización:** automática solamente en America/Costa_Rica, 07:00 inclusive a 17:00 exclusiva; botón manual 24/7. El móvil usa la outbox y el SyncCoordinator existentes. Nunca enviar al backend una regla de autorización decidida solo por la pantalla.

## Inventario revisado
Base web: `Andri-Almengor/dms-boletas` main de 2026-10-15, incluidas mejoras recientes de lotes (#358), eliminaciones de evidencia por técnico/cámara (#361), notificaciones finales/progreso (#362) y conteo ANTES/DESPUÉS (#363).
Base móvil: `Andri-Almengor/dms-boletas-mantenimientos` main, que ya implementa fases 1-10, editor compartido, SQLite, capturas, preguntas dinámicas de Proyecto, relaciones, offline, cola de sincronización y protecciones SQLITE_BUSY (#5/#6).

## Etapas de paridad

| Etapa | Alcance | Resultado / verificación |
| --- | --- | --- |
| 11 — listas masivas offline | Hasta 100 equipos por lote, pegado Tab/Excel/líneas, tipo planificado y ubicación específica para MANTENIMIENTO y PROYECTO. Guardado atómico local, un ID y outbox por equipo, `PENDIENTE` sin datos inventados. | Implementado en este PR. Tests `stage11-bulk-devices-offline`; pendiente validación real Android + subida a Render. |
| 12 — avance y evidencias visibles | Igualar el resumen web del detalle: cantidades esperadas, registradas y por tipo; fecha/hora real de cada evidencia; progreso de evidencias. En MANTENIMIENTO distinguir equipos sin foto / solo ANTES / ANTES+DESPUÉS / solo DESPUÉS sin confundir con finalización de checklist. | Pendiente. Debe computarse en SQLite local en lote sin N+1; no crear chats móviles. |
| 13 — inventario y Proyecto | Auditar un dispositivo de cada tipo, preguntas configurables, sí/no, pendiente/completado con nota, dependencias (puertas→lectores/magnetos), checklist general/específico, fotos por componente, relaciones y navegación. | Ya existe base; pendientes las pruebas de paridad campo por campo con web y los ajustes que resulten, sin catálogo local paralelo. |
| 14 — sincronización y recuperación | Verificar creación masiva más subida de fotos, permisos de borrado vigentes para técnicos, pérdida de conectividad y recuperación, reingreso/cierre del teléfono, conflicto por edición simultánea y cambio de cliente. | Pendiente validación física e integración contra backend de pruebas; proteger datos capturados sin conexión antes de refactors UI. |
| 15 — distribución y aceptación | Revisar la APK EAS, migración de SQLite al actualizar, consumo de batería/memoria, cientos de dispositivos y evidencias, videos, background, pruebas de campo, y matriz final de diferencias. | Pendiente. Solo publicar APK con CI y pruebas de dispositivo completas. |

## Implementación de etapa 11

- `src/features/maintenance/maintenanceBulkDevices.ts`: parseo y payload compatible con el editor original de dispositivos. Mantiene nombres duplicados como altas diferentes, espacios internos y mayúsculas. No inventa fabricantes, números de serie, preguntas respondidas ni evidencias.
- `src/db/deviceRepository.ts::saveLocalDevicesBulk`: reutiliza `saveLocalDeviceTx`, rutas `maintenance.devices.create`, IDs estables, dependencias de ubicaciones/mantenimientos y `enqueueOutboxOperationTx`; una transacción SQLite con retry acotado de locks, un solo recálculo final de contadores. No incorpora endpoint masivo.
- `src/app/maintenance/[maintenanceId]/device/bulk.tsx`: pantalla nativa con permisos idénticos a la edición existente, solo cuando el detalle está completo. Si el usuario no tiene permiso o el mantenimiento es de solo lectura, el guardado se bloquea.
- `src/app/maintenance/[maintenanceId].tsx`: acceso en acciones rápidas y dentro de cada tarjeta de ubicación.
- Al volver al detalle, deben verse los nuevos equipos y su estado local de sincronización. Los equipos aparecen con los campos opcionales pendientes para edición posterior.

## Comprobaciones de regresión obligatorias

1. Offline: pegar 54 nombres de puertas o cámaras desde Excel, guardar y comprobar 54 tarjetas, una operación CREATE por ID y cero acceso remoto durante el guardado.
2. Repetir con 100 nombres; 101 debe rechazarse antes de modificar SQLite.
3. Una lista con tabulaciones, CRLF, espacios internos y duplicados debe conservar todos los nombres y crear IDs únicos.
4. Forzar error SQLite en mitad de la transacción: **ningún dispositivo parcial** y ninguna outbox parcial. Reintentar después.
5. Validar usuarios de técnico y administrador según permisos existentes; mantenimiento FINALIZADA y sin detalle descargado no deben permitir guardar.
6. Cerrar la APK tras guardar sin conexión y reabrir: todos los dispositivos y outbox siguen presentes. Reingresar otro usuario no expone el scope del primero.
7. Reconectar en la ventana automática o pulsar **Sincronizar ahora** fuera de horario: comprobar creación en PostgreSQL mediante backend existente, una vez por ID. Revisar conflictos y reintentos.
8. En Proyecto, crear equipos sin checklist ni evidencias y editarlos después: no deben marcarse como finalizados. Repetir con MANTENIMIENTO.
9. Verificar que firmas, finalización, PDFs, Google Chat y correos no se modificaron.
10. Validar de nuevo SQLITE_BUSY en arranque y edición, además de cámara/galería para no reintroducir regresiones.

## Despliegue
Este PR solo cambia Expo/React Native; **no requiere migración PostgreSQL, versión nueva de Apps Script ni despliegue de Render**. Tampoco cambia el schema de SQLite. Para consumir las mejoras de backend web posteriores, Render debe mantener publicada una revisión que las contenga.

Comandos locales: `npm ci`, `npm test`, `npm run typecheck`, `npm run build:apk` para EAS (requiere credenciales/EAS configurado). El workflow existente publica una APK debug para pruebas, que no sustituye la build firmada EAS.
