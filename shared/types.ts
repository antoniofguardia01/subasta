// Tipos compartidos entre el motor, el servidor (Durable Object) y el cliente.

export type Pos = 'POR' | 'LD' | 'DFC' | 'LI' | 'MCD' | 'MC' | 'MCO' | 'ED' | 'DC' | 'EI';
export type Rareza = 'comun' | 'plata' | 'oro' | 'prime' | 'leyenda' | 'troll';

/** Formación fija 4-3-3: los 11 huecos, en el orden de rondas por defecto. */
export const FORMACION: Pos[] = ['POR', 'LD', 'DFC', 'DFC', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'DC', 'EI'];

export const POS_NOMBRE: Record<Pos, string> = {
  POR: 'Arquero',
  LD: 'Lateral derecho',
  DFC: 'Defensor central',
  LI: 'Lateral izquierdo',
  MCD: 'Volante de marca',
  MC: 'Mediocampista',
  MCO: 'Enganche',
  ED: 'Extremo derecho',
  DC: 'Centrodelantero',
  EI: 'Extremo izquierdo',
};

export interface Jugador {
  id: string;
  nombre: string;
  apellido: string;
  pos: Pos;
  pais: string;
  rating: number;
  rareza: Exclude<Rareza, 'troll'>;
  precioMinimo: number;
  /** Etiqueta corta bajo el nombre, estilo "2026 PRIME WC". */
  etiqueta: string;
  /** Dato curioso o chiste que acompaña la revelación. */
  dato: string;
  /** Rutas de foto (variantes). Se elige una al azar por partida. */
  fotos: string[];
}

export interface Troll {
  id: string;
  nombre: string;
  descripcion: string;
  precioMinimo: number;
  rating: number;
  foto: string;
  activo: boolean;
  /** true mientras no tenga nombre/descripción puestos por el admin. */
  pendiente?: boolean;
}

export interface Ajustes {
  presupuesto: number;
  incremento: number;
  segundos: number;
  /** Cartas extra por ronda sobre la cantidad de participantes (0–2). */
  extra: number;
  skips: number;
  trollsMin: number;
  trollsMax: number;
  /** La cantidad de trolls por ronda se ajusta sola a la cantidad de participantes (ver rangoTrolls). */
  trollsAuto: boolean;
  /** Los trolls salen con un precio creíble de futbolista, para que no se delaten por baratos. */
  trollsCamuflados: boolean;
  ultimaOportunidad: number;
  /** Si nadie oferta y no sobran cartas, alguien se la lleva (última oportunidad + ruleta). */
  forzar: boolean;
  /** Orden de rondas: índices de FORMACION. */
  orden: number[];
  /** Picante del ticker: 1 suave, 2 normal, 3 sin filtro. */
  intensidad: 1 | 2 | 3;
  /** Escenario (fondo + paleta) de la sala. */
  tema: string;
}

export const AJUSTES_DEFECTO: Ajustes = {
  presupuesto: 1000,
  incremento: 1,
  segundos: 15,
  extra: 1,
  skips: 2,
  trollsMin: 1,
  trollsMax: 2,
  trollsAuto: true,
  trollsCamuflados: true,
  ultimaOportunidad: 10,
  forzar: true,
  orden: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  intensidad: 2,
  tema: 'estadio',
};

/** Carta ya sorteada dentro de un mazo (solo servidor: contiene la identidad). */
export interface Carta {
  uid: string;
  tipo: 'jugador' | 'troll';
  refId: string;
  /** Hueco de la formación que cubre (índice en FORMACION). */
  hueco: number;
  pos: Pos;
  nombre: string;
  apellido: string;
  pais: string;
  rating: number;
  rareza: Rareza;
  etiqueta: string;
  dato: string;
  precioMinimo: number;
  foto: string;
  /** Token opaco con el que el cliente pide la imagen sin conocer la identidad. */
  token: string;
  /** Disfraz de un troll: foto de un futbolista real cuya silueta se muestra hasta la revelación. */
  fotoSilueta?: string;
  tokenSilueta?: string;
}

export interface RondaMazo {
  hueco: number;
  pos: Pos;
  cartas: Carta[];
}

export interface Mazo {
  semilla: number;
  rondas: RondaMazo[];
}

// ───────────────────────── Estado público (lo que ven los clientes) ─────────────────────────

export type Fase =
  | 'lobby'
  | 'intro' // barajando + cuenta regresiva
  | 'ronda' // cartel de ronda
  | 'presenta' // entra la silueta y aparece el precio
  | 'puja' // contador corriendo
  | 'ultima' // última oportunidad
  | 'ruleta'
  | 'martillo' // desenlace: vendido / pasa / salteada / obligado
  | 'revela' // silueta → jugador
  | 'finronda'
  | 'final';

export type Desenlace = 'vendido' | 'pasa' | 'salteada' | 'obligado' | 'ruleta';

/** Identidad de una carta, visible solo desde la revelación. */
export interface CartaVista {
  uid: string;
  tipo: 'jugador' | 'troll';
  nombre: string;
  apellido: string;
  pais: string;
  rating: number;
  rareza: Rareza;
  etiqueta: string;
  dato: string;
  precioMinimo: number;
  img: string;
  pos: Pos;
  hueco: number;
}

export interface FichaEquipo extends CartaVista {
  pagado: number;
}

export interface JugadorSala {
  id: string;
  nombre: string;
  avatar: string;
  color: string;
  conectado: boolean;
  saldo: number;
  skips: number;
  /** Lo que debe guardar para completar su equipo. */
  reserva: number;
  /** Tope de oferta en la carta actual (saldo − reserva). */
  tope: number;
  equipo: (FichaEquipo | null)[];
  gastado: number;
}

