// Motor de la subasta. Puro y determinista: no conoce WebSockets ni temporizadores reales.
// El servidor llama a avanzar(ahora) cuando vence `proximoVencimiento()` y a ofertar/saltear cuando llegan mensajes.
import {
  Ajustes,
  AJUSTES_DEFECTO,
  Carta,
  CartaActualVista,
  CartaRondaVista,
  CartaVista,
  COLORES_EQUIPO,
  Desenlace,
  EstadoCartaRonda,
  EstadoPublico,
  Evento,
  Fase,
  FichaEquipo,
  FORMACION,
  Historial,
  Jugador,
  JugadorSala,
  MAX_PARTICIPANTES,
  Mazo,
  MotivoRechazo,
  OfertaVista,
  Troll,
  rangoTrolls,
} from './types';
import { crearReponedor, generarMazo, pisosDeRonda } from './deck';
import { crearRng } from './rng';
import { calcularFinal } from './score';

export interface Tiempos {
  intro: number;
  ronda: number;
  presenta: number;
  ruleta: number;
  martillo: number;
  martilloMenor: number;
  revela: number;
  revelaGrande: number;
  revelaCorta: number;
  finronda: number;
}

export const TIEMPOS: Tiempos = {
  intro: 7000,
  ronda: 3600,
  presenta: 2600,
  ruleta: 5600,
  martillo: 2100,
  martilloMenor: 1500,
  revela: 8500,
  revelaGrande: 10500,
  revelaCorta: 5500,
  finronda: 5200,
};

/** Hechos del juego: materia prima del ticker de burlas. */
export type Hecho =
  | { h: 'vendido'; pid: string; carta: Carta; precio: number; rivalId?: string; ofertas: number }
  | { h: 'obligado'; pid: string; carta: Carta; precio: number }
  | { h: 'ruleta'; pid: string; carta: Carta; precio: number; liquidacion: boolean }
  | { h: 'pasa'; carta: Carta }
  | { h: 'salteada'; pid: string; carta: Carta }
  | { h: 'rechazo'; pid: string; motivo: MotivoRechazo }
  | { h: 'ultima' }
  | { h: 'ronda'; indice: number }
  | { h: 'guerra'; pid: string; rivalId: string; precio: number }
  | { h: 'seco'; pid: string }
  | { h: 'inicio' }
  | { h: 'final'; ganadorId: string; ultimoId: string };

interface Participante {
  id: string;
  nombre: string;
  avatar: string;
  color: string;
  conectado: boolean;
  saldo: number;
  skips: number;
  equipo: (FichaEquipo | null)[];
  gastado: number;
}

export class Partida {
  ajustes: Ajustes = { ...AJUSTES_DEFECTO };
  jugadores: Participante[] = [];
  anfitrionId: string | null = null;
  fase: Fase = 'lobby';
  pausa = false;
  pausaResto = 0;
  panel: 'equipos' | null = null;

  mazo: Mazo | null = null;
  pisos: number[] = [];
  rondaIdx = -1;
  cartaIdx = -1;
  estados: EstadoCartaRonda[] = [];
  compradores: (string | undefined)[] = [];
  preciosVenta: (number | undefined)[] = [];
  comproEnRonda = new Set<string>();

  precio = 0;
  liderId: string | null = null;
  ofertas: OfertaVista[] = [];
  totalOfertas = 0;
  vence = 0;
  duracion = 0;
  desenlace: Desenlace | undefined;
  compradorId: string | undefined;
  pagado: number | undefined;
  salteadaPor: string | undefined;
  ruleta: { candidatos: string[]; ganador: string; liquidacion: boolean } | undefined;
  sobrantes: CartaVista[] | undefined;
  final: EstadoPublico['final'];

  historial: Historial[] = [];
  eventos: Evento[] = [];
  hechos: Hecho[] = [];
  secos = new Set<string>();

  /** Cantidad de ruletas ya sorteadas: con la semilla alcanza para repetir el azar tras restaurar. */
  ruletas = 0;
  private reponer: ((hueco: number) => Carta | null) | null = null;

