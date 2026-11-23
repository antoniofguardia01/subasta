// El Impostor futbolero: todos ven el mismo futbolista (o club) menos el impostor. Se habla en voz alta,
// se vota en el celular, el más votado queda eliminado. Máquina de estados pura: el servidor llama avanzar(ahora).
//
// lobby → reparto → debate → votacion → veredicto → (debate… | finronda) → (reparto… | final)
import { barajar, crearRng, Rng } from './rng';
import { COLORES_EQUIPO } from './types';

export type FaseImp = 'lobby' | 'reparto' | 'debate' | 'votacion' | 'veredicto' | 'finronda' | 'final';
export type ModoImp = 'jugadores' | 'clubes';
/** no = sin trolls (todos los futbolistas) · solo = únicamente trolls (los amigos). */
export type TrollsImp = 'no' | 'solo';

export interface AjustesImp {
  /** Qué se esconde: un futbolista o un club. */
  modo: ModoImp;
  rondas: number;
  /** Trolls (los amigos) como secreto: sin trolls o solo trolls. Solo en la versión futbolistas. */
  trolls: TrollsImp;
  /** Con menos de MIN_DOS_IMPOSTORES participantes se juega con uno aunque digan 2. */
  impostores: 1 | 2;
  /** Segundos para hablar antes de votar. */
  debate: number;
  /** Modo tragos: cada vez que te eliminan, tomas. */
  tragos: boolean;
  tema: string;
}

export const AJUSTES_IMP: AjustesImp = { modo: 'jugadores', trolls: 'no', rondas: 5, impostores: 1, debate: 90, tragos: false, tema: 'estadio' };

export const LIMITES_IMP = { rondasMin: 1, rondasMax: 10, debateMin: 30, debateMax: 300 } as const;
export const MIN_IMP = 3;
export const MAX_IMP = 12;
export const MIN_DOS_IMPOSTORES = 6;

export const TIEMPOS_IMP = {
  /** Tiempo máximo para que todos miren su carta (sigue antes si todos tocan "Listo"). */
  reparto: 30_000,
  votacion: 30_000,
  veredicto: 9_000,
  finronda: 25_000,
  /** Las votaciones siguientes dan menos tiempo para hablar. */
  debateSiguiente: 0.5,
};

export const PUNTOS_IMP = {
  /** El impostor llega al final sin que lo descubran. */
  impostorGana: 3,
  /** Cada participante (no impostor) cuando el grupo gana. */
  grupoGana: 1,
  /** Extra para quien votó al impostor en la votación que lo eliminó. */
  buenOjo: 1,
};

/** Lo que se esconde en la ronda: un futbolista o un club. */
export interface Secreto {
  tipo: 'jugador' | 'club' | 'troll';
  id: string;
  nombre: string;
  /** Línea chica: posición y país, o liga y país. */
  detalle: string;
  /** Para buscar señuelos parecidos (posición o liga). */
  grupo: string;
  img?: string;
  colores?: [string, string];
  sigla?: string;
  apodo?: string;
}

export interface ParticipanteImp {
  id: string;
  nombre: string;
  avatar: string;
  color: string;
  conectado: boolean;
  puntos: number;
  tragos: number;
  eliminado: number;
  impostor: number;
  /** Rondas ganadas (con su bando). */
  ganadas: number;
}

export interface Veredicto {
  /** null = empate o nadie votó. */
  pid: string | null;
  eraImpostor: boolean;
  empate: boolean;
  conteo: Record<string, number>;
  /** Quién votó a quién (se muestra en el veredicto). */
  votos: Record<string, string>;
  votacion: number;
}

export type Ganador = 'grupo' | 'impostor';
export type Motivo = 'descubierto' | 'sobrevivio' | 'empates' | 'abandono';

interface Ronda {
  n: number;
  secreto: Secreto;
  impostores: string[];
  participantes: string[];
  /** Orden para decir la palabra: se sortea de nuevo en cada ronda. */
  orden: string[];
  vivos: string[];
  vistos: string[];
  votacion: number;
  votos: Record<string, string>;
  empates: number;
  veredictos: Veredicto[];
  buenOjo: string[];
  ganador: Ganador | null;
  motivo: Motivo | null;
  puntos: Record<string, number>;
}

