// Cloudflare Pages -> Cloudflare Worker (mesma origem para cookies seguros).
// Configurar no projeto Pages a Service Binding com nome LUME_API
// apontando para o Worker lume-agenda-vertice-api.
export async function onRequest(context) {
  if (!context.env.LUME_API) {
    return new Response(JSON.stringify({success:false,error:"API não configurada no Pages"}), {
      status:503,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
    });
  }
  return context.env.LUME_API.fetch(context.request);
}