// Entrada del Worker: API + enrutado a los Durable Objects. El frontend lo sirven los assets estáticos.
import trollsJson from '../data/trolls.json';
import jugadoresJson from '../data/players.json';
import tickerJson from '../data/ticker.json';
import { CatalogoDatos, jugadoresFinal, trollsFinal } from '../shared/catalogo';
import type { Jugador, Troll } from '../shared/types';

export { RoomDO } from './room';
export { RegistryDO } from './registry';
export { CatalogDO } from './catalog';

interface Env {
  ROOM: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
  CATALOG: DurableObjectNamespace;
  ASSETS?: Fetcher;
  /** En producción los archivos estáticos viven en KV (ver scripts/publicar.mjs). */
  ARCHIVOS?: KVNamespace;
  ADMIN_PIN: string;
}

const TIPOS: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mp3: 'audio/mpeg', woff2: 'font/woff2' };

/** Sirve un archivo estático: en local desde los assets de wrangler, en producción desde KV. */
async function servir(env: Env, req: Request): Promise<Response> {
  if (env.ASSETS) return env.ASSETS.fetch(req);
  if (!env.ARCHIVOS) return new Response('sin archivos', { status: 500 });
  let ruta = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
  let cuerpo = ruta ? await env.ARCHIVOS.get(ruta, 'arrayBuffer') : null;
  if (!cuerpo) {
    // Cualquier ruta que no sea un archivo es una pantalla de la app.
    if (/\.[a-z0-9]+$/i.test(ruta)) return new Response('no encontrado', { status: 404 });
    ruta = 'index.html';
    cuerpo = await env.ARCHIVOS.get(ruta, 'arrayBuffer');
    if (!cuerpo) return new Response('no encontrado', { status: 404 });
  }
  const ext = ruta.split('.').pop() ?? '';
  const cache = ruta.startsWith('assets/') ? 'public, max-age=31536000, immutable' : ruta === 'index.html' ? 'no-cache' : 'public, max-age=3600';
  return new Response(cuerpo, { headers: { 'content-type': TIPOS[ext] ?? 'application/octet-stream', 'cache-control': cache } });
}

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // sin I, O ni Q: se confunden al dictarlas
const codigoValido = (c: string) => /^[A-Z]{4,5}$/.test(c);