export interface ResumenRonda {
  n: number;
  secreto: Secreto;
  impostores: string[];
  ganador: Ganador;
  motivo: Motivo;
}

export interface JugadorImpVista {
  id: string;
  nombre: string;
  avatar: string;
  color: string;
  conectado: boolean;
  puntos: number;
  tragos: number;
  eliminado: number;
  ganadas: number;
}

export interface RondaVista {
  n: number;
  nImpostores: number;
  participantes: string[];
  /** Orden para hablar (solo los que siguen en pie). */
  orden: string[];
  vivos: string[];
  vistos: string[];
  votacion: number;
  votaron: string[];
  empates: number;
  eliminados: { pid: string; eraImpostor: boolean; votacion: number }[];
  veredicto: Veredicto | null;
  // Se revela al terminar la ronda:
  secreto: Secreto | null;
  impostores: string[] | null;
  ganador: Ganador | null;
  motivo: Motivo | null;
  puntos: Record<string, number> | null;
  buenOjo: string[] | null;
}

export interface EstadoImp {
  juego: 'impostor';
  codigo: string;
  fase: FaseImp;
  ajustes: AjustesImp;
  anfitrionId: string | null;
  jugadores: JugadorImpVista[];
  vence: number;
  duracion: number;
  rondaN: number;
  ronda: RondaVista | null;
  historial: ResumenRonda[];
  /** Cuántos secretos hay disponibles con el modo elegido. */
  disponibles: number;
  /** Lo que solo ve este celular. */
  tu: { impostor: boolean; secreto: Secreto | null; companeros: string[]; voto: string | null; visto: boolean } | null;
}

export type MsgClienteImp =
  | { t: 'hola'; clave: string; rol: 'jugador' | 'escenario' }
  | { t: 'entrar'; nombre: string; avatar: string }
  | { t: 'ajustes'; ajustes: Partial<AjustesImp> }
  | { t: 'empezar' }
  | { t: 'visto' }
  | { t: 'votar'; pid: string }
  | { t: 'aVotar' }
  | { t: 'masTiempo' }
  | { t: 'siguiente' }
  | { t: 'expulsar'; pid: string }
  | { t: 'anfitrion'; pid: string }
  | { t: 'salir' }
  | { t: 'terminar' }
  | { t: 'revancha' }
  | { t: 'ping'; t0: number };

type Res = { ok: true } | { ok: false; codigo: string; texto: string };

export class PartidaImp {
  fase: FaseImp = 'lobby';
  ajustes: AjustesImp = { ...AJUSTES_IMP };
  jugadores: ParticipanteImp[] = [];
  anfitrionId: string | null = null;
  vence = 0;
  duracion = 0;
  rondaN = 0;
  ronda: Ronda | null = null;
  usados: string[] = [];
  historial: ResumenRonda[] = [];
  semilla = 1;
  private rng: Rng = crearRng(1);
  private pasos = 0;

  constructor(public codigo: string) {}

  jugador(id: string) {
    return this.jugadores.find((j) => j.id === id);
  }

  // ───────────── Lobby ─────────────

  entrar(id: string, nombre: string, avatar: string): Res {
    const limpio = nombre.trim().replace(/\s+/g, ' ').slice(0, 14);
    if (limpio.length < 2) return { ok: false, codigo: 'nombre_corto', texto: 'Ponte un nombre de al menos 2 letras.' };
    if (this.jugadores.some((j) => j.id !== id && j.nombre.toLowerCase() === limpio.toLowerCase()))
      return { ok: false, codigo: 'nombre_tomado', texto: `Ya hay un "${limpio}" en la sala. Sé original.` };
    const ya = this.jugador(id);
    if (ya) {
      ya.nombre = limpio;
      ya.avatar = avatar;
      return { ok: true };
    }
    if (this.fase !== 'lobby') return { ok: false, codigo: 'en_juego', texto: 'La partida ya arrancó. Espera la revancha.' };
    if (this.jugadores.length >= MAX_IMP) return { ok: false, codigo: 'llena', texto: `La sala está llena (${MAX_IMP}).` };
    const color = COLORES_EQUIPO.find((c) => !this.jugadores.some((j) => j.color === c)) ?? COLORES_EQUIPO[this.jugadores.length % COLORES_EQUIPO.length];
    this.jugadores.push({ id, nombre: limpio, avatar, color, conectado: true, puntos: 0, tragos: 0, eliminado: 0, impostor: 0, ganadas: 0 });
    if (!this.anfitrionId) this.anfitrionId = id;
    return { ok: true };
  }