export type EstadoCartaRonda = 'espera' | 'actual' | 'vendida' | 'pasada' | 'salteada' | 'sobrante';

export interface CartaRondaVista {
  estado: EstadoCartaRonda;
  compradorId?: string;
  rareza?: Rareza;
  nombre?: string;
  img?: string;
  precio?: number;
}

export interface RondaVista {
  indice: number; // 0-based
  total: number;
  hueco: number;
  pos: Pos;
  cartas: CartaRondaVista[];
  /** Participantes que aún no compraron en esta ronda. */
  pendientes: string[];
  /** Cuántas cartas se pueden descartar todavía (restantes − pendientes). */
  sobran: number;
}

export interface OfertaVista {
  pid: string;
  precio: number;
  t: number;
}

export interface CartaActualVista {
  uid: string;
  img: string;
  pos: Pos;
  precioMinimo: number;
  precio: number;
  liderId: string | null;
  ofertas: OfertaVista[];
  /** Momento (reloj del servidor) en que vence la fase actual. */
  vence: number;
  /** Duración total de la fase actual, para dibujar el anillo. */
  duracion: number;
  desenlace?: Desenlace;
  compradorId?: string;
  pagado?: number;
  salteadaPor?: string;
  ruleta?: { candidatos: string[]; ganador: string; liquidacion: boolean };
  /** Presente desde la fase 'revela'. */
  revelada?: CartaVista;
}

export interface Historial {
  ronda: number;
  desenlace: Desenlace;
  carta: CartaVista;
  compradorId?: string;
  precio?: number;
  t: number;
}

export interface Premio {
  clave: string;
  titulo: string;
  detalle: string;
  pid: string;
}

export interface PuestoFinal {
  pid: string;
  puntos: number;
  desglose: { rating: number; rareza: number; completo: number; trolls: number; ahorro: number };
}

export interface MensajeTicker {
  id: number;
  texto: string;
  tipo: 'auto' | 'manual' | 'sistema';
  fijo?: boolean;
}

export interface EstadoPublico {
  codigo: string;
  fase: Fase;
  pausa: boolean;
  /** Si está en pausa, ms que le quedaban a la fase. */
  pausaResto?: number;
  ajustes: Ajustes;
  anfitrionId: string | null;
  jugadores: JugadorSala[];
  ronda: RondaVista | null;
  carta: CartaActualVista | null;
  /** Imagen de la carta siguiente, para precargar. */
  proximaImg?: string;
  historial: Historial[];
  ticker: MensajeTicker[];
  /** Vencimiento de fases sin carta (intro, ronda, finronda). */
  vence: number;
  duracion: number;
  semilla?: number;
  final?: { puestos: PuestoFinal[]; premios: Premio[] };
  /** Cartas que nadie llegó a ver en la ronda recién terminada. */
  sobrantes?: CartaVista[];
  trollsDisponibles: number;
  /** Panel que el anfitrión está mostrando a todos (TV y celulares). */
  panel: 'equipos' | null;
}

// ───────────────────────── Eventos efímeros (disparan animaciones) ─────────────────────────

export type MotivoRechazo = 'tarde' | 'sin_saldo' | 'ya_compraste' | 'ya_lideras' | 'pausa' | 'no_sobran' | 'sin_skips' | 'hay_ofertas';

export type Evento =
  | { e: 'oferta'; pid: string; precio: number }
  | { e: 'rechazo'; pid: string; motivo: MotivoRechazo }
  | { e: 'entra'; pid: string }
  | { e: 'sale'; pid: string }
  | { e: 'ticker'; msg: MensajeTicker }
  | { e: 'expulsado'; pid: string };

// ───────────────────────── Protocolo WebSocket ─────────────────────────

export type MsgCliente =
  | { t: 'hola'; clave: string; rol: 'jugador' | 'escenario' }
  | { t: 'entrar'; nombre: string; avatar: string }
  | { t: 'ajustes'; ajustes: Partial<Ajustes> }
  | { t: 'empezar' }
  | { t: 'ofertar'; uid: string }
  | { t: 'saltear'; uid: string }
  | { t: 'pausa'; on: boolean }
  | { t: 'panel'; on: boolean }
  | { t: 'expulsar'; pid: string }
  | { t: 'anfitrion'; pid: string }
  | { t: 'revancha' }
  | { t: 'ping'; t0: number };

export type MsgServidor =
  | { t: 'bienvenida'; tu: string | null; anfitrion: boolean; ahora: number }
  | { t: 'estado'; s: EstadoPublico; ev: Evento[]; ahora: number }
  | { t: 'pong'; t0: number; ahora: number }
  | { t: 'error'; codigo: string; texto: string };

export const MAX_PARTICIPANTES = 10;
export const COLORES_EQUIPO = ['#ff5a3c', '#2f8bff', '#ffd400', '#19d38a', '#ff66c4', '#ff9d1c', '#7de3ff', '#c8f03c', '#b79cff', '#f4efe2'];

/**
 * Trolls por ronda según la cantidad de participantes (aleatorio dentro del rango):
 * 3 → 1 · 4–5 → 1–2 · 6 → 1–3 · 7 → 2–3 · 8–9 → 2–4 · 10 → 3–5.
 */
export function rangoTrolls(participantes: number): { min: number; max: number } {
  const min = Math.max(1, Math.floor((participantes - 1) / 3));
  const max = Math.max(min, Math.floor(participantes / 2));
  return { min, max };
}