  constructor(
    public codigo: string,
    public tiempos: Tiempos = TIEMPOS,
  ) {}

  // ───────────── Sala ─────────────

  jugador(id: string) {
    return this.jugadores.find((j) => j.id === id);
  }

  entrar(id: string, nombre: string, avatar: string): { ok: true } | { ok: false; codigo: string; texto: string } {
    const limpio = nombre.trim().replace(/\s+/g, ' ').slice(0, 14);
    if (limpio.length < 2) return { ok: false, codigo: 'nombre_corto', texto: 'Ponte un nombre de al menos 2 letras.' };
    const ya = this.jugador(id);
    if (this.jugadores.some((j) => j.id !== id && j.nombre.toLowerCase() === limpio.toLowerCase()))
      return { ok: false, codigo: 'nombre_tomado', texto: `Ya hay un "${limpio}" en la sala. Sé original.` };
    if (ya) {
      ya.nombre = limpio;
      ya.avatar = avatar;
      return { ok: true };
    }
    if (this.fase !== 'lobby') return { ok: false, codigo: 'en_juego', texto: 'La subasta ya arrancó. Espera la revancha.' };
    if (this.jugadores.length >= MAX_PARTICIPANTES) return { ok: false, codigo: 'llena', texto: `La sala está llena (${MAX_PARTICIPANTES}).` };
    const color = COLORES_EQUIPO.find((c) => !this.jugadores.some((j) => j.color === c)) ?? COLORES_EQUIPO[0];
    this.jugadores.push({
      id,
      nombre: limpio,
      avatar,
      color,
      conectado: true,
      saldo: this.ajustes.presupuesto,
      skips: this.ajustes.skips,
      equipo: FORMACION.map(() => null),
      gastado: 0,
    });
    if (!this.anfitrionId) this.anfitrionId = id;
    this.ajustarTrolls();
    this.eventos.push({ e: 'entra', pid: id });
    return { ok: true };
  }

  conectar(id: string, on: boolean) {
    const j = this.jugador(id);
    if (!j || j.conectado === on) return;
    j.conectado = on;
    this.eventos.push({ e: on ? 'entra' : 'sale', pid: id });
  }

  expulsar(id: string, ahora: number) {
    const i = this.jugadores.findIndex((j) => j.id === id);
    if (i < 0) return;
    this.jugadores.splice(i, 1);
    this.ajustarTrolls();
    this.eventos.push({ e: 'expulsado', pid: id });
    if (this.anfitrionId === id) this.anfitrionId = this.jugadores[0]?.id ?? null;
    if (this.fase === 'lobby' || this.fase === 'final') return;
    if (this.jugadores.length === 0) {
      this.fase = 'lobby';
      return;
    }
    if (this.liderId === id && (this.fase === 'puja' || this.fase === 'ultima')) {
      // Se fue el que iba ganando: la carta vuelve a su precio mínimo.
      this.liderId = null;
      this.precio = this.cartaActual()!.precioMinimo;
      this.ofertas = [];
      this.fijarFase('puja', this.ajustes.segundos * 1000, ahora);
    }
    if (this.fase === 'ruleta' && this.ruleta?.ganador === id) this.fijarFase('ultima', 1, ahora);
    if ((this.fase === 'presenta' || this.fase === 'puja' || this.fase === 'ultima') && this.pendientes().length === 0) {
      this.estados[this.cartaIdx] = 'sobrante';
      this.terminarRonda(ahora);
    }
  }

