// Conexión con la sala: WebSocket con reconexión, reloj sincronizado con el servidor y eventos efímeros.
import { useEffect, useSyncExternalStore } from 'react';
import type { EstadoPublico, Evento, MsgCliente, MsgServidor } from '../../shared/types';
import { aplicarTemaDeSala } from './temas';
import { claveDispositivo } from './util';

export type Conexion = 'conectando' | 'ok' | 'reconectando' | 'sin_sala' | 'expulsado';

export interface VistaSala {
  conexion: Conexion;
  estado: EstadoPublico | null;
  tu: string | null;
  anfitrion: boolean;
  error: { codigo: string; texto: string; n: number } | null;
}

type OyenteEvento = (ev: Evento, estado: EstadoPublico) => void;

export class Sala {
  vista: VistaSala = { conexion: 'conectando', estado: null, tu: null, anfitrion: false, error: null };
  /** Diferencia entre el reloj del servidor y el local (ms). */
  desfase = 0;
  private ws: WebSocket | null = null;
  private oyentes = new Set<() => void>();
  private oyentesEv = new Set<OyenteEvento>();
  private intentos = 0;
  private cerrada = false;
  private latido: ReturnType<typeof setInterval> | null = null;
  private mejorIda = Infinity;
  private errores = 0;

  constructor(
    public codigo: string,
    public rol: 'jugador' | 'escenario',
  ) {
    this.conectar();
    document.addEventListener('visibilitychange', this.alVolver);
    window.addEventListener('online', this.alVolver);
  }

  private alVolver = () => {
    // El celular se desbloqueó o volvió la red: reconectar ya, sin esperar el reintento.
    if (document.visibilityState === 'visible' && !this.cerrada && (!this.ws || this.ws.readyState > 1)) {
      this.intentos = 0;
      this.conectar();
    }
  };

  private poner(parcial: Partial<VistaSala>) {
    this.vista = { ...this.vista, ...parcial };
    this.oyentes.forEach((f) => f());
  }

  private conectar() {
    if (this.cerrada) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/api/salas/${this.codigo}/ws`);
    } catch {
      return this.reintentar();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.intentos = 0;
      this.mejorIda = Infinity;
      this.enviar({ t: 'hola', clave: claveDispositivo(), rol: this.rol });
      this.ping();
      if (this.latido) clearInterval(this.latido);
      this.latido = setInterval(() => this.ping(), 4000);
    };
    ws.onmessage = (ev) => {
      let msg: MsgServidor;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'pong') {
        const ahora = Date.now();
        const ida = (ahora - msg.t0) / 2;
        // Se queda con la medición de menor latencia: es la más precisa.
        if (ida <= this.mejorIda + 15) {
          this.mejorIda = Math.min(this.mejorIda, ida);
          this.desfase = msg.ahora + ida - ahora;
        }
      } else if (msg.t === 'bienvenida') {
        this.poner({ tu: msg.tu, anfitrion: msg.anfitrion, conexion: 'ok' });
      } else if (msg.t === 'estado') {
        aplicarTemaDeSala(msg.s.ajustes.tema);
        this.poner({ estado: msg.s, conexion: 'ok', anfitrion: !!this.vista.tu && msg.s.anfitrionId === this.vista.tu });
        for (const e of msg.ev) this.oyentesEv.forEach((f) => f(e, msg.s));
      } else if (msg.t === 'error') {
        if (msg.codigo === 'expulsado') {
          this.cerrada = true;
          this.poner({ conexion: 'expulsado' });
          ws.close();
        } else this.poner({ error: { codigo: msg.codigo, texto: msg.texto, n: ++this.errores } });
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      if (this.latido) clearInterval(this.latido);
      if (ev.code === 4000) {
        // Otra pestaña del mismo dispositivo tomó el lugar.
        this.cerrada = true;
        return this.poner({ conexion: 'sin_sala' });
      }
      this.reintentar();
    };
    ws.onerror = () => {
      /* onclose se encarga */
    };
  }

  private async reintentar() {
    if (this.cerrada) return;
    this.intentos++;
    this.poner({ conexion: this.vista.estado ? 'reconectando' : 'conectando' });
    // Si la sala ya no existe, no tiene sentido insistir.
    if (this.intentos >= 2) {
      try {
        const r = await fetch(`/api/salas/${this.codigo}`);
        const d = (await r.json()) as { existe: boolean };
        if (!d.existe) {
          this.cerrada = true;
          return this.poner({ conexion: 'sin_sala' });
        }
      } catch {
        /* sin red: se sigue intentando */
      }
    }
    setTimeout(() => this.conectar(), Math.min(4000, 300 * 2 ** Math.min(this.intentos, 4)));
  }

  private ping() {
    this.enviar({ t: 'ping', t0: Date.now() });
  }

  enviar(msg: MsgCliente) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  ahora() {
    return Date.now() + this.desfase;
  }

  suscribir = (f: () => void) => {
    this.oyentes.add(f);
    return () => {
      this.oyentes.delete(f);
    };
  };

  alEvento(f: OyenteEvento) {
    this.oyentesEv.add(f);
    return () => {
      this.oyentesEv.delete(f);
    };
  }

  cerrar() {
    this.cerrada = true;
    if (this.latido) clearInterval(this.latido);
    document.removeEventListener('visibilitychange', this.alVolver);
    window.removeEventListener('online', this.alVolver);
    this.ws?.close();
  }
}

const salas = new Map<string, { sala: Sala; usos: number }>();

/** Hook: se conecta a una sala (una sola conexión por código+rol aunque varios componentes la usen). */
export function useSala(codigo: string, rol: 'jugador' | 'escenario'): [Sala, VistaSala] {
  const k = `${codigo}:${rol}`;
  let entrada = salas.get(k);
  if (!entrada) {
    entrada = { sala: new Sala(codigo, rol), usos: 0 };
    salas.set(k, entrada);
  }
  const sala = entrada.sala;
  useEffect(() => {
    const e = salas.get(k)!;
    e.usos++;
    return () => {
      e.usos--;
      // Se cierra con demora para sobrevivir al doble montaje de desarrollo y a transiciones.
      setTimeout(() => {
        if (e.usos <= 0 && salas.get(k) === e) {
          e.sala.cerrar();
          salas.delete(k);
        }
      }, 400);
    };
  }, [k]);
  const vista = useSyncExternalStore(sala.suscribir, () => sala.vista);
  return [sala, vista];
}

export function useEventos(sala: Sala, f: OyenteEvento) {
  useEffect(() => sala.alEvento(f), [sala, f]);
}