  conectar(id: string, on: boolean) {
    const j = this.jugador(id);
    if (j) j.conectado = on;
  }

  cambiarAjustes(p: Partial<AjustesImp>) {
    if (this.fase !== 'lobby' && this.fase !== 'final') {
      // En juego solo se puede cambiar el escenario.
      if (typeof p.tema === 'string') this.ajustes.tema = p.tema.slice(0, 20);
      return;
    }
    const a = this.ajustes;
    if (p.modo === 'jugadores' || p.modo === 'clubes') a.modo = p.modo;
    if (p.trolls === 'no' || p.trolls === 'solo') a.trolls = p.trolls;
    if (typeof p.rondas === 'number') a.rondas = Math.round(Math.min(LIMITES_IMP.rondasMax, Math.max(LIMITES_IMP.rondasMin, p.rondas)));
    if (p.impostores === 1 || p.impostores === 2) a.impostores = p.impostores;
    if (typeof p.debate === 'number') a.debate = Math.round(Math.min(LIMITES_IMP.debateMax, Math.max(LIMITES_IMP.debateMin, p.debate)));
    if (typeof p.tragos === 'boolean') a.tragos = p.tragos;
    if (typeof p.tema === 'string') a.tema = p.tema.slice(0, 20);
  }

  /** Impostores que de verdad se usan con la gente que hay. */
  nImpostores(n = this.jugadores.length) {
    return this.ajustes.impostores === 2 && n >= MIN_DOS_IMPOSTORES ? 2 : 1;
  }

  empezar(candidatos: Secreto[], semilla: number, ahora: number): Res {
    if (this.fase !== 'lobby' && this.fase !== 'final') return { ok: false, codigo: 'en_juego', texto: 'Ya están jugando.' };
    if (this.jugadores.length < MIN_IMP) return { ok: false, codigo: 'faltan', texto: `Hacen falta al menos ${MIN_IMP} para jugar al impostor.` };
    if (candidatos.length < 2) return { ok: false, codigo: 'sin_cartas', texto: 'No hay secretos para jugar.' };
    this.semilla = semilla >>> 0;
    this.rng = crearRng(this.semilla);
    this.pasos = 0;
    for (const j of this.jugadores) Object.assign(j, { puntos: 0, tragos: 0, eliminado: 0, impostor: 0, ganadas: 0 });
    this.rondaN = 0;
    this.usados = [];
    this.historial = [];
    this.nuevaRonda(candidatos, ahora);
    return { ok: true };
  }

  /** Mismo rng con la misma semilla tras restaurar: se avanza `pasos` veces. */
  private azar() {
    this.pasos++;
    return this.rng();
  }

  nuevaRonda(candidatos: Secreto[], ahora: number) {
    this.rondaN++;
    // Al azar entre todos los secretos posibles, sin repetir hasta agotar.
    const libres = candidatos.filter((c) => !this.usados.includes(c.id));
    const fuente = libres.length ? libres : candidatos;
    const secreto = fuente[Math.floor(this.azar() * fuente.length)];
    this.usados.push(secreto.id);
    const participantes = this.jugadores.map((j) => j.id);
    // Impostor al azar, pero con menos chances para quien ya lo fue más veces.
    const n = this.nImpostores();
    const impostores: string[] = [];
    for (let k = 0; k < n; k++) {
      const quedan = this.jugadores.filter((j) => !impostores.includes(j.id));
      const pesos = quedan.map((j) => 1 / (1 + j.impostor * 1.5));
      let r = this.azar() * pesos.reduce((a, b) => a + b, 0);
      let elegido = quedan[quedan.length - 1];
      for (let i = 0; i < quedan.length; i++) {
        r -= pesos[i];
        if (r <= 0) {
          elegido = quedan[i];
          break;
        }
      }
      impostores.push(elegido.id);
      elegido.impostor++;
    }
    // Orden para hablar: nuevo en cada ronda (el impostor puede caer en cualquier lugar).
    const orden = barajar(() => this.azar(), participantes);
    this.ronda = {
      n: this.rondaN,
      secreto,
      impostores,
      participantes,
      orden,
      vivos: participantes.slice(),
      vistos: [],
      votacion: 1,
      votos: {},
      empates: 0,
      veredictos: [],
      buenOjo: [],
      ganador: null,
      motivo: null,
      puntos: {},
    };
    this.fijar('reparto', TIEMPOS_IMP.reparto, ahora);
  }

