import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
export const prerender = false;
const cell = (value: unknown) => { let text = String(value ?? ""); if (/^\s*[=+\-@\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
export const GET: APIRoute = async ({ request, params }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) return Response.json({ error: "No autorizado" }, { status: 401 });
  const code=params.code?.toUpperCase() ?? ""; if(!/^[A-F0-9]{12}$/.test(code)) return Response.json({error:"Código inválido"},{status:400});
  try {
    const poll=await env.DB.prepare("SELECT id,code,question,status,created_at,closed_at FROM polls WHERE code=?").bind(code).first<any>();
    if(!poll) return Response.json({error:"Votación no encontrada"},{status:404}); if(poll.status!=="closed") return Response.json({error:"El acta está disponible después del cierre"},{status:409});
    const {results}=await env.DB.prepare(`SELECT o.name,COUNT(v.id) AS votes FROM options o LEFT JOIN votes v ON v.option_id=o.id AND v.poll_id=o.poll_id WHERE o.poll_id=? GROUP BY o.id,o.name,o.position ORDER BY o.position`).bind(poll.id).all<any>();
    const total=results.reduce((n:number,row:any)=>n+Number(row.votes),0); const high=Math.max(0,...results.map((row:any)=>Number(row.votes))); const winners=high?results.filter((row:any)=>Number(row.votes)===high).map((row:any)=>row.name):[]; const summary=winners.length===0?"Sin votos":winners.length>1?`Empate: ${winners.join(", ")}`:`Ganador: ${winners[0]}`;
    const rows=[["Acta de votación"],["Pregunta",poll.question],["Código",poll.code],["Creada",poll.created_at],["Cerrada",poll.closed_at ?? ""],["Resumen",summary],["Total de votos",total],["Opción","Votos","Porcentaje"],...results.map((row:any)=>[row.name,Number(row.votes),total?(Number(row.votes)*100/total).toFixed(2):"0.00%"].map((x:any,i:number)=>i===2?x:`${x}`))];
    const csv="\uFEFF"+rows.map((row)=>row.map(cell).join(",")).join("\r\n");
    return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="votalive-${code}.csv"`,"Cache-Control":"no-store"}});
  } catch(error) { console.error("Error exportando acta:",error); return Response.json({error:"No se pudo generar el acta"},{status:500}); }
};
