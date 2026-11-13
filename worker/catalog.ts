// Catálogo editable desde el panel de administración: trolls (con su foto), ajustes de jugadores y plantillas del ticker.
// Vive en el almacenamiento propio de un Durable Object (sin base de datos).
const MAX_IMG = 1_800_000;

function imagen(dataUrl: unknown): ArrayBuffer | null {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/(?:webp|png|jpeg);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[1]);
  if (bin.length > MAX_IMG) return null;
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
const nuevoId = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const limpio = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

export class CatalogDO implements DurableObject {
  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const s = this.state.storage;
    const ruta = new URL(req.url).pathname;
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
    const ok = (extra: object = {}) => Response.json({ ok: true, ...extra });
    const mal = (error: string) => Response.json({ ok: false, error }, { status: 400 });

    // Memoria de lo que salió en las últimas 2 partidas (de cualquier sala), para que las partidas sean variadas.
    if (ruta === '/recientes') {
      const guardado = (await s.get<{ partidas: { j: string[]; t: string[] }[] }>('recientes')) ?? { partidas: [] };
      if (req.method === 'POST') {
        const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 400) : []);
        guardado.partidas = [...guardado.partidas, { j: lista(body.jugadores), t: lista(body.trolls) }].slice(-2);
        await s.put('recientes', guardado);
        return ok();
      }
      const nivel = { jugadores: {} as Record<string, number>, trolls: {} as Record<string, number> };
      guardado.partidas.forEach((p, i) => {
        const v = i === guardado.partidas.length - 1 ? 2 : 1;
        for (const id of p.j) nivel.jugadores[id] = Math.max(nivel.jugadores[id] ?? 0, v);
        for (const id of p.t) nivel.trolls[id] = Math.max(nivel.trolls[id] ?? 0, v);
      });
      return Response.json(nivel);
    }

    if (ruta === '/datos') {
      const trolls = [...(await s.list({ prefix: 'troll:' })).values()];
      const overrides: Record<string, unknown> = {};
      for (const [k, v] of await s.list({ prefix: 'jug:' })) overrides[k.slice(4)] = v;
      const extras = [...(await s.list({ prefix: 'extra:' })).values()];
      const plantillas = (await s.get('plantillas')) ?? { custom: [], apagadas: [] };
      return Response.json({ trolls, overrides, extras, plantillas });
    }

    const img = ruta.match(/^\/img\/(troll|jugador)\/([\w-]+)$/);
    if (img) {
      const b = await s.get<ArrayBuffer>(`img:${img[1]}:${img[2]}`);
      return b ? new Response(b, { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } }) : new Response('no', { status: 404 });
    }

    // ── Trolls ──
    if (ruta === '/troll' && req.method === 'POST') {
      const b = imagen(body.imagen);
      if (!b) return mal('imagen inválida o muy pesada');
      const id = nuevoId('t');
      const nombre = limpio(body.nombre, 30);
      await s.put(`img:troll:${id}`, b);
      await s.put(`troll:${id}`, { id, nombre, descripcion: limpio(body.descripcion, 140), precioMinimo: num(body.precioMinimo, 1, 100, 8), rating: 40, activo: true, pendiente: !nombre, opaca: !!body.opaca, v: Date.now() });
      return ok({ id });
    }
    const t = ruta.match(/^\/troll\/([\w-]+)$/);
    if (t) {
      const actual = await s.get<Record<string, unknown>>(`troll:${t[1]}`);
      if (!actual) return mal('no existe');
      if (req.method === 'DELETE') {
        await s.delete([`troll:${t[1]}`, `img:troll:${t[1]}`]);
        return ok();
      }
      const n = { ...actual };
      if ('nombre' in body) n.nombre = limpio(body.nombre, 30);
      if ('descripcion' in body) n.descripcion = limpio(body.descripcion, 140);
      if ('precioMinimo' in body) n.precioMinimo = num(body.precioMinimo, 1, 100, 8);
      if ('activo' in body) n.activo = !!body.activo;
      if ('carta' in body) {
        const c = body.carta;
        const ok3 = Array.isArray(c) && c.length === 3 && c.every((x) => typeof x === 'number' && Number.isFinite(x));
        const lim = (v: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, v)) * 100) / 100;
        if (ok3) n.carta = [lim(c[0], -80, 80), lim(c[1], -80, 80), lim(c[2], 0.4, 2.2)];
        else delete n.carta;
      }
      if ('rostro' in body) {
        const r = body.rostro;
        const ok4 = Array.isArray(r) && r.length === 4 && r.every((x) => typeof x === 'number' && Number.isFinite(x));
        const entre = (v: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, v)) * 1000) / 1000;
        if (ok4) n.rostro = [entre(r[0], 0, 1), entre(r[1], 0, 1), entre(r[2], 0.05, 1), entre(r[3], 0.2, 5)];
        else delete n.rostro;
      }
      if (body.imagen) {
        const b = imagen(body.imagen);
        if (!b) return mal('imagen inválida o muy pesada');
        await s.put(`img:troll:${t[1]}`, b);
        n.v = Date.now();
        n.opaca = !!body.opaca;
        if (!('rostro' in body)) delete n.rostro; // otra foto: hay que volver a ubicar la cara
        if (!('carta' in body)) delete n.carta;
      }
      n.pendiente = !n.nombre;
      await s.put(`troll:${t[1]}`, n);
      return ok();
    }

    // ── Jugadores ──
    if (ruta === '/jugador' && req.method === 'POST') {
      const b = imagen(body.imagen);
      if (!b) return mal('hace falta una foto (recortada, de frente)');
      const pos = limpio(body.pos, 4);
      if (!['POR', 'LD', 'DFC', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'DC', 'EI'].includes(pos)) return mal('posición inválida');
      const nombre = limpio(body.nombre, 24);
      if (!nombre) return mal('falta el nombre');
      const id = nuevoId('x');
      const precio = num(body.precioMinimo, 1, 300, 40);
      const rareza = precio >= 150 ? 'leyenda' : precio >= 100 ? 'prime' : precio >= 60 ? 'oro' : precio >= 30 ? 'plata' : 'comun';
      await s.put(`img:jugador:${id}`, b);
      await s.put(`extra:${id}`, { id, nombre, apellido: limpio(body.apellido, 24), pos, pais: limpio(body.pais, 24), rating: num(body.rating, 40, 99, 75), rareza, precioMinimo: precio, etiqueta: limpio(body.etiqueta, 40) || rareza.toUpperCase(), dato: limpio(body.dato, 140), fotos: [], fotoV: Date.now() });
      return ok({ id });
    }
    const j = ruta.match(/^\/jugador\/([\w-]+)$/);
    if (j) {
      const id = j[1];
      if (id.startsWith('x-')) {
        if (req.method === 'DELETE') {
          await s.delete([`extra:${id}`, `img:jugador:${id}`]);
          return ok();
        }
        const e = await s.get<Record<string, unknown>>(`extra:${id}`);
        if (!e) return mal('no existe');
        await s.put(`extra:${id}`, await this.aplicar(e, body, id));
        return ok();
      }
      if (req.method === 'DELETE') {
        await s.delete([`jug:${id}`, `img:jugador:${id}`]);
        return ok();
      }
      const o = (await s.get<Record<string, unknown>>(`jug:${id}`)) ?? {};
      await s.put(`jug:${id}`, await this.aplicar(o, body, id));
      return ok();
    }

    if (ruta === '/plantillas' && req.method === 'PUT') {
      const custom = (Array.isArray(body.custom) ? body.custom : []).slice(0, 200).map((p: Record<string, unknown>) => ({ id: limpio(p.id, 20) || nuevoId('c'), disparador: limpio(p.disparador, 20), intensidad: num(p.intensidad, 1, 3, 2), texto: limpio(p.texto, 180), activo: p.activo !== false }));
      const apagadas = (Array.isArray(body.apagadas) ? body.apagadas : []).map((x: unknown) => limpio(x, 20)).slice(0, 300);
      await s.put('plantillas', { custom, apagadas });
      return ok();
    }
    return new Response('no encontrado', { status: 404 });
  }

  /** Aplica los campos editables de un jugador (y su foto nueva, si viene). */
  private async aplicar(base: Record<string, unknown>, body: Record<string, unknown>, id: string) {
    const n = { ...base };
    if ('precioMinimo' in body) {
      n.precioMinimo = num(body.precioMinimo, 1, 300, 40);
      const p = n.precioMinimo as number;
      n.rareza = p >= 150 ? 'leyenda' : p >= 100 ? 'prime' : p >= 60 ? 'oro' : p >= 30 ? 'plata' : 'comun';
    }
    for (const [k, max] of [['nombre', 24], ['apellido', 24], ['pais', 24], ['etiqueta', 40], ['dato', 140]] as const) if (k in body) n[k] = limpio(body[k], max);
    if ('rating' in body) n.rating = num(body.rating, 40, 99, 75);
    if (body.imagen) {
      const b = imagen(body.imagen);
      if (b) {
        await this.state.storage.put(`img:jugador:${id}`, b);
        n.fotoV = Date.now();
      }
    }
    return n;
  }
}