  private fijar(fase: FaseImp, ms: number, ahora: number) {
    this.fase = fase;
    this.duracion = ms;
    this.vence = ms > 0 ? ahora + ms : 0;
  }

  // ───────────── Acciones ─────────────

  visto(pid: string, ahora: number) {
    const r = this.ronda;
    if (this.fase !== 'reparto' || !r || !r.participantes.includes(pid) || r.vistos.includes(pid)) return;
    r.vistos.push(pid);
    if (r.participantes.every((p) => r.vistos.includes(p))) this.debatir(ahora);
  }

  private debatir(ahora: number) {
    const r = this.ronda!;
    const seg = r.votacion === 1 ? this.ajustes.debate : Math.max(LIMITES_IMP.debateMin, Math.round(this.ajustes.debate * TIEMPOS_IMP.debateSiguiente));
    this.fijar('debate', seg * 1000, ahora);
  }

  /** El anfitrión o la TV cortan la charla. */
  aVotar(ahora: number) {
    if (this.fase === 'reparto') return this.debatir(ahora);
    if (this.fase !== 'debate') return;
    this.ronda!.votos = {};
    this.fijar('votacion', TIEMPOS_IMP.votacion, ahora);
  }

  masTiempo(ahora: number) {
    if (this.fase !== 'debate') return;
    this.vence = Math.max(this.vence, ahora) + 30_000;
    this.duracion = this.vence - ahora;
  }

  votar(pid: string, objetivo: string, ahora: number) {
    const r = this.ronda;
    if (this.fase !== 'votacion' || !r || !r.vivos.includes(pid) || !r.vivos.includes(objetivo) || pid === objetivo) return;
    r.votos[pid] = objetivo;
    if (r.vivos.every((p) => r.votos[p])) this.cerrarVotacion(ahora);
  }

  private cerrarVotacion(ahora: number) {
    const r = this.ronda!;
    const conteo: Record<string, number> = {};
    for (const [quien, a] of Object.entries(r.votos)) if (r.vivos.includes(quien) && r.vivos.includes(a)) conteo[a] = (conteo[a] ?? 0) + 1;
    const max = Math.max(0, ...Object.values(conteo));
    const top = Object.keys(conteo).filter((k) => conteo[k] === max);
    const v: Veredicto = { pid: null, eraImpostor: false, empate: true, conteo, votos: { ...r.votos }, votacion: r.votacion };
    if (max > 0 && top.length === 1) {
      const pid = top[0];
      v.pid = pid;
      v.empate = false;
      v.eraImpostor = r.impostores.includes(pid);
      r.vivos = r.vivos.filter((p) => p !== pid);
      const j = this.jugador(pid);
      if (j) {
        j.eliminado++;
        if (this.ajustes.tragos) j.tragos++;
      }
      if (v.eraImpostor) for (const [quien, a] of Object.entries(r.votos)) if (a === pid && !r.impostores.includes(quien) && !r.buenOjo.includes(quien)) r.buenOjo.push(quien);
    } else r.empates++;
    r.veredictos.push(v);
    this.fijar('veredicto', TIEMPOS_IMP.veredicto, ahora);
  }

  /** Después del veredicto: ¿sigue la ronda o termina? */
  private trasVeredicto(ahora: number) {
    const r = this.ronda!;
    const v = r.veredictos[r.veredictos.length - 1];
    const impVivos = r.impostores.filter((p) => r.vivos.includes(p));
    const grupoVivos = r.vivos.filter((p) => !r.impostores.includes(p));
    if (v?.eraImpostor && impVivos.length === 0) return this.terminarRonda('grupo', 'descubierto', ahora);
    if (impVivos.length >= grupoVivos.length) return this.terminarRonda('impostor', 'sobrevivio', ahora);
    if (r.empates >= 2) return this.terminarRonda('impostor', 'empates', ahora);
    r.votacion++;
    r.votos = {};
    this.debatir(ahora);
  }

