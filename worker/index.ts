// Entrada del Worker: API + enrutado a los Durable Objects. El frontend lo sirven los assets estáticos.
import trollsJson from '../data/trolls.json';
import type { Troll } from '../shared/types';

export { RoomDO } from './room';
export { RegistryDO } from './registry';

interface Env {
  ROOM: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
  ASSETS: Fetcher;
  ADMIN_PIN: string;
}

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // sin I, O ni Q: se confunden al dictarlas
const codigoValido = (c: string) => /^[A-Z]{4,5}$/.test(c);

function sala(env: Env, codigo: string) {
  return env.ROOM.get(env.ROOM.idFromName(codigo));
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
      const img = await env.ASSETS.fetch(new Request(new URL(foto, url.origin)));
      const h = new Headers(img.headers);
      h.set('cache-control', 'private, max-age=86400, immutable');
      return new Response(img.body, { status: img.status, headers: h });
    }

    if (partes[0] !== 'api') return env.ASSETS.fetch(req);

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
      const trolls = (trollsJson as unknown as Troll[]).filter((t) => t.activo).map((t) => ({ id: t.id, nombre: t.nombre, foto: t.foto }));
      return Response.json({ avatares: trolls }, { headers: { 'cache-control': 'public, max-age=60' } });
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
      if (partes[2] === 'ping') return json({ ok: true });
    }

    return json({ error: 'no encontrado' }, 404);
  },
} satisfies ExportedHandler<Env>;
