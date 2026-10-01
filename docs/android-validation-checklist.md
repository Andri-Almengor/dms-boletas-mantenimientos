# Validación Android — DMS Mantenimientos

Este checklist corresponde a la primera APK instalable de la app móvil.

## Tipo de build

### APK de CI

El workflow `Android APK` genera un `app-debug.apk` instalable para pruebas técnicas.

- No contiene secretos.
- Usa la configuración nativa real generada por Expo Prebuild.
- Permite validar SQLite, cámara, galería, video, firma y BackgroundTask.
- La firma debug del runner no se considera una identidad de distribución estable. Si una APK de CI futura no puede actualizar la anterior, se debe desinstalar la build debug de prueba.

### EAS preview

Para distribución interna estable:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npm run build:apk
```

El perfil `preview` produce APK e instala con las credenciales Android gestionadas por EAS. No guardar keystores, tokens ni credenciales en el repositorio.

Para Play Store:

```bash
npm run build:aab
```

El perfil `production` produce AAB.

## Instalación inicial

1. Instalar la APK en un Android físico.
2. Confirmar que el paquete instalado es `com.solutionsdms.dmsmantenimientos`.
3. Abrir la app sin conexión.
4. Confirmar que la app inicia y SQLite abre/migra sin error.
5. Conectar Internet e iniciar sesión con un usuario real autorizado.
6. Ejecutar **Sincronizar ahora**.
7. Cerrar y abrir la app.
8. Confirmar que la sesión, mantenimientos descargados y estado local permanecen disponibles.

## Flujo offline completo

Con una sincronización previa realizada:

1. Activar modo avión.
2. Abrir Pendientes.
3. Abrir un mantenimiento descargado.
4. Editar datos permitidos.
5. Agregar un dispositivo.
6. Editar el dispositivo.
7. Completar preguntas dinámicas.
8. Tomar fotografías.
9. Seleccionar fotografías de galería.
10. Grabar o seleccionar video.
11. Editar metadatos de evidencias.
12. Eliminar una evidencia local.
13. Dibujar firma con dedo/stylus.
14. Guardar firma.
15. Solicitar finalización cuando el usuario tenga el permiso existente.
16. Cerrar completamente la app.
17. Volver a abrir todavía sin red.
18. Confirmar que todos los cambios siguen presentes y pendientes.

## Recuperación de red

Dentro de `07:00 <= hora < 17:00` en `America/Costa_Rica`:

1. Con cambios offline pendientes, recuperar Internet.
2. Confirmar que la app dispara el mismo SyncCoordinator automáticamente.
3. Confirmar PULL → reconciliación → PUSH → PULL final.
4. Confirmar que dispositivos/evidencias/firma aparecen en la web.
5. Confirmar que una finalización pendiente se envía después de sus operaciones dependientes.
6. Confirmar que no aparecen duplicados.

Fuera de la ventana:

1. Crear cambios locales.
2. Recuperar Internet.
3. Confirmar que **no** comienza sincronización automática.
4. Confirmar estado **Fuera de horario** / cambios pendientes.
5. Pulsar **Sincronizar ahora**.
6. Confirmar que la sincronización manual sí funciona.

## Límite de las 17:00

En una prueba controlada:

1. Iniciar sincronización automática antes de las 17:00 con varias evidencias pendientes.
2. Permitir que una unidad de upload esté en curso al cruzar las 17:00.
3. Confirmar que esa unidad puede terminar.
4. Confirmar que no se inicia una nueva unidad automática después de las 17:00.
5. Confirmar que el resto permanece en outbox.
6. Ejecutar sincronización manual y comprobar que puede completar el resto.

## Evidencias grandes

1. Usar un video mayor al umbral de 6 MB y dentro del máximo permitido.
2. Confirmar upload segmentado.
3. Cambiar app a background/foreground durante una prueba controlada.
4. Confirmar que no aparece una segunda sincronización concurrente.
5. Confirmar que no quedan duplicados.
6. Confirmar que una interrupción recuperable deja la operación pendiente/reintentable.

## BackgroundTask

BackgroundTask es diferible: Android decide cuándo ejecutarlo.

Validar en la APK/build propia, no depender de Expo Go:

1. Iniciar sesión.
2. Tener cambios pendientes dentro del horario automático.
3. Mandar la app a background.
4. Confirmar posteriormente que el worker puede ejecutar sin abrir un segundo motor de sync.
5. Confirmar que fuera de 07:00–17:00 el worker retorna sin hacer llamadas remotas.

No considerar fallo que Android posponga el task; no existe garantía de ejecución exacta.

## Conflictos

1. Descargar un mantenimiento.
2. Editar el mismo campo offline en móvil.
3. Cambiar ese campo en web.
4. Sincronizar móvil.
5. Confirmar `SYNC_CONFLICT`.
6. Confirmar que el cambio no se fuerza automáticamente.
7. Confirmar que el estado visual indica conflicto.

También validar borrado remoto con cambios offline locales.

## Actualización de build

Para validar preservación de datos entre versiones se deben usar APKs firmadas con la misma clave.

- EAS preview: apto para esta validación.
- APK debug de runners distintos: no asumir compatibilidad de firma.

Con dos builds EAS preview consecutivas:

1. Instalar build A.
2. Crear datos pendientes offline.
3. Instalar build B como actualización, sin desinstalar A.
4. Confirmar que SQLite, outbox, archivos locales y sesión siguen disponibles.
5. Confirmar que migraciones SQLite se ejecutan incrementalmente.
6. Sincronizar y validar datos en web.

## Criterio de salida

La APK se considera validada cuando:

- no pierde datos al cerrar/reabrir;
- permite el flujo operativo offline acordado;
- no sincroniza automáticamente fuera de horario;
- manual funciona 24/7;
- no hay doble sync foreground/background;
- evidencia/firma sobreviven reinicios;
- conflictos no sobrescriben datos silenciosamente;
- datos sincronizados coinciden con la web;
- backend continúa siendo la fuente de verdad;
- no hay secretos dentro del APK ni del repositorio.