  private terminarRonda(ganador: Ganador, motivo: Motivo, ahora: number) {
    const r = this.ronda!;
    r.ganador = ganador;
    r.motivo = motivo;
    const puntos: Record<string, number> = {};
    if (motivo !== 'abandono') {
      for (const pid of r.participantes) {
        const imp = r.impostores.includes(pid);
        let p = 0;
        if (ganador === 'impostor' && imp) p += PUNTOS_IMP.impostorGana;
        if (ganador === 'grupo' && !imp) p += PUNTOS_IMP.grupoGana;
        if (r.buenOjo.includes(pid)) p += PUNTOS_IMP.buenOjo;
        puntos[pid] = p;
        const j = this.jugador(pid);
        if (j) {
          j.puntos += p;
          if ((ganador === 'impostor') === imp) j.ganadas++;
        }
      }
    }
    r.puntos = puntos;
    this.historial.push({ n: r.n, secreto: r.secreto, impostores: r.impostores, ganador, motivo });
    this.fijar('finronda', TIEMPOS_IMP.finronda, ahora);
  }

  /** Tras la tabla: otra ronda o el final. Lo llama el reloj o el anfitrión. */
  siguiente(candidatos: Secreto[], ahora: number) {
    if (this.fase === 'veredicto') return this.trasVeredicto(ahora);
    if (this.fase !== 'finronda') return;
    if (this.rondaN >= this.ajustes.rondas || this.jugadores.length < MIN_IMP) return this.fijar('final', 0, ahora);
    this.nuevaRonda(candidatos, ahora);
  }

  terminar(ahora: number) {
    if (this.fase === 'lobby') return;
    this.fijar('final', 0, ahora);
  }

  revancha() {
    if (this.fase !== 'final') return;
    this.ronda = null;
    this.rondaN = 0;
    this.historial = [];
    for (const j of this.jugadores) Object.assign(j, { puntos: 0, tragos: 0, eliminado: 0, impostor: 0, ganadas: 0 });
    this.fijar('lobby', 0, 0);
  }

  expulsar(id: string, ahora: number) {
    const i = this.jugadores.findIndex((j) => j.id === id);
    if (i < 0) return;
    this.jugadores.splice(i, 1);
    if (this.anfitrionId === id) this.anfitrionId = this.jugadores[0]?.id ?? null;
    if (this.jugadores.length === 0) {
      this.ronda = null;
      return this.fijar('lobby', 0, 0);
    }
    const r = this.ronda;
    if (!r || this.fase === 'lobby' || this.fase === 'final' || this.fase === 'finronda') return;
    const eraImp = r.impostores.includes(id);
    r.participantes = r.participantes.filter((p) => p !== id);
    if (r.orden) r.orden = r.orden.filter((p) => p !== id);
    r.vivos = r.vivos.filter((p) => p !== id);
    r.vistos = r.vistos.filter((p) => p !== id);
    delete r.votos[id];
    if (eraImp && r.impostores.every((p) => p === id || !r.vivos.includes(p))) return this.terminarRonda('grupo', 'abandono', ahora);
    if (r.vivos.length < 2) return this.terminarRonda('impostor', 'abandono', ahora);
    if (this.fase === 'reparto' && r.participantes.every((p) => r.vistos.includes(p))) this.debatir(ahora);
    if (this.fase === 'votacion' && r.vivos.every((p) => r.votos[p])) this.cerrarVotacion(ahora);
  }

  // ───────────── Reloj ─────────────

  proximoVencimiento(): number | null {
    return this.vence > 0 ? this.vence : null;
  }

