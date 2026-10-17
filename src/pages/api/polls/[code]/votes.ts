import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hashCredential } from "../../../../lib/credentials";

const encode = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
async function validPresence(request: Request, code: string) {
  if (!env.QR_SECRET) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`votalive_${code}=`));
  const token = cookie?.slice(`votalive_${code}=`.length) ?? "";
  const [expiresText, signature] = token.split("."); const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now()/1000) || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.QR_SECRET), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
  const raw = signature.replaceAll("-","+").replaceAll("_","/"); const padded=raw+"=".repeat((4-raw.length%4)%4);
  let bytes: Uint8Array; try { bytes=Uint8Array.from(atob(padded),(c)=>c.charCodeAt(0)); } catch { return false; }
  return crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(`presence:${code}:${expires}`));
}

export const POST: APIRoute = async ({ request, params }) => {
  const code = params.code?.toUpperCase() ?? "";
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!/^[A-F0-9]{12}$/.test(code) || !body || typeof body !== "object" ||
      typeof body.optionId !== "string" || body.optionId.length > 100 ||
      typeof body.credential !== "string" || !/^[a-f0-9]{32}$/.test(body.credential)) {
    return Response.json({ error: "Datos del voto inválidos" }, { status: 400 });
  }
  if (!await validPresence(request, code)) return Response.json({ error: "Escanea el QR vigente en el aula antes de votar." }, { status: 403 });
  try {
    const poll = await env.DB.prepare("SELECT id FROM polls WHERE code = ?").bind(code).first<{id: string}>();
    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    // La comprobación de estado y el voto se ejecutan en una sola operación.
    const result = await env.DB.prepare(`INSERT INTO votes (id, poll_id, option_id, participant_id)
      SELECT ?, p.id, o.id, a.id FROM polls p
      JOIN options o ON o.poll_id = p.id AND o.id = ?
      JOIN participants a ON a.poll_id = p.id AND a.credential_hash = ?
      WHERE p.id = ? AND p.status = 'open'
      ON CONFLICT (poll_id, participant_id) DO NOTHING`)
      .bind(crypto.randomUUID(), body.optionId, await hashCredential(poll.id, body.credential), poll.id).run();
    if (!result.meta.changes) return Response.json({ error: "No se pudo registrar: comprueba tu credencial, que la votación esté abierta y que no hayas votado antes." }, { status: 409 });
    return Response.json({ message: "Voto registrado correctamente" }, { status: 201 });
  } catch (error) {
    console.error("Error registrando voto:", error);
    return Response.json({ error: "No se pudo registrar el voto" }, { status: 500 });
  }
};