  cambiarAjustes(parcial: Partial<Ajustes>) {
    if (this.fase !== 'lobby') {
      // En plena partida solo se puede cambiar lo cosmético.
      if (parcial.tema) this.ajustes.tema = parcial.tema;
      if (parcial.intensidad) this.ajustes.intensidad = parcial.intensidad;
      return;
    }
    const a = { ...this.ajustes, ...parcial };
    const lim = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
    a.presupuesto = lim(a.presupuesto, 100, 5000);
    a.incremento = lim(a.incremento, 1, 50);
    a.segundos = lim(a.segundos, 5, 60);
    a.extra = lim(a.extra, 0, 2);
    a.skips = lim(a.skips, 0, 5);
    a.trollsMin = lim(a.trollsMin, 0, 5);
    a.trollsMax = Math.max(a.trollsMin, lim(a.trollsMax, 0, 5));
    a.trollsAuto = !!a.trollsAuto;
    a.trollsCamuflados = !!a.trollsCamuflados;
    // Tocar los valores a mano apaga el modo automático.
    if ((parcial.trollsMin !== undefined || parcial.trollsMax !== undefined) && parcial.trollsAuto === undefined) a.trollsAuto = false;
    a.ultimaOportunidad = lim(a.ultimaOportunidad, 3, 30);
    a.forzar = !!a.forzar;
    a.intensidad = lim(a.intensidad, 1, 3) as 1 | 2 | 3;
    const ordenOk =
      Array.isArray(a.orden) && a.orden.length === FORMACION.length && new Set(a.orden).size === FORMACION.length && a.orden.every((n) => n >= 0 && n < FORMACION.length);
    if (!ordenOk) a.orden = [...AJUSTES_DEFECTO.orden];
    this.ajustes = a;
    this.ajustarTrolls();
    for (const j of this.jugadores) {
      j.saldo = a.presupuesto;
      j.skips = a.skips;
    }
  }

  /** En modo automático, el rango de trolls por ronda sigue a la cantidad de participantes. */
  private ajustarTrolls() {
    if (!this.ajustes.trollsAuto || this.fase !== 'lobby') return;
    const r = rangoTrolls(Math.max(2, this.jugadores.length));
    this.ajustes = { ...this.ajustes, trollsMin: r.min, trollsMax: r.max };
  }

  // ───────────── Arranque ─────────────

  empezar(pool: readonly Jugador[], trolls: readonly Troll[], semilla: number, ahora: number): boolean {
    if (this.fase !== 'lobby' || this.jugadores.length < 2) return false;
    this.ajustarTrolls();
    this.mazo = generarMazo(pool, trolls, this.jugadores.length, this.ajustes, semilla);
    this.pisos = pisosDeRonda(this.mazo);
    this.ruletas = 0;
    this.reponer = crearReponedor(pool, trolls, this.mazo, semilla);
    for (const j of this.jugadores) {
      j.saldo = this.ajustes.presupuesto;
      j.skips = this.ajustes.skips;
      j.equipo = FORMACION.map(() => null);
      j.gastado = 0;
    }
    this.historial = [];
    this.final = undefined;
    this.sobrantes = undefined;
    this.secos.clear();
    this.rondaIdx = -1;
    this.cartaIdx = -1;
    this.limpiarCarta();
    this.hechos.push({ h: 'inicio' });
    this.fijarFase('intro', this.tiempos.intro, ahora);
    return true;
  }

  /** El anfitrión corta la partida: se muestran los resultados con lo que cada uno tiene hasta ahora. */
  terminar() {
    if (this.fase === 'lobby' || this.fase === 'final') return;
    this.pausa = false;
    this.panel = null;
    this.limpiarCarta();
    this.final = calcularFinal(this.jugadores, this.historial, this.ajustes);
    this.fase = 'final';
    const p = this.final.puestos;
    if (p.length) this.hechos.push({ h: 'final', ganadorId: p[0].pid, ultimoId: p[p.length - 1].pid });
  }

  revancha() {
    this.fase = 'lobby';
    this.pausa = false;
    this.mazo = null;
    this.rondaIdx = -1;
    this.cartaIdx = -1;
    this.final = undefined;
    this.sobrantes = undefined;
    this.historial = [];
    this.limpiarCarta();
    for (const j of this.jugadores) {
      j.saldo = this.ajustes.presupuesto;
      j.skips = this.ajustes.skips;
      j.equipo = FORMACION.map(() => null);
      j.gastado = 0;
    }
  }

  // ───────────── Consultas ─────────────

