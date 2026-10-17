type Runtime = import("@astrojs/cloudflare").Runtime;

declare namespace App {
	interface Locals extends Runtime {}
}

// Wrangler no incluye automáticamente los secrets de entorno en el typegen.
declare namespace Cloudflare {
	interface Env { QR_SECRET: string }
}