function sala(env: Env, codigo: string) {
  return env.ROOM.get(env.ROOM.idFromName(codigo));
}
function catalogo(env: Env) {
  return env.CATALOG.get(env.CATALOG.idFromName('global'));
}
async function datosCatalogo(env: Env): Promise<CatalogoDatos | null> {
  try {
    return (await (await catalogo(env).fetch('https://do/datos')).json()) as CatalogoDatos;
  } catch {
    return null;
  }
}
function registro(env: Env) {
  return env.REGISTRY.get(env.REGISTRY.idFromName('global'));
}
const json = (datos: unknown, status = 200) => Response.json(datos, { status, headers: { 'cache-control': 'no-store' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const partes = url.pathname.split('/').filter(Boolean);

    // Imagen de una carta por token opaco: la URL no delata quién es.
    if (partes[0] === 'c' && partes.length === 3) {
      const codigo = partes[1].toUpperCase();
      if (!codigoValido(codigo)) return new Response('no', { status: 404 });
      const r = await sala(env, codigo).fetch(`https://do/foto/${encodeURIComponent(partes[2])}`);
      if (!r.ok) return new Response('no', { status: 404 });
      const { foto } = (await r.json()) as { foto: string };
      const img = foto.startsWith('/catalogo/') ? await catalogo(env).fetch(`https://do/img/${foto.split('?')[0].slice(10).replace('.webp', '')}`) : await servir(env, new Request(new URL(foto, url.origin)));
      const h = new Headers(img.headers);
      h.set('cache-control', 'private, max-age=86400, immutable');
      return new Response(img.body, { status: img.status, headers: h });
    }

    // Fotos del catálogo (trolls y jugadores editados): públicas, con versión en la URL.
    if (partes[0] === 'catalogo' && partes.length === 3) {
      const r = await catalogo(env).fetch(`https://do/img/${partes[1]}/${partes[2].replace('.webp', '')}`);
      return r;
    }

    if (partes[0] !== 'api') return servir(env, req);

    // ── Salas ──
    if (partes[1] === 'salas') {
      if (partes.length === 2 && req.method === 'POST') {
        const cuerpo = (await req.json().catch(() => ({}))) as { clave?: string };
        for (let intento = 0; intento < 8; intento++) {
          const b = crypto.getRandomValues(new Uint8Array(4));
          const codigo = [...b].map((n) => LETRAS[n % LETRAS.length]).join('');
          const r = await sala(env, codigo).fetch('https://do/crear', { method: 'POST', body: JSON.stringify({ codigo, clave: cuerpo.clave }) });
          if (r.ok) return json({ codigo });
        }
        return json({ error: 'sin_codigos' }, 503);
      }
      const codigo = (partes[2] ?? '').toUpperCase();
      if (!codigoValido(codigo)) return json({ existe: false }, 404);
      if (partes.length === 3) return sala(env, codigo).fetch('https://do/info');
      if (partes[3] === 'ws') return sala(env, codigo).fetch(new Request('https://do/ws', req));
    }

    // ── Datos públicos del lobby (galería de avatares) ──
    if (partes[1] === 'datos') {
      const cat = await datosCatalogo(env);
      const trolls = trollsFinal(trollsJson as unknown as Troll[], cat).filter((t) => t.activo).map((t) => ({ id: t.id, nombre: t.nombre || 'Sin nombre', foto: t.foto }));
      // Algunas fotos al azar para el desfile de siluetas de la pantalla de inicio.
      const conFoto = jugadoresFinal(jugadoresJson as unknown as Jugador[], cat).filter((j) => j.fotos?.length);
      const siluetas: string[] = [];
      for (let i = 0; i < 9 && conFoto.length; i++) siluetas.push(conFoto.splice(Math.floor(Math.random() * conFoto.length), 1)[0].fotos[0]);
      return Response.json({ avatares: trolls, siluetas }, { headers: { 'cache-control': 'no-store' } });
    }

    // ── TVs ──
    if (partes[1] === 'tv') {
      const accion = partes[2] ?? '';
      if (accion === 'ws') return registro(env).fetch(new Request(`https://do/ws${url.search}`, req));
      if (accion === 'estado') return registro(env).fetch(`https://do/estado${url.search}`);
      if (['vincular', 'llamar', 'nombre', 'soltar'].includes(accion) && req.method === 'POST')
        return registro(env).fetch(new Request(`https://do/${accion}`, req));
    }

    // ── Administración (PIN en la cabecera x-admin-pin) ──
    if (partes[1] === 'admin') {
      if (!env.ADMIN_PIN || req.headers.get('x-admin-pin') !== env.ADMIN_PIN) return json({ error: 'pin' }, 401);
      if (partes[2] === 'ticker' && req.method === 'POST') {
        const cuerpo = (await req.json().catch(() => ({}))) as { sala?: string; texto?: string; fijo?: boolean };
        const codigo = String(cuerpo.sala ?? '').toUpperCase();
        if (!codigoValido(codigo) || !cuerpo.texto) return json({ error: 'faltan datos' }, 400);
        return sala(env, codigo).fetch('https://do/admin/ticker', { method: 'POST', body: JSON.stringify(cuerpo) });
      }
      if (partes[2] === 'avanzar' && req.method === 'POST') {
        const cuerpo = (await req.json().catch(() => ({}))) as { sala?: string; hasta?: string };
        const codigo = String(cuerpo.sala ?? '').toUpperCase();
        if (!codigoValido(codigo)) return json({ error: 'faltan datos' }, 400);
        return sala(env, codigo).fetch('https://do/admin/avanzar', { method: 'POST', body: JSON.stringify(cuerpo) });
      }
      if (partes[2] === 'ping') return json({ ok: true });
      // Estado completo para el panel: todo mezclado (repo + ediciones).
      if (partes[2] === 'estado') {
        const cat = await datosCatalogo(env);
        const base = jugadoresJson as unknown as Jugador[];
        const ids = new Set(base.map((j) => j.id));
        return json({
          jugadores: jugadoresFinal(base, cat).map((j) => ({ ...j, editado: !!cat?.overrides[j.id], propio: !ids.has(j.id) })),
          trolls: (cat?.trolls ?? []).map((t) => ({ ...t, foto: `/catalogo/troll/${t.id}.webp?v=${t.v}` })),
          muestras: !cat?.trolls.length,
          plantillasBase: (tickerJson as { plantillas: unknown[] }).plantillas,
          plantillas: cat?.plantillas ?? { custom: [], apagadas: [] },
        });
      }
      // Todo lo demás de edición va directo al catálogo: /api/admin/c/troll, /api/admin/c/jugador/ID, /api/admin/c/plantillas…
      if (partes[2] === 'c') return catalogo(env).fetch(new Request(`https://do/${partes.slice(3).join('/')}`, { method: req.method, body: req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.text() }));
    }

    return json({ error: 'no encontrado' }, 404);
  },
} satisfies ExportedHandler<Env>;