  rondaActual() {
    return this.mazo && this.rondaIdx >= 0 ? this.mazo.rondas[this.rondaIdx] : null;
  }

  cartaActual(): Carta | null {
    const r = this.rondaActual();
    return r && this.cartaIdx >= 0 ? (r.cartas[this.cartaIdx] ?? null) : null;
  }

  /** Participantes que todavía no compraron en la ronda actual. */
  pendientes(): Participante[] {
    return this.jugadores.filter((j) => !this.comproEnRonda.has(j.id));
  }

  /** Cartas de la ronda aún sin resolver (incluye la actual mientras no tenga desenlace). */
  restantes(): number {
    let n = this.estados.filter((e) => e === 'espera').length;
    if (this.estados[this.cartaIdx] === 'actual' && !this.desenlace) n++;
    return n;
  }

  /** Cuántas cartas se pueden descartar todavía sin dejar a nadie sin jugador. */
  sobran(): number {
    return Math.max(0, this.restantes() - this.pendientes().length);
  }

  /** Reserva: el precio más barato de cada ronda futura. Garantiza que todos puedan completar su equipo. */
  reserva(): number {
    let s = 0;
    for (let r = this.rondaIdx + 1; r < this.pisos.length; r++) s += this.pisos[r];
    return s;
  }

  tope(j: Participante): number {
    return Math.max(0, j.saldo - this.reserva());
  }

  proximoVencimiento(): number | null {
    if (this.pausa) return null;
    if (this.fase === 'lobby' || this.fase === 'final') return null;
    return this.vence;
  }

  // ───────────── Acciones de los jugadores ─────────────

  /** Oferta de un toque (+incremento) o, si viene `monto`, una cifra elegida (mayor que el precio actual). */
  ofertar(pid: string, uid: string, ahora: number, monto?: number): boolean {
    const rechazar = (motivo: MotivoRechazo) => {
      this.eventos.push({ e: 'rechazo', pid, motivo });
      this.hechos.push({ h: 'rechazo', pid, motivo });
      return false;
    };
    const j = this.jugador(pid);
    if (!j) return false;
    if (this.pausa) return rechazar('pausa');
    const carta = this.cartaActual();
    if (!carta || carta.uid !== uid || (this.fase !== 'puja' && this.fase !== 'ultima')) {
      // Llegó después del martillazo (o antes de que abra la puja).
      if (this.fase === 'presenta' && carta?.uid === uid) return false;
      return rechazar('tarde');
    }
    if (ahora >= this.vence) return rechazar('tarde');
    if (this.comproEnRonda.has(pid)) return rechazar('ya_compraste');
    if (this.liderId === pid) return rechazar('ya_lideras');
    const minimo = this.precio + this.ajustes.incremento;
    // Si alguien ya pasó la cifra elegida mientras la escribía, se avisa en vez de ofertar algo distinto.
    if (monto !== undefined && Math.round(monto) < minimo) return rechazar('superado');
    const nuevo = monto !== undefined ? Math.round(monto) : minimo;
    if (nuevo > this.tope(j)) {
      if (!this.secos.has(pid)) {
        this.secos.add(pid);
        this.hechos.push({ h: 'seco', pid });
      }
      return rechazar('sin_saldo');
    }
    const anterior = this.liderId;
    this.precio = nuevo;
    this.liderId = pid;
    this.totalOfertas++;
    this.ofertas.push({ pid, precio: nuevo, t: ahora });
    if (this.ofertas.length > 8) this.ofertas.shift();
    this.eventos.push({ e: 'oferta', pid, precio: nuevo });
    const sobre = nuevo - carta.precioMinimo;
    if (anterior && sobre > 0 && sobre % 25 === 0) this.hechos.push({ h: 'guerra', pid, rivalId: anterior, precio: nuevo });
    // Cada oferta recarga el contador completo.
    this.fijarFase('puja', this.ajustes.segundos * 1000, ahora);
    return true;
  }

