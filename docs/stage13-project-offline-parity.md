# Etapa 13 — Paridad de Proyecto en APK offline

## Investigación: implementación compartida
Revisado `main` web (`MaintenanceProjectDeviceDetail`, `MaintenanceProjectRelationField`, `MaintenanceQuestionField`, `MaintenanceProjectProgressChecklist` y dominios de relaciones) y la APK (`DeviceEditorScreen`, `DynamicQuestionField`, `ProjectProgressEditor`, `maintenanceQuestions`, `maintenanceProject`, `maintenanceEvidence`, SQLite y sync).

**Diferencia real:** el editor móvil ya podía guardar preguntas, componentes relacionados y checklist, pero el **detalle** solo mostraba campos generales y evidencias. Al regresar del editor, también podía verse información desactualizada hasta sincronizar. Si la configuración local no incluía preguntas y el backend ya las había guardado en `maintenanceQuestion`, el editor no consultaba ese recurso de respaldo. Un snapshot con `respuestas: {}` podía ocultar valores presentes en `RespuestasJSON`.

## Cambios implementados dentro del PR #9
1. **Mismo editor y mismas reglas.** `ProjectDeviceSections` es la proyección *solo de lectura* del dispositivo. Llama a `questionsForDevice`, `normalizeProjectRelationValue`, `projectChecklistProgressForDevice` y `projectEvidenceTargetValue`; no contiene reglas nuevas de aprobación, validación ni finalización.
2. **Preguntas guardadas y componentes dependientes.** Detalla campos configurables y relaciones activadas (lector, magneto, etc.) desde `respuestas`/`RespuestasJSON`. Cada componente tiene tarjeta plegable con fabricante, modelo, serie, MAC, preguntas específicas, estado de las respuestas y número de evidencias asignadas a ese destino. No crea un dispositivo físico separado ni duplica los datos.
3. **Checklist por equipo.** La pantalla de detalle presenta preguntas, Sí/No, Pendiente/Realizado y notas de pendiente con el porcentaje correspondiente. `DeviceCard` ahora muestra progreso del checklist solo para Proyecto; la misma tarjeta compartida sirve para MANTENIMIENTO y PROYECTO.
4. **Recarga offline.** `useFocusEffect` vuelve a leer el detalle SQLite al regresar de la edición. Las lecturas son secuenciales para evitar el patrón anterior de `database is locked`. El detalle lee el catálogo local una vez: no hay consulta por componente.
5. **Compatibilidad de snapshots.** `questionDetailsForDevice` recupera preguntas desde `questionDetails`, `respuestasDetalle` o `RespuestasJSON.__preguntas`, incluso si `respuestas` está vacío. `deviceSavedAnswers` unifica cómo editor, detalle, catálogos y destinos de evidencia recuperan las respuestas guardadas. Preguntas retiradas del catálogo se muestran como históricas y siguen su política existente.
6. **Catálogo local.** Cuando `maintenance.config` no incluye preguntas, editor y detalle reutilizan `maintenanceQuestion` ya descargado por `syncPull`. No se llama a la API en cada tarjeta.

## Invariantes y alcance
- **No se cambia el modelo operativo.** PostgreSQL sigue siendo autoridad: permisos, estados, validaciones sensibles, catálogo administrativo, auditoría, firmas, finalizaciones y reglas del backend intactos.
- No hay migraciones, permisos nuevos, cambios de API/Render/App Script ni nuevos servicios de Drive/Gemini.
- No se toca la captura, persistencia de fotos, colas `sync_outbox`, idempotencia, ni el horario automático 07:00–17:00 Costa Rica con manual 24/7.
- Se conserva el alta masiva de la etapa 11 y la sección de progreso/evidencias de la etapa 12.
- Los campos aparecen *solo si están almacenados o disponibles localmente*. No se inventan datos cuando el catálogo no se ha descargado.
- La nota Pendiente no significa mantenimiento finalizado; solo describe una pregunta del checklist de ese dispositivo.

## Pruebas
`npm test` incorpora `tests/stage13-project-offline-parity.test.mjs` que ejecuta los dominios TypeScript reales con snapshots JSON:
- relaciones lector/puerta con IDs locales estables, 2 componentes y 3 destinos de evidencia;
- preguntas específicas y separación MANTENIMIENTO / PROYECTO;
- preguntas históricas del snapshot sin catálogo, respuestas del JSON aunque `respuestas: {}`;
- Sí/No, Pendiente/Realizado, nota conservada al volver a leer SQLite;
- componente visual, actualización al recuperar foco y reuso de métodos existentes, sin mutación/red directa;
- protección de la creación masiva (etapa 11) y del progreso (etapa 12).

## Validaciones manuales pendientes
- Descargar Proyecto con puerta/lector/magneto; editar offline con dos lectores, preguntas hijas, datos parciales y nota pendiente; salir y volver al detalle.
- Confirmar que los componentes relacionados tienen IDs estables, reciben fotos a su destino correcto y que el conteo coincide con el editor.
- Cerrar/reabrir Android en modo avión; comprobar que nada desaparezca y que los datos no pertenezcan a otra cuenta.
- Repetir con pregunta administrativa desactivada y comprobar que aparece como histórica (sin crear preguntas nuevas).
- Comprobar sincronización manual fuera de horario y automática dentro del horario permitido con backend de pruebas.
- Confirmar uso fluido en móvil/tablet con cientos de dispositivos y sin errores SQLITE_BUSY.

## Despliegue
Solo nueva APK posterior a merge, revisión de CI y validación física. El PR #9 es la rama existente; no se trabaja sobre `main`. No requiere Render, PostgreSQL, Apps Script ni nuevas variables.
