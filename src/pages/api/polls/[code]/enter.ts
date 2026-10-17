import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
export const prerender=false;
const b64=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
async function sign(payload:string){const secret=env.QR_SECRET;if(!secret)throw new Error("QR_SECRET no configurado");const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));}
async function verify(payload:string,signature:string){try{const raw=signature.replaceAll("-","+").replaceAll("_","/");const bytes=Uint8Array.from(atob(raw+"=".repeat((4-raw.length%4)%4)),(c)=>c.charCodeAt(0));const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.QR_SECRET!),{name:"HMAC",hash:"SHA-256"},false,["verify"]);return await crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(payload));}catch{return false;}}
export const POST: APIRoute=async({request,params})=>{
 const code=params.code?.toUpperCase()??"";if(!/^[A-F0-9]{12}$/.test(code)||!env.QR_SECRET)return Response.json({error:"Acceso no disponible"},{status:403});
 let body:any;try{body=await request.json()}catch{return Response.json({error:"Solicitud inválida"},{status:400})}
 const slot=Number(body?.slot);const signature=String(body?.sig??"");const current=Math.floor(Date.now()/30000);
 if(!Number.isInteger(slot)||slot!==current)return Response.json({error:"El QR venció. Solicita al docente que lo renueve."},{status:403});
 if(!await verify(`qr:${code}:${slot}`,signature))return Response.json({error:"Acceso temporal no válido"},{status:403});
 const poll=await env.DB.prepare("SELECT status FROM polls WHERE code=?").bind(code).first<{status:string}>();if(!poll||poll.status!=="open")return Response.json({error:"La votación no está abierta"},{status:403});
 const expires=Math.floor(Date.now()/1000)+600;const token=`${expires}.${await sign(`presence:${code}:${expires}`)}`;
 // En HTTPS la cookie siempre es Secure. En HTTP se admite solo para demos locales por LAN.
 const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
 return Response.json({ok:true},{headers:{"Set-Cookie":`votalive_${code}=${token}; Path=/api/polls/${code}/; HttpOnly${secure}; SameSite=Strict; Max-Age=600`,"Cache-Control":"no-store"}});
};
