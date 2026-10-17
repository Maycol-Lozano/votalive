import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
export const prerender = false;
export const GET: APIRoute = async ({ request, params }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) return Response.json({ error: "No autorizado" }, { status: 401 });
  const code = params.code?.toUpperCase() ?? "";
  if (!/^[A-F0-9]{12}$/.test(code)) return Response.json({ error: "Código inválido" }, { status: 400 });
  try {
    const poll = await env.DB.prepare("SELECT id,code,question,status,created_at,closed_at FROM polls WHERE code=?").bind(code).first<any>();
    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    const { results } = await env.DB.prepare(`SELECT o.id,o.name,COUNT(v.id) AS votes FROM options o
      LEFT JOIN votes v ON v.option_id=o.id AND v.poll_id=o.poll_id WHERE o.poll_id=?
      GROUP BY o.id,o.name,o.position ORDER BY o.position`).bind(poll.id).all<any>();
    const authorized = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM participants WHERE poll_id=?").bind(poll.id).first<any>())?.n ?? 0);
    const total = results.reduce((sum: number, row: any) => sum + Number(row.votes), 0);
    const max = Math.max(0, ...results.map((row: any) => Number(row.votes)));
    const leaders = max ? results.filter((row: any) => Number(row.votes) === max).map((row: any) => row.name) : [];
    return Response.json({ ...poll, authorized, total, pending: Math.max(0, authorized-total), participation: authorized ? total*100/authorized : 0, winner: leaders.length === 1 ? leaders[0] : null, tied: leaders.length > 1, options: results.map((row: any) => ({...row, votes:Number(row.votes), percentage:total ? Number(row.votes)*100/total : 0})) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Error consultando resultados:", error); return Response.json({ error: "No se pudieron consultar los resultados" }, { status: 500 }); }
};
