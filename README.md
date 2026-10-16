# VotaLive

Votaciones presenciales con Astro, Cloudflare Workers y D1.

## Configuración

1. Instala Node.js 22.12 o posterior y ejecuta `npm install`.
2. Configura el enlace `DB` de D1 en `wrangler.jsonc`.
3. Define `ADMIN_KEY` en `.dev.vars` para desarrollo. No publiques ese archivo ni entregues la clave a los alumnos.
4. Aplica el esquema local: `npx wrangler d1 migrations apply votalive-db --local`.
5. Regenera tipos con `npm run cf-typegen` tras cambiar enlaces o variables. No edites manualmente `worker-configuration.d.ts`.
6. Inicia con `npm run dev -- --background`. Administra el servidor con `npm run astro -- dev status`, `npm run astro -- dev logs` y `npm run astro -- dev stop`.

La configuración actual tiene `remote: true` en D1: el servidor de desarrollo usa la base remota. Para usar datos locales, elimina esa propiedad o cámbiala a `false` antes de iniciar. Las migraciones con `--local` no afectan a la base remota.

## Uso

1. En `/docente`, introduce la clave y crea una votación con 2 a 20 opciones. Se crea en borrador.
2. En el panel de administración, introduce el código de 12 caracteres y genera credenciales (hasta 100 por lote).
3. Copia las credenciales antes de salir: solo se guardan sus hashes en D1. Entrega una diferente a cada alumno en privado. La credencial autoriza a quien la posea; no verifica la identidad del alumno.
4. Abre la votación desde el panel. Después de abrir no se generan más credenciales.
5. Los alumnos entran por `/alumno` con el código y votan con su credencial. Se admite un voto por credencial y votación.
6. Cierra desde el panel. Una votación cerrada no se puede reabrir.

La creación bloquea envíos simultáneos en el navegador. Todavía no hay idempotencia de creación en el servidor: un reintento manual tras perder una respuesta puede crear otra votación.

## Verificación y despliegue

- `npm run build`: compila el proyecto.
- `node --test tests/voting.test.mjs`: verifica las restricciones del voto usando SQLite en memoria (Node.js 22.13 o posterior).
- `npx wrangler secret put ADMIN_KEY`: configura la clave en Cloudflare.
- `npx wrangler d1 migrations apply votalive-db --remote`: aplica migraciones remotas; comprueba primero la base configurada.
- `npm run deploy`: compila y publica.

## Estructura

- `src/pages/`: páginas y API de creación, consulta, administración y votos.
- `src/layouts/MainLayout.astro`: estructura compartida.
- `src/styles/global.css`: estilos.
- `src/lib/credentials.ts`: hash de credenciales por votación.
- `migrations/`: esquema de D1.

La clave docente es compartida y provisional. No hay cuentas individuales de docentes ni pantalla de resultados.
