# VotaLive

Votaciones presenciales con Astro, Cloudflare Workers y D1.

## Configuración

1. Instala Node.js 22.12 o posterior y ejecuta `npm install`.
2. Configura el enlace `DB` de D1 en `wrangler.jsonc`.
3. Define `ADMIN_KEY` y `QR_SECRET` (ambos valores aleatorios distintos) en `.dev.vars` para desarrollo. No publiques ese archivo ni entregues las claves a los alumnos.
4. Aplica el esquema local: `npx wrangler d1 migrations apply votalive-db --local`.
5. Regenera tipos con `npm run cf-typegen` tras cambiar enlaces o variables. No edites manualmente `worker-configuration.d.ts`.
6. Inicia con `npm run dev -- --background`. Administra el servidor con `npm run astro -- dev status`, `npm run astro -- dev logs` y `npm run astro -- dev stop`.

La configuración de D1 usa `remote: false` para que el servidor de desarrollo utilice la base local. Aplica las migraciones locales con `npx wrangler d1 migrations apply votalive-db --local`. Las migraciones con `--local` no afectan a la base remota.

## Uso

1. En `/docente`, introduce la clave y crea una votación con 2 a 20 opciones. Se crea en borrador. El panel permite filtrar por texto/estado, consultar participación y reintenta la carga si hay un error de red.
2. En el panel de administración, introduce el código de 12 caracteres y genera credenciales (hasta 100 por lote).
3. Copia las credenciales antes de salir: solo se guardan sus hashes en D1. Entrega una diferente a cada alumno en privado. La credencial autoriza a quien la posea; no verifica la identidad del alumno.
4. Abre la votación desde el panel. Después de abrir no se generan más credenciales.
5. Abre el QR temporal desde el listado docente y proyecta la imagen generada; rota cada 30 segundos. El alumno escanea el QR, luego puede entrar por `/alumno` con el código y votar con su credencial. La cookie de presencia dura 10 minutos. Se admite un voto por credencial y votación.
6. Cierra desde el panel tras confirmar. Una votación cerrada no se puede reabrir. Los resultados se actualizan cada 2 segundos mientras está abierta; al cerrar, el panel permite descargar el acta CSV con ganador o empate.

El panel incluye modo oscuro persistente. Los resultados requieren la clave docente y muestran barras, porcentaje, total, autorizados, pendientes y porcentaje de participación.

La creación bloquea envíos simultáneos en el navegador. Todavía no hay idempotencia de creación en el servidor: un reintento manual tras perder una respuesta puede crear otra votación.

## Verificación y despliegue

- `npm run build`: compila el proyecto.
- `node --test tests/voting.test.mjs`: verifica las restricciones del voto usando SQLite en memoria (Node.js 22.13 o posterior).
- `npx wrangler secret put ADMIN_KEY`: configura la clave en Cloudflare.
- `npx wrangler secret put QR_SECRET`: configura la firma del QR y la cookie de presencia; debe ser un secreto distinto.
- `npx wrangler d1 migrations apply votalive-db --remote`: aplica migraciones remotas; comprueba primero la base configurada.
- `npm run deploy`: compila y publica.

## Estructura

- `src/pages/`: páginas y API de creación, consulta, administración y votos.
- `src/layouts/MainLayout.astro`: estructura compartida.
- `src/styles/global.css`: estilos.
- `src/lib/credentials.ts`: hash de credenciales por votación.
- `migrations/`: esquema de D1.

La clave docente es compartida y provisional. No hay cuentas individuales de docentes. El QR temporal reduce el acceso casual, pero no demuestra presencia física porque puede retransmitirse.

## Retos y casos reproducibles

Lista implementada: filtros del panel; validaciones de pregunta/opciones repetidas y límites; QR rotativo y oculto al vencer; indicadores de participación con cero autorizados; confirmación y bloqueo del cierre; acta CSV con BOM, ganador/empate y mitigación de fórmulas; estados de carga, errores y reintentos; electivos E1 (modo oscuro accesible) y E5 (indicador de conexión y reintento controlado); barras de resultados; casos de validación reproducibles.

Casos de aceptación manual (usar una base local y credenciales descartables):

| Caso | Pasos | Resultado esperado |
| --- | --- | --- |
| TC01 | Crear encuesta con dos opciones únicas | Se crea y aparece con 0 autorizados y 0% de participación. |
| TC02 | Crear con una opción repetida (incluye diferencia solo de mayúsculas) | Error junto a opciones; no se crea. |
| TC03 | Crear con 1 opción, 21 opciones o título menor a 5 caracteres | Error de validación; no se crea. |
| TC04 | Filtrar panel por parte del título, código y estado | Lista coincide con filtros; combinación vacía comunica que no hay coincidencias. |
| TC05 | Abrir QR, escanearlo y esperar su vencimiento | Se acepta QR vigente; la imagen desaparece al vencer y el enlace vencido da 403. |
| TC06 | Canjear una credencial de QR vencido | Acceso rechazado; no se emite cookie de presencia. |
| TC07 | Abrir votación, emitir un voto y reutilizar credencial | Primer voto suma 1; repetición responde 409 sin cambiar conteo. |
| TC08 | Cerrar una encuesta y tratar de votar con una cookie aún vigente | La API rechaza el voto; resultados quedan definitivos. |
| TC09 | Cerrar sin confirmar y luego confirmar | Cancelar conserva la encuesta abierta; confirmar la cierra una sola vez. |
| TC10 | Desconectar red al cargar panel/resultados y reconectar | Mensaje de error útil y reintento controlado recupera la consulta. |
| TC11 | Descargar CSV de elección cerrada con empate y texto que empieza con `=` | Incluye fecha, código, total, empate, BOM y celda escapada; no contiene credenciales. |
| TC12 | Cambiar tema y recargar | Preferencia accesible persiste en el navegador. |

`node --test tests/voting.test.mjs` verifica localmente estados, credenciales y voto único. Los casos TC01–TC12 completan las comprobaciones de interfaz y del flujo QR.
