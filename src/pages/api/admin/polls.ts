import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { results } = await env.DB.prepare(`SELECT p.code,p.question,p.status,p.created_at,
      (SELECT COUNT(*) FROM votes v WHERE v.poll_id=p.id) AS total_votes,
      (SELECT COUNT(*) FROM participants pt WHERE pt.poll_id=p.id) AS authorized
      FROM polls p ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).all();
    return Response.json({ polls: results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Error listando votaciones:", error); return Response.json({ error: "No se pudo cargar el listado" }, { status: 500 }); }
};