  saltear(pid: string, uid: string, ahora: number): boolean {
    const rechazar = (motivo: MotivoRechazo) => {
      this.eventos.push({ e: 'rechazo', pid, motivo });
      return false;
    };
    const j = this.jugador(pid);
    const carta = this.cartaActual();
    if (!j || !carta) return false;
    if (this.pausa) return rechazar('pausa');
    if (carta.uid !== uid || this.fase !== 'puja' || ahora >= this.vence) return rechazar('tarde');
    if (this.comproEnRonda.has(pid)) return rechazar('ya_compraste');
    if (this.liderId) return rechazar('hay_ofertas');
    if (j.skips <= 0) return rechazar('sin_skips');
    if (this.sobran() <= 0) return rechazar('no_sobran');
    j.skips--;
    this.desenlace = 'salteada';
    this.salteadaPor = pid;
    this.hechos.push({ h: 'salteada', pid, carta });
    this.fijarFase('martillo', this.tiempos.martilloMenor, ahora);
    return true;
  }

  pausar(on: boolean, ahora: number) {
    if (this.fase === 'lobby' || this.fase === 'final' || this.pausa === on) return;
    if (on) {
      this.pausa = true;
      this.pausaResto = Math.max(0, this.vence - ahora);
    } else {
      this.pausa = false;
      this.vence = ahora + this.pausaResto;
    }
  }

  // ───────────── Reloj ─────────────

  /** Avanza la máquina de estados todo lo que el reloj permita. Devuelve true si algo cambió. */
  avanzar(ahora: number): boolean {
    let cambio = false;
    for (let i = 0; i < 12; i++) {
      if (this.pausa || this.fase === 'lobby' || this.fase === 'final' || ahora < this.vence) break;
      this.transicion(this.vence);
      cambio = true;
    }
    return cambio;
  }

  private fijarFase(fase: Fase, ms: number, ahora: number) {
    this.fase = fase;
    this.duracion = ms;
    this.vence = ahora + ms;
  }

  private limpiarCarta() {
    this.precio = 0;
    this.liderId = null;
    this.ofertas = [];
    this.totalOfertas = 0;
    this.desenlace = undefined;
    this.compradorId = undefined;
    this.pagado = undefined;
    this.salteadaPor = undefined;
    this.ruleta = undefined;
  }