  /** Avanza lo que haya vencido. Devuelve true si algo cambió. */
  avanzar(ahora: number, candidatos: Secreto[]): boolean {
    if (!this.vence || ahora < this.vence) return false;
    switch (this.fase) {
      case 'reparto':
        this.debatir(ahora);
        break;
      case 'debate':
        this.aVotar(ahora);
        break;
      case 'votacion':
        this.cerrarVotacion(ahora);
        break;
      case 'veredicto':
        this.trasVeredicto(ahora);
        break;
      case 'finronda':
        this.siguiente(candidatos, ahora);
        break;
      default:
        this.vence = 0;
        return false;
    }
    return true;
  }

  // ───────────── Vista ─────────────

  vista(pid: string | null, disponibles: number): EstadoImp {
    const r = this.ronda;
    const fin = this.fase === 'finronda' || this.fase === 'final';
    const enVeredicto = this.fase === 'veredicto' || this.fase === 'finronda';
    let ronda: RondaVista | null = null;
    if (r && this.fase !== 'lobby') {
      const revelado = fin && r.ganador !== null;
      ronda = {
        n: r.n,
        nImpostores: r.impostores.length,
        participantes: r.participantes,
        orden: (r.orden ?? r.participantes).filter((p) => r.vivos.includes(p)),
        vivos: r.vivos,
        vistos: r.vistos,
        votacion: r.votacion,
        votaron: Object.keys(r.votos).filter((p) => r.vivos.includes(p)),
        empates: r.empates,
        eliminados: r.veredictos.filter((v) => v.pid).map((v) => ({ pid: v.pid!, eraImpostor: v.eraImpostor, votacion: v.votacion })),
        veredicto: enVeredicto || fin ? (r.veredictos[r.veredictos.length - 1] ?? null) : null,
        secreto: revelado ? r.secreto : null,
        impostores: revelado ? r.impostores : null,
        ganador: revelado ? r.ganador : null,
        motivo: revelado ? r.motivo : null,
        puntos: revelado ? r.puntos : null,
        buenOjo: revelado ? r.buenOjo : null,
      };
    }
    let tu: EstadoImp['tu'] = null;
    if (pid && r && this.fase !== 'lobby' && r.participantes.includes(pid)) {
      const imp = r.impostores.includes(pid);
      tu = {
        impostor: imp,
        secreto: imp ? null : r.secreto,
        companeros: imp ? r.impostores.filter((p) => p !== pid) : [],
        voto: r.votos[pid] ?? null,
        visto: r.vistos.includes(pid),
      };
    }
    return {
      juego: 'impostor',
      codigo: this.codigo,
      fase: this.fase,
      ajustes: this.ajustes,
      anfitrionId: this.anfitrionId,
      jugadores: this.jugadores.map(({ id, nombre, avatar, color, conectado, puntos, tragos, eliminado, ganadas }) => ({ id, nombre, avatar, color, conectado, puntos, tragos, eliminado, ganadas })),
      vence: this.vence,
      duracion: this.duracion,
      rondaN: this.rondaN,
      ronda,
      historial: this.historial,
      disponibles,
      tu,
    };
  }

  // ───────────── Copia de seguridad ─────────────

  exportar() {
    const { fase, ajustes, jugadores, anfitrionId, vence, duracion, rondaN, ronda, usados, historial, semilla, pasos } = this;
    return { fase, ajustes, jugadores, anfitrionId, vence, duracion, rondaN, ronda, usados, historial, semilla, pasos };
  }

  importar(d: ReturnType<PartidaImp['exportar']>, ahora: number) {
    Object.assign(this, { ...d, rng: crearRng(d.semilla) });
    for (let i = 0; i < d.pasos; i++) this.rng();
    // El reloj se reinicia desde ahora para no perder la fase en curso.
    if (this.vence) this.vence = ahora + Math.min(this.duracion, Math.max(5_000, this.vence - ahora));
    for (const j of this.jugadores) j.conectado = false;
    // Ajustes de versiones anteriores: "a veces"/"mezcla" pasa a sin trolls; la dificultad ya no existe.
    if (this.ajustes.trolls !== 'solo') this.ajustes.trolls = 'no';
    delete (this.ajustes as unknown as Record<string, unknown>).dificultad;
    // Una partida guardada con la vieja "última chance" en curso se cierra como si el impostor no hubiera adivinado.
    if ((this.fase as string) === 'adivina' && this.ronda) this.terminarRonda('grupo', 'descubierto', ahora);
  }
}
