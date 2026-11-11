// Registro de TVs: emparejamiento sin teclado. La identidad vive en el navegador de la TV;
// acá solo hay un registro temporal en memoria de las TVs conectadas y sus códigos de 4 letras.

interface Tele {
  ws: WebSocket;
  tvId: string;
  nombre: string;
  codigo: string;
  expira: number;
  sala: string | null;
}

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const VIDA_CODIGO = 10 * 60 * 1000;

export class RegistryDO implements DurableObject {
  private teles = new Map<string, Tele>();

  constructor(
    private state: DurableObjectState,
    private env: unknown,
  ) {}

  private nuevoCodigo(): string {
    for (;;) {
      const b = crypto.getRandomValues(new Uint8Array(4));
      const c = [...b].map((n) => LETRAS[n % LETRAS.length]).join('');
      if (![...this.teles.values()].some((t) => t.codigo === c)) return c;
    }
  }

  private enviar(t: Tele, msg: unknown) {
    try {
      t.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;

    if (ruta === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('se esperaba websocket', { status: 426 });
      const tvId = (url.searchParams.get('tv') ?? '').slice(0, 64);
      if (tvId.length < 8) return new Response('falta identidad', { status: 400 });
      const par = new WebSocketPair();
      const ws = par[1];
      ws.accept();
      const previa = this.teles.get(tvId);
      if (previa) {
        try {
          previa.ws.close(4000, 'reemplazada');
        } catch {
          /* ya cerrada */
        }
      }
      const tele: Tele = {
        ws,
        tvId,
        nombre: (url.searchParams.get('nombre') ?? 'TV').slice(0, 24),
        codigo: this.nuevoCodigo(),
        expira: Date.now() + VIDA_CODIGO,
        sala: null,
      };
      this.teles.set(tvId, tele);
      this.enviar(tele, { t: 'codigo', codigo: tele.codigo, expira: tele.expira });
      ws.addEventListener('message', (ev) => {
        try {
          const m = JSON.parse(String(ev.data)) as { t: string; nombre?: string; sala?: string | null };
          if (m.t === 'ping') {
            if (Date.now() > tele.expira) {
              tele.codigo = this.nuevoCodigo();
              tele.expira = Date.now() + VIDA_CODIGO;
              this.enviar(tele, { t: 'codigo', codigo: tele.codigo, expira: tele.expira });
            } else this.enviar(tele, { t: 'pong' });
          } else if (m.t === 'nombre' && m.nombre) tele.nombre = m.nombre.slice(0, 24);
          else if (m.t === 'en') tele.sala = m.sala ?? null;
        } catch {
          /* mensaje inválido */
        }
      });
      const cerrar = () => {
        if (this.teles.get(tvId)?.ws === ws) this.teles.delete(tvId);
      };
      ws.addEventListener('close', cerrar);
      ws.addEventListener('error', cerrar);
      return new Response(null, { status: 101, webSocket: par[0] });
    }

    if (req.method === 'POST') {
      const cuerpo = (await req.json().catch(() => ({}))) as { codigo?: string; tvId?: string; sala?: string; nombre?: string };
      if (ruta === '/vincular') {
        const codigo = String(cuerpo.codigo ?? '').toUpperCase().replace(/[^A-Z]/g, '');
        const tele = [...this.teles.values()].find((t) => t.codigo === codigo && Date.now() <= t.expira);
        if (!tele) return Response.json({ ok: false, error: 'codigo' }, { status: 404 });
        tele.sala = cuerpo.sala ?? null;
        this.enviar(tele, { t: 'ir', sala: cuerpo.sala });
        return Response.json({ ok: true, tvId: tele.tvId, nombre: tele.nombre });
      }
      if (ruta === '/llamar') {
        const tele = this.teles.get(String(cuerpo.tvId ?? ''));
        if (!tele) return Response.json({ ok: false, error: 'apagada' }, { status: 404 });
        tele.sala = cuerpo.sala ?? null;
        this.enviar(tele, { t: 'ir', sala: cuerpo.sala });
        return Response.json({ ok: true, tvId: tele.tvId, nombre: tele.nombre });
      }
      if (ruta === '/nombre') {
        const tele = this.teles.get(String(cuerpo.tvId ?? ''));
        const nombre = String(cuerpo.nombre ?? '').slice(0, 24);
        if (tele && nombre) {
          tele.nombre = nombre;
          this.enviar(tele, { t: 'nombre', nombre });
        }
        return Response.json({ ok: !!tele });
      }
      if (ruta === '/soltar') {
        const tele = this.teles.get(String(cuerpo.tvId ?? ''));
        if (tele) this.enviar(tele, { t: 'soltar' });
        return Response.json({ ok: true });
      }
    }

    if (ruta === '/estado') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
      return Response.json({
        teles: ids.map((id) => {
          const t = this.teles.get(id);
          return { tvId: id, enLinea: !!t, nombre: t?.nombre, sala: t?.sala ?? null };
        }),
      });
    }

    return new Response('no encontrado', { status: 404 });
  }
}