  private transicion(t: number) {
    switch (this.fase) {
      case 'intro':
        return this.iniciarRonda(0, t);
      case 'ronda':
        return this.presentar(0, t);
      case 'presenta': {
        const pend = this.pendientes();
        if (this.ajustes.forzar && pend.length === 1 && this.restantes() === 1) {
          // Último participante, última carta: es suya al precio mínimo, sin subasta.
          const carta = this.cartaActual()!;
          return this.adjudicar(pend[0], Math.min(carta.precioMinimo, this.tope(pend[0])), 'obligado', t);
        }
        return this.fijarFase('puja', this.ajustes.segundos * 1000, t);
      }
      case 'puja': {
        const carta = this.cartaActual()!;
        if (this.liderId) return this.adjudicar(this.jugador(this.liderId)!, this.precio, 'vendido', t);
        if (this.sobran() > 0) return this.pasar(carta, t);
        if (!this.ajustes.forzar) {
          // Regla desactivada: la ronda se alarga con otra carta.
          const extra = this.reponer?.(carta.hueco);
          if (extra) {
            this.rondaActual()!.cartas.push(extra);
            this.estados.push('espera');
            return this.pasar(carta, t);
          }
        }
        this.hechos.push({ h: 'ultima' });
        return this.fijarFase('ultima', this.ajustes.ultimaOportunidad * 1000, t);
      }
      case 'ultima': {
        const carta = this.cartaActual()!;
        if (this.liderId) return this.adjudicar(this.jugador(this.liderId)!, this.precio, 'vendido', t);
        const pend = this.pendientes();
        const pueden = pend.filter((j) => this.tope(j) >= carta.precioMinimo);
        const liquidacion = pueden.length === 0;
        const candidatos = liquidacion ? pend : pueden;
        const azar = crearRng(((this.mazo!.semilla ^ 0x9e3779b9) + this.ruletas++) >>> 0);
        const ganador = candidatos[Math.floor(azar() * candidatos.length)];
        this.ruleta = { candidatos: candidatos.map((j) => j.id), ganador: ganador.id, liquidacion };
        return this.fijarFase('ruleta', this.tiempos.ruleta, t);
      }
      case 'ruleta': {
        const carta = this.cartaActual()!;
        const g = this.jugador(this.ruleta!.ganador)!;
        return this.adjudicar(g, Math.min(carta.precioMinimo, this.tope(g)), 'ruleta', t);
      }
      case 'martillo': {
        const carta = this.cartaActual()!;
        // Recién acá la identidad pasa a ser pública: se suma al equipo y al historial.
        const vista = this.vistaCarta(carta);
        if (this.compradorId) {
          const j = this.jugador(this.compradorId);
          if (j) j.equipo[carta.hueco] = { ...vista, pagado: this.pagado! };
        }
        this.historial.push({ ronda: this.rondaIdx, desenlace: this.desenlace!, carta: vista, compradorId: this.compradorId, precio: this.pagado, t });
        const grande = carta.rareza === 'prime' || carta.rareza === 'leyenda' || carta.rareza === 'troll';
        const ms = this.compradorId ? (grande ? this.tiempos.revelaGrande : this.tiempos.revela) : this.tiempos.revelaCorta;
        return this.fijarFase('revela', ms, t);
      }
      case 'revela': {
        this.estados[this.cartaIdx] = this.desenlace === 'pasa' ? 'pasada' : this.desenlace === 'salteada' ? 'salteada' : 'vendida';
        if (this.pendientes().length === 0) return this.terminarRonda(t);
        let sig = this.estados.indexOf('espera');
        if (sig < 0) {
          const extra = this.reponer?.(this.rondaActual()!.hueco);
          if (!extra) return this.terminarRonda(t);
          this.rondaActual()!.cartas.push(extra);
          this.estados.push('espera');
          sig = this.estados.length - 1;
        }
        return this.presentar(sig, t);
      }
      case 'finronda': {
        if (this.rondaIdx + 1 < this.mazo!.rondas.length) return this.iniciarRonda(this.rondaIdx + 1, t);
        this.final = calcularFinal(this.jugadores, this.historial, this.ajustes);
        this.fase = 'final';
        const p = this.final.puestos;
        if (p.length) this.hechos.push({ h: 'final', ganadorId: p[0].pid, ultimoId: p[p.length - 1].pid });
        return;
      }
    }
  }

  private iniciarRonda(idx: number, t: number) {
    this.rondaIdx = idx;
    this.cartaIdx = -1;
    this.comproEnRonda = new Set();
    const r = this.mazo!.rondas[idx];
    this.estados = r.cartas.map(() => 'espera');
    this.compradores = [];
    this.preciosVenta = [];
    this.sobrantes = undefined;
    this.limpiarCarta();
    this.hechos.push({ h: 'ronda', indice: idx });
    this.fijarFase('ronda', this.tiempos.ronda, t);
  }

  private presentar(idx: number, t: number) {
    this.cartaIdx = idx;
    this.estados[idx] = 'actual';
    this.limpiarCarta();
    this.precio = this.cartaActual()!.precioMinimo;
    this.fijarFase('presenta', this.tiempos.presenta, t);
  }

  private pasar(carta: Carta, t: number) {
    this.desenlace = 'pasa';
    this.hechos.push({ h: 'pasa', carta });
    this.fijarFase('martillo', this.tiempos.martilloMenor, t);
  }

