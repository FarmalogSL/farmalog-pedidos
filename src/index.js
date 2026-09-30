const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json; charset=utf-8"}});
const keyFor = d => String(d.nif || d.codigoCooperativa || d.nombre || "").trim().toUpperCase();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return json({ok:true,database:!!env.DB});

      if (url.pathname === "/api/datos" && request.method === "GET") {
        const clave = url.searchParams.get("clave") || "";
        const cooperativa = url.searchParams.get("cooperativa") || "";
        if (!clave) return json({farmacia:null,codigo:""});
        const farmacia = await env.DB.prepare("SELECT * FROM farmacias WHERE clave=?").bind(clave).first();
        const codigo = await env.DB.prepare("SELECT codigo FROM codigos_cooperativista WHERE farmacia_clave=? AND cooperativa=?").bind(clave, cooperativa).first();
        return json({farmacia:farmacia||null,codigo:codigo?.codigo||""});
      }

      if (url.pathname === "/api/pedido" && request.method === "POST") {
        const d = await request.json();
        const f = d.farmacia || {};
        const clave = keyFor(f);
        if (!clave || !f.nombre || !f.nif || !f.direccion || !f.cp || !f.localidad || !f.provincia || !d.cooperativa || !d.codigoCooperativista || (!f.telefono && !f.email)) return json({ok:false,error:"Faltan datos obligatorios"},400);
        const statements = [
          env.DB.prepare(`INSERT INTO farmacias (clave,nombre,nif,direccion,cp,localidad,provincia,telefono,email,actualizado) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(clave) DO UPDATE SET nombre=excluded.nombre,nif=excluded.nif,direccion=excluded.direccion,cp=excluded.cp,localidad=excluded.localidad,provincia=excluded.provincia,telefono=excluded.telefono,email=excluded.email,actualizado=CURRENT_TIMESTAMP`).bind(clave,f.nombre,f.nif,f.direccion,f.cp,f.localidad,f.provincia,f.telefono||"",f.email||""),
          env.DB.prepare(`INSERT INTO codigos_cooperativista (farmacia_clave,cooperativa,codigo,actualizado) VALUES (?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(farmacia_clave,cooperativa) DO UPDATE SET codigo=excluded.codigo,actualizado=CURRENT_TIMESTAMP`).bind(clave,d.cooperativa,d.codigoCooperativista),
          env.DB.prepare("INSERT INTO pedidos (id,fecha,farmacia_clave,cooperativa,codigo_cooperativista,estado) VALUES (?,?,?,?,?,?)").bind(d.id,new Date().toISOString(),clave,d.cooperativa,d.codigoCooperativista,"Registrado")
        ];
        await env.DB.batch(statements);
        return json({ok:true,clave});
      }

      return env.ASSETS.fetch(request);
    } catch (e) { return json({ok:false,error:e.message||"Error interno"},500); }
  }
};
