import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
export const prerender = false;
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
async function sign(secret:string,payload:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));}
export const GET: APIRoute = async ({request,params}) => {
  if(!env.ADMIN_KEY||request.headers.get("x-admin-key")!==env.ADMIN_KEY)return Response.json({error:"No autorizado"},{status:401});
  const code=params.code?.toUpperCase()??"";if(!/^[A-F0-9]{12}$/.test(code))return Response.json({error:"Código inválido"},{status:400});
  if(!env.QR_SECRET)return Response.json({error:"El acceso temporal no está configurado"},{status:503});
  try {
  const poll=await env.DB.prepare("SELECT status FROM polls WHERE code=?").bind(code).first<{status:string}>();
  if(!poll)return Response.json({error:"Votación no encontrada"},{status:404});if(poll.status!=="open")return Response.json({error:"El acceso temporal solo funciona con una votación abierta"},{status:409});
  const slot=Math.floor(Date.now()/30000);const sig=await sign(env.QR_SECRET,`qr:${code}:${slot}`);const url=new URL(`/acceso?code=${code}&slot=${slot}&sig=${sig}`,request.url).toString();
  return Response.json({url,expiresAt:(slot+1)*30000},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { console.error("Error generando QR temporal:",error); return Response.json({error:"No se pudo generar el acceso temporal"},{status:500}); }
};