  private adjudicar(j: Participante, precio: number, desenlace: Desenlace, t: number) {
    const carta = this.cartaActual()!;
    const pago = Math.max(1, Math.round(precio));
    j.saldo -= pago;
    j.gastado += pago;
    this.comproEnRonda.add(j.id);
    this.desenlace = desenlace;
    this.compradorId = j.id;
    this.pagado = pago;
    this.compradores[this.cartaIdx] = j.id;
    this.preciosVenta[this.cartaIdx] = pago;
    if (desenlace === 'vendido') {
      const rival = [...this.ofertas].reverse().find((o) => o.pid !== j.id)?.pid;
      this.hechos.push({ h: 'vendido', pid: j.id, carta, precio: pago, rivalId: rival, ofertas: this.totalOfertas });
    } else if (desenlace === 'obligado') this.hechos.push({ h: 'obligado', pid: j.id, carta, precio: pago });
    else this.hechos.push({ h: 'ruleta', pid: j.id, carta, precio: pago, liquidacion: !!this.ruleta?.liquidacion });
    this.fijarFase('martillo', this.tiempos.martillo, t);
  }

  private terminarRonda(t: number) {
    const r = this.rondaActual()!;
    // Las cartas que nadie llegó a ver se muestran en el resumen ("mirá lo que te perdiste").
    this.sobrantes = [];
    this.estados.forEach((e, i) => {
      if (e === 'espera' || e === 'sobrante') {
        this.estados[i] = 'sobrante';
        this.sobrantes!.push(this.vistaCarta(r.cartas[i]));
      }
    });
    this.cartaIdx = -1;
    this.limpiarCarta();
    this.fijarFase('finronda', this.tiempos.finronda, t);
  }

  // ───────────── Vista pública ─────────────

  img(c: Carta) {
    return `/c/${this.codigo}/${c.token}`;
  }

  /** Imagen que se ve antes de la revelación (la silueta del disfraz, si la carta es un troll). */
  imgMisterio(c: Carta) {
    return `/c/${this.codigo}/${c.tokenSilueta ?? c.token}`;
  }

  vistaCarta(c: Carta): CartaVista {
    return {
      uid: c.uid,
      tipo: c.tipo,
      nombre: c.nombre,
      apellido: c.apellido,
      pais: c.pais,
      rating: c.rating,
      rareza: c.rareza,
      etiqueta: c.etiqueta,
      dato: c.dato,
      precioMinimo: c.precioMinimo,
      img: this.img(c),
      pos: c.pos,
      hueco: c.hueco,
      marco: c.marco,
    };
  }

