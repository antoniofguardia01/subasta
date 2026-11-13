// Durable Object de una sala: estado de la partida en memoria + WebSockets. Sin base de datos.
import { Partida } from '../shared/game';
import { Ticker, Plantilla } from '../shared/ticker';
import type { EstadoPublico, Evento, Jugador, MsgCliente, MsgServidor, Troll } from '../shared/types';
import jugadoresJson from '../data/players.json';
import trollsJson from '../data/trolls.json';
import { CatalogoDatos, jugadoresFinal, plantillasFinal, trollsFinal } from '../shared/catalogo';
import tickerJson from '../data/ticker.json';
import type { Recientes } from '../shared/deck';

interface Conexion {
  clave: string;
  rol: 'jugador' | 'escenario';
  pid: string | null;
}

/** Sin nadie conectado durante este tiempo, la sala se descarta. */
const VIDA_SIN_GENTE = 30 * 60 * 1000;

async function hash(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class RoomDO implements DurableObject {
  private partida: Partida | null = null;
  private ticker = new Ticker((tickerJson as { plantillas: Plantilla[] }).plantillas);
  private conexiones = new Map<WebSocket, Conexion>();
  private reloj: ReturnType<typeof setTimeout> | null = null;
  private limpieza: ReturnType<typeof setTimeout> | null = null;
  private claveCreador: string | null = null;
  private codigo = '';
  private guardado: ReturnType<typeof setTimeout> | null = null;
  private cargada = false;

  constructor(
    private state: DurableObjectState,
    private env: { CATALOG?: DurableObjectNamespace },
  ) {}

  private cat: CatalogoDatos | null = null;

  /** Trae lo editado en el panel (trolls, precios, jugadores nuevos, plantillas). Si falla, juega con lo del repo. */
  private async cargarCatalogo() {
    try {
      const c = this.env.CATALOG!;
      this.cat = (await (await c.get(c.idFromName('global')).fetch('https://do/datos')).json()) as CatalogoDatos;
    } catch {
      this.cat = null;
    }
    this.ticker.setPlantillas(plantillasFinal((tickerJson as { plantillas: Plantilla[] }).plantillas, this.cat));
  }

  private pool(): Jugador[] {
    return jugadoresFinal(jugadoresJson as unknown as Jugador[], this.cat);
  }
  private trolls(): Troll[] {
    return trollsFinal(trollsJson as unknown as Troll[], this.cat);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;
    await this.restaurar();

    if (ruta === '/crear' && req.method === 'POST') {
      if (this.partida) return Response.json({ ok: false }, { status: 409 });
      const { codigo, clave } = (await req.json()) as { codigo: string; clave?: string };
      this.codigo = codigo;
      this.partida = new Partida(codigo);
      this.claveCreador = clave ?? null;
      this.ticker = new Ticker((tickerJson as { plantillas: Plantilla[] }).plantillas);
      await this.cargarCatalogo();
      this.programarLimpieza();
      return Response.json({ ok: true, codigo });
    }

    if (ruta === '/info') {
      if (!this.partida) return Response.json({ existe: false });
      return Response.json({ existe: true, fase: this.partida.fase, jugadores: this.partida.jugadores.length });
    }

    if (ruta.startsWith('/foto/')) {
      const foto = this.partida?.fotoDeToken(ruta.slice(6));
      return foto ? Response.json({ foto }) : new Response('no', { status: 404 });
    }

    if (ruta === '/admin/ticker' && req.method === 'POST') {
      if (!this.partida) return Response.json({ ok: false, error: 'sala inexistente' }, { status: 404 });
      const { texto, fijo, en } = (await req.json()) as { texto: string; fijo?: boolean; en?: number };
      const mandar = () => {
        this.ticker.manual(String(texto), !!fijo);
        this.difundir();
      };
      // `en` = segundos de espera (mensaje programado)
      if (en && en > 0) setTimeout(mandar, Math.min(en, 3600) * 1000);
      else mandar();
      return Response.json({ ok: true });
    }

    if (ruta === '/admin/avanzar' && req.method === 'POST') {
      // Herramienta de pruebas: adelanta el reloj hasta el final de la ronda o de la partida (sin ofertas).
      const p = this.partida;
      if (!p || !p.mazo) return Response.json({ ok: false, error: 'sin partida' }, { status: 404 });
      const { hasta } = (await req.json()) as { hasta?: 'ronda' | 'final' };
      const rondaInicial = p.rondaIdx;
      let t = Date.now();
      for (let i = 0; i < 5000 && p.fase !== 'final'; i++) {
        if (hasta !== 'final' && p.rondaIdx > rondaInicial && p.fase === 'ronda') break;
        t = Math.max(t, p.vence);
        p.avanzar(t);
      }
      // El reloj real retoma desde ahora.
      if (p.fase !== 'final') p.vence = Date.now() + p.duracion;
      p.hechos = [];
      this.difundir();
      return Response.json({ ok: true, fase: p.fase, ronda: p.rondaIdx });
    }

    if (ruta === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('se esperaba websocket', { status: 426 });
      if (!this.partida) return new Response('sala inexistente', { status: 404 });
      const par = new WebSocketPair();
      const servidor = par[1];
      servidor.accept();
      servidor.addEventListener('message', (ev) => {
        this.recibir(servidor, ev.data).catch((e) => console.error('error en mensaje', e));
      });
      const cerrar = () => this.desconectar(servidor);
      servidor.addEventListener('close', cerrar);
      servidor.addEventListener('error', cerrar);
      return new Response(null, { status: 101, webSocket: par[0] });
    }

    return new Response('no encontrado', { status: 404 });
  }

  // ───────────── Copia de seguridad (almacenamiento propio del Durable Object) ─────────────

  /** Si el servidor se reinició, recupera la partida guardada (salvo que sea muy vieja). */
  private async restaurar() {
    if (this.cargada) return;
    this.cargada = true;
    if (this.partida) return;
    const copia = await this.state.storage.get<{ codigo: string; claveCreador: string | null; cuando: number; datos: Record<string, unknown> }>('partida');
    if (!copia) return;
    if (Date.now() - copia.cuando > 6 * 60 * 60 * 1000) {
      await this.state.storage.deleteAll();
      return;
    }
    await this.cargarCatalogo();
    this.codigo = copia.codigo;
    this.claveCreador = copia.claveCreador;
    this.partida = new Partida(copia.codigo);
    this.partida.importar(copia.datos, this.pool(), this.trolls(), Date.now());
    this.programarReloj();
    this.programarLimpieza();
  }

  private guardar() {
    if (this.guardado) return;
    this.guardado = setTimeout(() => {
      this.guardado = null;
      if (!this.partida) return;
      void this.state.storage.put('partida', { codigo: this.codigo, claveCreador: this.claveCreador, cuando: Date.now(), datos: this.partida.exportar() });
    }, 400);
  }

  // ───────────── Mensajes ─────────────

  private enviar(ws: WebSocket, msg: MsgServidor) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket cerrado */
    }
  }

  private async recibir(ws: WebSocket, datos: string | ArrayBuffer) {
    const p = this.partida;
    if (!p || typeof datos !== 'string') return;
    let msg: MsgCliente;
    try {
      msg = JSON.parse(datos);
    } catch {
      return;
    }
    const ahora = Date.now();

    if (msg.t === 'ping') return this.enviar(ws, { t: 'pong', t0: msg.t0, ahora });

    if (msg.t === 'hola') {
      const clave = String(msg.clave).slice(0, 80);
      const rol = msg.rol === 'escenario' ? 'escenario' : 'jugador';
      const pid = rol === 'jugador' ? 'j' + (await hash(clave + this.codigo)) : null;
      // Un mismo dispositivo que reconecta reemplaza su conexión anterior.
      if (pid)
        for (const [otro, c] of this.conexiones)
          if (c.pid === pid && otro !== ws) {
            this.conexiones.delete(otro);
            try {
              otro.close(4000, 'reemplazado');
            } catch {
              /* ya cerrado */
            }
          }
      this.conexiones.set(ws, { clave, rol, pid });
      const esJugador = !!(pid && p.jugador(pid));
      if (esJugador) p.conectar(pid!, true);
      this.enviar(ws, { t: 'bienvenida', tu: esJugador ? pid : null, anfitrion: esJugador && p.anfitrionId === pid, ahora });
      this.programarLimpieza();
      return this.difundir();
    }

    const con = this.conexiones.get(ws);
    if (!con) return;
    const pid = con.pid;
    const esAnfitrion = !!pid && p.anfitrionId === pid;

    switch (msg.t) {
      case 'entrar': {
        if (!pid) return;
        const r = p.entrar(pid, String(msg.nombre ?? ''), String(msg.avatar ?? ''));
        if (!r.ok) return this.enviar(ws, { t: 'error', codigo: r.codigo, texto: r.texto });
        if (this.claveCreador && con.clave === this.claveCreador) p.anfitrionId = pid;
        p.conectar(pid, true);
        this.enviar(ws, { t: 'bienvenida', tu: pid, anfitrion: p.anfitrionId === pid, ahora });
        if (p.fase === 'lobby') this.ticker.decir('entra', { jugador: p.jugador(pid)!.nombre }, p.ajustes.intensidad);
        break;
      }
      case 'ajustes':
        if (esAnfitrion) p.cambiarAjustes(msg.ajustes ?? {});
        break;
      case 'empezar': {
        if (!esAnfitrion) return;
        await this.cargarCatalogo();
        const semilla = crypto.getRandomValues(new Uint32Array(1))[0];
        const catalogo = this.env.CATALOG!.get(this.env.CATALOG!.idFromName('global'));
        let recientes: Recientes | undefined;
        try {
          recientes = (await (await catalogo.fetch('https://do/recientes')).json()) as Recientes;
        } catch {
          /* sin memoria: el sorteo sale igual */
        }
        if (!p.empezar(this.pool(), this.trolls(), semilla, ahora, recientes))
          return this.enviar(ws, { t: 'error', codigo: 'faltan', texto: 'Hacen falta al menos 2 participantes para empezar.' });
        try {
          await catalogo.fetch('https://do/recientes', { method: 'POST', body: JSON.stringify(p.idsDelMazo()) });
        } catch {
          /* no es grave */
        }
        break;
      }
      case 'ofertar':
        if (pid) p.ofertar(pid, String(msg.uid), ahora, typeof msg.monto === 'number' && Number.isFinite(msg.monto) ? msg.monto : undefined);
        break;
      case 'saltear':
        if (pid) p.saltear(pid, String(msg.uid), ahora);
        break;
      // La TV (escenario) también puede pausar y mostrar los equipos.
      case 'pausa':
        if (esAnfitrion || con.rol === 'escenario') p.pausar(!!msg.on, ahora);
        break;
      case 'panel':
        if (esAnfitrion || con.rol === 'escenario') p.panel = msg.on ? 'equipos' : null;
        break;
      case 'expulsar':
        if (esAnfitrion && msg.pid !== pid) {
          p.expulsar(String(msg.pid), ahora);
          for (const [otro, c] of this.conexiones)
            if (c.pid === msg.pid) this.enviar(otro, { t: 'error', codigo: 'expulsado', texto: 'El anfitrión te sacó de la sala.' });
        }
        break;
      case 'anfitrion':
        if (esAnfitrion && p.jugador(String(msg.pid))) p.anfitrionId = String(msg.pid);
        break;
      case 'salir':
        if (pid) p.expulsar(pid, ahora);
        break;
      case 'verEquipo':
        if (esAnfitrion && p.fase === 'final') p.finalVista = msg.pid && p.jugador(String(msg.pid)) ? String(msg.pid) : null;
        break;
      case 'terminar':
        if (esAnfitrion) p.terminar();
        break;
      case 'revancha':
        if (esAnfitrion && p.fase === 'final') p.revancha();
        break;
      default:
        return;
    }
    this.difundir();
  }

  private desconectar(ws: WebSocket) {
    const con = this.conexiones.get(ws);
    if (!con) return;
    this.conexiones.delete(ws);
    const p = this.partida;
    if (p && con.pid && ![...this.conexiones.values()].some((c) => c.pid === con.pid)) {
      const j = p.jugador(con.pid);
      if (j) {
        p.conectar(con.pid, false);
        if (p.fase !== 'lobby' && p.fase !== 'final') this.ticker.decir('sale', { jugador: j.nombre }, p.ajustes.intensidad);
        else if (p.fase === 'lobby') {
          // En el lobby, quien se va deja el lugar tras un rato (si vuelve antes, conserva su puesto).
          const id = con.pid;
          setTimeout(() => {
            const sigue = this.partida?.jugador(id);
            if (this.partida?.fase === 'lobby' && sigue && !sigue.conectado) {
              this.partida.expulsar(id, Date.now());
              this.difundir();
            }
          }, 90_000);
        }
      }
      this.difundir();
    }
    this.programarLimpieza();
  }

  // ───────────── Difusión y reloj ─────────────

  private difundir() {
    const p = this.partida;
    if (!p) return;
    if (p.hechos.length) {
      this.ticker.procesar(p, p.hechos);
      p.hechos = [];
    }
    const ev: Evento[] = [...p.eventos, ...this.ticker.cola.map((msg) => ({ e: 'ticker' as const, msg }))];
    p.eventos = [];
    this.ticker.cola = [];
    const s: EstadoPublico = { ...p.vista(this.trolls().filter((t) => t.activo).length), ticker: this.ticker.visibles };
    const texto = JSON.stringify({ t: 'estado', s, ev, ahora: Date.now() } satisfies MsgServidor);
    for (const ws of this.conexiones.keys()) {
      try {
        ws.send(texto);
      } catch {
        /* socket cerrado */
      }
    }
    this.programarReloj();
    this.guardar();
  }

  private programarReloj() {
    if (this.reloj) clearTimeout(this.reloj);
    this.reloj = null;
    const v = this.partida?.proximoVencimiento();
    if (v == null) return;
    this.reloj = setTimeout(() => {
      if (this.partida?.avanzar(Date.now())) this.difundir();
      else this.programarReloj();
    }, Math.max(0, v - Date.now()) + 5);
  }

  private programarLimpieza() {
    if (this.limpieza) clearTimeout(this.limpieza);
    this.limpieza = null;
    if (this.conexiones.size > 0) return;
    this.limpieza = setTimeout(() => {
      if (this.conexiones.size === 0) {
        if (this.reloj) clearTimeout(this.reloj);
        this.partida = null;
        void this.state.storage.deleteAll();
      }
    }, VIDA_SIN_GENTE);
  }
}
