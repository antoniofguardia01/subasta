// Sala del Impostor: vive dentro del mismo Durable Object de sala (RoomDO), que le pasa las peticiones.
// Igual que la subasta: estado en memoria + WebSockets + copia en el almacenamiento del DO. Sin base de datos.
// Diferencia clave: cada celular recibe su propia vista (el impostor nunca recibe el secreto).
import { PartidaImp, type MsgClienteImp, type Secreto } from '../shared/impostor';
import { candidatosImp, type Club } from '../shared/impostorDatos';
import type { Jugador } from '../shared/types';
import { CatalogoDatos, jugadoresFinal } from '../shared/catalogo';
import jugadoresJson from '../data/players.json';
import clubesJson from '../data/clubes.json';

interface Conexion {
  clave: string;
  rol: 'jugador' | 'escenario';
  pid: string | null;
}

const VIDA_SIN_GENTE = 30 * 60 * 1000;
const CLAVE = 'impostor';

async function hash(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class SalaImpostor {
  partida: PartidaImp;
  private conexiones = new Map<WebSocket, Conexion>();
  private reloj: ReturnType<typeof setTimeout> | null = null;
  private limpieza: ReturnType<typeof setTimeout> | null = null;
  private guardado: ReturnType<typeof setTimeout> | null = null;
  private cat: CatalogoDatos | null = null;

  constructor(
    private state: DurableObjectState,
    private env: { CATALOG?: DurableObjectNamespace },
    public codigo: string,
    private claveCreador: string | null,
    /** Avisa al DO que la sala se vació y se descartó. */
    private alCerrar: () => void,
  ) {
    this.partida = new PartidaImp(codigo);
  }

  /** Recupera una sala guardada (tras un reinicio del servidor). */
  static async restaurar(state: DurableObjectState, env: { CATALOG?: DurableObjectNamespace }, alCerrar: () => void): Promise<SalaImpostor | null> {
    const copia = await state.storage.get<{ codigo: string; claveCreador: string | null; cuando: number; datos: ReturnType<PartidaImp['exportar']> }>(CLAVE);
    if (!copia) return null;
    if (Date.now() - copia.cuando > 6 * 60 * 60 * 1000) {
      await state.storage.deleteAll();
      return null;
    }
    const s = new SalaImpostor(state, env, copia.codigo, copia.claveCreador, alCerrar);
    s.partida.importar(copia.datos, Date.now());
    await s.cargarCatalogo();
    s.programarReloj();
    s.programarLimpieza();
    return s;
  }

  async iniciar() {
    await this.cargarCatalogo();
    this.programarLimpieza();
    this.guardar();
  }

  /** Jugadores editados en el panel (precios no importan acá, pero sí altas y fotos). */
  private async cargarCatalogo() {
    try {
      const c = this.env.CATALOG!;
      this.cat = (await (await c.get(c.idFromName('global')).fetch('https://do/datos')).json()) as CatalogoDatos;
    } catch {
      this.cat = null;
    }
  }

  private candidatos(): Secreto[] {
    return candidatosImp(this.partida.ajustes, jugadoresFinal(jugadoresJson as unknown as Jugador[], this.cat), clubesJson as unknown as Club[]);
  }

  async fetch(req: Request): Promise<Response> {
    const ruta = new URL(req.url).pathname;
    if (ruta === '/info') return Response.json({ existe: true, juego: 'impostor', fase: this.partida.fase, jugadores: this.partida.jugadores.length });
    if (ruta === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('se esperaba websocket', { status: 426 });
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
    if (ruta === '/admin/avanzar' && req.method === 'POST') {
      // Herramienta de pruebas: adelanta el reloj de la fase actual.
      const p = this.partida;
      if (p.vence) p.avanzar(p.vence, this.candidatos());
      this.difundir();
      return Response.json({ ok: true, fase: p.fase, ronda: p.rondaN });
    }
    return new Response('no encontrado', { status: 404 });
  }

  private enviar(ws: WebSocket, msg: unknown) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket cerrado */
    }
  }

  private async recibir(ws: WebSocket, datos: string | ArrayBuffer) {
    if (typeof datos !== 'string') return;
    let msg: MsgClienteImp;
    try {
      msg = JSON.parse(datos);
    } catch {
      return;
    }
    const p = this.partida;
    const ahora = Date.now();
    if (msg.t === 'ping') return this.enviar(ws, { t: 'pong', t0: msg.t0, ahora });

    if (msg.t === 'hola') {
      const clave = String(msg.clave).slice(0, 80);
      const rol = msg.rol === 'escenario' ? 'escenario' : 'jugador';
      const pid = rol === 'jugador' ? 'j' + (await hash(clave + this.codigo)) : null;
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
    const tele = con.rol === 'escenario';

    switch (msg.t) {
      case 'entrar': {
        if (!pid) return;
        const r = p.entrar(pid, String(msg.nombre ?? ''), String(msg.avatar ?? ''));
        if (!r.ok) return this.enviar(ws, { t: 'error', codigo: r.codigo, texto: r.texto });
        if (this.claveCreador && con.clave === this.claveCreador) p.anfitrionId = pid;
        p.conectar(pid, true);
        this.enviar(ws, { t: 'bienvenida', tu: pid, anfitrion: p.anfitrionId === pid, ahora });
        break;
      }
      case 'ajustes':
        if (esAnfitrion) p.cambiarAjustes(msg.ajustes ?? {});
        break;
      case 'empezar': {
        if (!esAnfitrion) return;
        await this.cargarCatalogo();
        const r = p.empezar(this.candidatos(), crypto.getRandomValues(new Uint32Array(1))[0], ahora);
        if (!r.ok) return this.enviar(ws, { t: 'error', codigo: r.codigo, texto: r.texto });
        break;
      }
      case 'visto':
        if (pid) p.visto(pid, ahora);
        break;
      case 'votar':
        if (pid) p.votar(pid, String(msg.pid), ahora);
        break;
      case 'adivinar':
        if (pid) p.adivinar(pid, String(msg.id), ahora);
        break;
      case 'aVotar':
        if (esAnfitrion || tele) p.aVotar(ahora);
        break;
      case 'masTiempo':
        if (esAnfitrion || tele) p.masTiempo(ahora);
        break;
      case 'siguiente':
        if (esAnfitrion || tele) p.siguiente(this.candidatos(), ahora);
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
      case 'terminar':
        if (esAnfitrion) p.terminar(ahora);
        break;
      case 'revancha':
        if (esAnfitrion) p.revancha();
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
    if (con.pid && ![...this.conexiones.values()].some((c) => c.pid === con.pid) && p.jugador(con.pid)) {
      p.conectar(con.pid, false);
      if (p.fase === 'lobby') {
        // En el lobby, quien se va deja el lugar tras un rato (si vuelve antes, conserva su puesto).
        const id = con.pid;
        setTimeout(() => {
          const sigue = this.partida.jugador(id);
          if (this.partida.fase === 'lobby' && sigue && !sigue.conectado) {
            this.partida.expulsar(id, Date.now());
            this.difundir();
          }
        }, 90_000);
      }
      this.difundir();
    }
    this.programarLimpieza();
  }

  /** Cada conexión recibe su vista: el secreto solo llega a quien le toca verlo. */
  difundir() {
    const p = this.partida;
    const disponibles = this.candidatos().length;
    const ahora = Date.now();
    const publica = JSON.stringify({ t: 'estado', s: p.vista(null, disponibles), ev: [], ahora });
    for (const [ws, c] of this.conexiones) {
      const texto = c.pid && p.jugador(c.pid) ? JSON.stringify({ t: 'estado', s: p.vista(c.pid, disponibles), ev: [], ahora }) : publica;
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
    const v = this.partida.proximoVencimiento();
    if (v == null) return;
    this.reloj = setTimeout(() => {
      if (this.partida.avanzar(Date.now(), this.candidatos())) this.difundir();
      else this.programarReloj();
    }, Math.max(0, v - Date.now()) + 5);
  }

  private guardar() {
    if (this.guardado) return;
    this.guardado = setTimeout(() => {
      this.guardado = null;
      void this.state.storage.put(CLAVE, { codigo: this.codigo, claveCreador: this.claveCreador, cuando: Date.now(), datos: this.partida.exportar() });
    }, 400);
  }

  private programarLimpieza() {
    if (this.limpieza) clearTimeout(this.limpieza);
    this.limpieza = null;
    if (this.conexiones.size > 0) return;
    this.limpieza = setTimeout(() => {
      if (this.conexiones.size === 0) {
        if (this.reloj) clearTimeout(this.reloj);
        void this.state.storage.deleteAll();
        this.alCerrar();
      }
    }, VIDA_SIN_GENTE);
  }
}