  vista(trollsDisponibles = 0): Omit<EstadoPublico, 'ticker'> {
    const r = this.rondaActual();
    const reserva = this.mazo ? this.reserva() : 0;
    const jugadores: JugadorSala[] = this.jugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      avatar: j.avatar,
      color: j.color,
      conectado: j.conectado,
      saldo: j.saldo,
      skips: j.skips,
      reserva,
      tope: this.mazo ? this.tope(j) : j.saldo,
      equipo: j.equipo,
      gastado: j.gastado,
    }));

    let ronda: EstadoPublico['ronda'] = null;
    let carta: CartaActualVista | null = null;
    let proximaImg: string | undefined;
    if (r && this.fase !== 'final') {
      const cartas: CartaRondaVista[] = r.cartas.map((c, i) => {
        let estado = this.estados[i] ?? 'espera';
        if (estado === 'actual' && this.desenlace) {
          estado = this.desenlace === 'pasa' ? 'pasada' : this.desenlace === 'salteada' ? 'salteada' : 'vendida';
          // Resuelta pero todavía sin revelar: se informa el desenlace, no la identidad.
          if (this.fase !== 'revela') return { estado, compradorId: this.compradores[i], precio: this.preciosVenta[i] };
        }
        const publica = estado === 'vendida' || estado === 'pasada' || estado === 'salteada' || estado === 'sobrante';
        return publica
          ? { estado, compradorId: this.compradores[i], precio: this.preciosVenta[i], rareza: c.rareza, nombre: c.apellido || c.nombre, img: this.img(c) }
          : { estado };
      });
      ronda = {
        indice: this.rondaIdx,
        total: this.mazo!.rondas.length,
        hueco: r.hueco,
        pos: r.pos,
        cartas,
        pendientes: this.pendientes().map((j) => j.id),
        sobran: this.sobran(),
      };
      const c = this.cartaActual();
      if (c) {
        carta = {
          uid: c.uid,
          img: this.imgMisterio(c),
          pos: c.pos,
          precioMinimo: c.precioMinimo,
          precio: this.precio,
          liderId: this.liderId,
          ofertas: this.ofertas,
          vence: this.vence,
          duracion: this.duracion,
          desenlace: this.desenlace,
          compradorId: this.compradorId,
          pagado: this.pagado,
          salteadaPor: this.salteadaPor,
          ruleta: this.fase === 'ruleta' || this.desenlace === 'ruleta' ? this.ruleta : undefined,
          revelada: this.fase === 'revela' ? this.vistaCarta(c) : undefined,
        };
      }
      // Precarga: la próxima carta en espera (o la primera de la ronda siguiente).
      const sig = r.cartas.find((_, i) => this.estados[i] === 'espera');
      const prox = sig ?? this.mazo!.rondas[this.rondaIdx + 1]?.cartas[0];
      if (prox) proximaImg = this.imgMisterio(prox);
    } else if (this.mazo && this.fase === 'intro') {
      proximaImg = this.imgMisterio(this.mazo.rondas[0].cartas[0]);
    }

    return {
      codigo: this.codigo,
      fase: this.fase,
      pausa: this.pausa,
      pausaResto: this.pausa ? this.pausaResto : undefined,
      ajustes: this.ajustes,
      anfitrionId: this.anfitrionId,
      jugadores,
      ronda,
      carta,
      proximaImg,
      historial: this.historial,
      vence: this.vence,
      duracion: this.duracion,
      semilla: this.mazo?.semilla,
      final: this.final,
      sobrantes: this.fase === 'finronda' ? this.sobrantes : undefined,
      trollsDisponibles,
      panel: this.panel,
    };
  }

  // ───────────── Copia de seguridad ─────────────

  private static CAMPOS = ['ajustes', 'jugadores', 'anfitrionId', 'fase', 'pausa', 'pausaResto', 'panel', 'mazo', 'pisos', 'rondaIdx', 'cartaIdx', 'estados', 'compradores', 'preciosVenta', 'precio', 'liderId', 'ofertas', 'totalOfertas', 'vence', 'duracion', 'desenlace', 'compradorId', 'pagado', 'salteadaPor', 'ruleta', 'sobrantes', 'final', 'historial', 'ruletas'] as const;

  /** Estado completo en un objeto plano (para guardarlo y restaurarlo si el servidor se reinicia). */
  exportar(): Record<string, unknown> {
    const o: Record<string, unknown> = {};
    for (const k of Partida.CAMPOS) o[k] = this[k];
    o.comproEnRonda = [...this.comproEnRonda];
    o.secos = [...this.secos];
    return o;
  }

  importar(o: Record<string, unknown>, pool: readonly Jugador[], trolls: readonly Troll[], ahora: number) {
    for (const k of Partida.CAMPOS) if (k in o) (this as Record<string, unknown>)[k] = o[k];
    this.comproEnRonda = new Set((o.comproEnRonda as string[]) ?? []);
    this.secos = new Set((o.secos as string[]) ?? []);
    if (this.mazo) this.reponer = crearReponedor(pool, trolls, this.mazo, this.mazo.semilla);
    // Nadie está conectado todavía, y la fase en curso retoma con un respiro.
    for (const j of this.jugadores) j.conectado = false;
    if (this.fase !== 'lobby' && this.fase !== 'final' && !this.pausa) this.vence = Math.max(this.vence, ahora + 2500);
  }

  /** Busca la foto real detrás de un token (para servir la imagen sin revelar la identidad en la URL). */
  fotoDeToken(token: string): string | null {
    if (!this.mazo) return null;
    for (const r of this.mazo.rondas)
      for (const c of r.cartas) {
        if (c.token === token) return c.foto;
        if (c.tokenSilueta === token) return c.fotoSilueta ?? null;
      }
    return null;
  }
}
