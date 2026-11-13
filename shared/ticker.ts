// Ticker: convierte hechos del juego en burlas, sin repetir plantillas seguidas.
import type { Hecho, Partida } from './game';
import { MensajeTicker, POS_NOMBRE } from './types';
import { UMBRAL_BARATO } from './deck';

export interface Plantilla {
  id: string;
  disparador: string;
  intensidad: number;
  texto: string;
  activo: boolean;
}

export class Ticker {
  private serie = 0;
  private recientes: string[] = [];
  cola: MensajeTicker[] = [];
  /** Últimos mensajes: los que se ven dando vueltas en la barra. */
  visibles: MensajeTicker[] = [];

  constructor(
    private plantillas: Plantilla[],
    private azar: () => number = Math.random,
  ) {}

  setPlantillas(p: Plantilla[]) {
    this.plantillas = p;
  }

  private elegir(disparador: string, intensidad: number): Plantilla | null {
    const posibles = this.plantillas.filter((p) => p.activo && p.disparador === disparador && p.intensidad <= intensidad);
    if (!posibles.length) return null;
    const frescas = posibles.filter((p) => !this.recientes.includes(p.id));
    const lista = frescas.length ? frescas : posibles;
    // Con picante alto se prefieren las plantillas más fuertes.
    const pesos = lista.map((p) => 1 + (p.intensidad === intensidad ? 1.5 : 0));
    let r = this.azar() * pesos.reduce((a, b) => a + b, 0);
    let elegida = lista[0];
    for (let i = 0; i < lista.length; i++) {
      r -= pesos[i];
      if (r <= 0) {
        elegida = lista[i];
        break;
      }
    }
    this.recientes.push(elegida.id);
    if (this.recientes.length > 24) this.recientes.shift();
    return elegida;
  }

  private emitir(texto: string, tipo: MensajeTicker['tipo'], fijo = false): MensajeTicker {
    const msg: MensajeTicker = { id: ++this.serie, texto, tipo, fijo };
    this.cola.push(msg);
    if (tipo === 'manual') {
      // Los manuales van adelante de los automáticos.
      const i = this.visibles.findIndex((m) => m.tipo !== 'manual' || !m.fijo);
      this.visibles.splice(i < 0 ? 0 : i, 0, msg);
    } else this.visibles.unshift(msg);
    const fijos = this.visibles.filter((m) => m.fijo);
    const resto = this.visibles.filter((m) => !m.fijo).slice(0, 7);
    this.visibles = [...fijos, ...resto];
    return msg;
  }

  manual(texto: string, fijo = false) {
    return this.emitir(texto.slice(0, 180), 'manual', fijo);
  }

  quitar(id: number) {
    this.visibles = this.visibles.filter((m) => m.id !== id);
  }

  sistema(texto: string) {
    return this.emitir(texto, 'sistema');
  }

  decir(disparador: string, vars: Record<string, string | number>, intensidad: number) {
    const p = this.elegir(disparador, intensidad);
    if (!p) return null;
    const texto = p.texto.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '…'));
    return this.emitir(texto, 'auto');
  }

  /** Variables del modo tragos para las plantillas: tragos de este troll y total del jugador. */
  private tragosVars(partida: Partida, h: { pid: string; tragos?: number }) {
    const n = h.tragos ?? 0;
    return { tragos: n, trago: n === 1 ? 'trago' : 'tragos', total: partida.jugador(h.pid)?.tragos ?? n };
  }

  /** Procesa los hechos acumulados por el motor. */
  procesar(partida: Partida, hechos: Hecho[]) {
    const n = partida.ajustes.intensidad;
    const nombre = (pid?: string) => partida.jugador(pid ?? '')?.nombre ?? 'Alguien';
    const ultimoSaldo = () => [...partida.jugadores].sort((a, b) => a.saldo - b.saldo)[0];
    const pos = () => {
      const r = partida.rondaActual();
      return r ? POS_NOMBRE[r.pos].toLowerCase() : '';
    };
    for (const h of hechos) {
      switch (h.h) {
        case 'inicio':
          this.decir('inicio', {}, n);
          break;
        case 'ronda':
          this.decir('ronda', { posicion: pos(), ultimo: nombre(ultimoSaldo()?.id) }, n);
          if (h.indice > 0 && h.indice % 3 === 0) {
            const u = ultimoSaldo();
            if (u) this.decir('ultimo', { jugador: u.nombre, monto: u.saldo }, n);
          }
          break;
        case 'vendido': {
          const c = h.carta;
          const vars = {
            jugador: nombre(h.pid),
            rival: nombre(h.rivalId),
            monto: h.precio,
            carta: c.apellido || c.nombre,
            troll: c.nombre,
            descripcion: c.dato,
            posicion: POS_NOMBRE[c.pos].toLowerCase(),
          };
          const sobre = h.precio - c.precioMinimo;
          if (c.tipo === 'troll') this.decir(h.tragos ? 'trago' : 'troll', { ...vars, ...this.tragosVars(partida, h) }, n);
          else if (sobre >= 25 && h.rivalId) this.decir('vendido_caro', vars, n);
          else if (c.rareza === 'prime' || c.rareza === 'leyenda') this.decir('estrella', vars, n);
          else if (sobre <= 2 && c.precioMinimo > UMBRAL_BARATO && c.rating >= 84) this.decir('robo', vars, n);
          else this.decir('vendido', vars, n);
          break;
        }
        case 'obligado':
        case 'ruleta': {
          const c = h.carta;
          const vars = { jugador: nombre(h.pid), monto: h.precio, carta: c.apellido || c.nombre, troll: c.nombre, descripcion: c.dato, posicion: POS_NOMBRE[c.pos].toLowerCase() };
          if (h.h === 'ruleta' && h.liquidacion) this.decir('liquidacion', vars, n);
          else if (c.tipo === 'troll' && h.tragos) this.decir('trago', { ...vars, ...this.tragosVars(partida, h) }, n);
          else if (c.tipo === 'troll' && this.azar() < 0.5) this.decir('troll', vars, n);
          else this.decir(h.h, vars, n);
          break;
        }
        case 'pasa':
          this.decir('pasa', { carta: h.carta.apellido || h.carta.nombre }, n);
          break;
        case 'salteada':
          this.decir('salteada', { jugador: nombre(h.pid), carta: h.carta.apellido || h.carta.nombre }, n);
          break;
        case 'rechazo':
          if (h.motivo === 'tarde') this.decir('tarde', { jugador: nombre(h.pid) }, n);
          break;
        case 'seco':
          this.decir('sin_saldo', { jugador: nombre(h.pid) }, n);
          break;
        case 'guerra':
          this.decir('guerra', { jugador: nombre(h.pid), rival: nombre(h.rivalId), monto: h.precio }, n);
          break;
        case 'ultima':
          this.decir('ultima', {}, n);
          break;
        case 'final':
          this.decir('final', { jugador: nombre(h.ganadorId), ultimo: nombre(h.ultimoId) }, n);
          break;
      }
    }
  }
}
