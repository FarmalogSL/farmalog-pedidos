export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, database: !!env.DB });
    }

    if (url.pathname === "/api/farmacia" && request.method === "POST") {
      const d = await request.json();
      await env.DB.prepare(`INSERT INTO farmacias
        (clave,nombre,nif,direccion,cp,localidad,provincia,telefono,email,actualizado)
        VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(clave) DO UPDATE SET
        nombre=excluded.nombre,nif=excluded.nif,direccion=excluded.direccion,
        cp=excluded.cp,localidad=excluded.localidad,provincia=excluded.provincia,
        telefono=excluded.telefono,email=excluded.email,actualizado=CURRENT_TIMESTAMP`)
        .bind(d.clave,d.nombre,d.nif,d.direccion,d.cp,d.localidad,d.provincia,d.telefono,d.email).run();
      return Response.json({ok:true});
    }

    if (url.pathname === "/api/codigo-cooperativista" && request.method === "POST") {
      const d = await request.json();
      await env.DB.prepare(`INSERT INTO codigos_cooperativista
        (farmacia_clave,cooperativa,codigo,actualizado) VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(farmacia_clave,cooperativa) DO UPDATE SET codigo=excluded.codigo,actualizado=CURRENT_TIMESTAMP`)
        .bind(d.farmaciaClave,d.cooperativa,d.codigo).run();
      return Response.json({ok:true});
    }

    return env.ASSETS.fetch(request);
  }
};
