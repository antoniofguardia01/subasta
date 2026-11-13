// Sorteo del mazo: se genera completo al pulsar "Empezar", conociendo la cantidad de participantes.
import { Ajustes, Carta, FORMACION, Jugador, Mazo, Pos, RondaMazo, Troll } from './types';
import { Rng, barajar, crearRng, elegir, entero, tokenAleatorio } from './rng';

/** Ningún jugador sale a menos de esto (el dueño quiere que el presupuesto se use). */
export const PRECIO_MIN = 30;
/** Una carta cuenta como "barata" (salvavidas) si su precio mínimo no supera este valor. */
export const UMBRAL_BARATO = 40;
/** Cada ronda lleva al menos esta cantidad de cartas baratas. */
export const BARATAS_POR_RONDA = 2;
/** Las cartas salvavidas se eligen entre jugadores de precio base hasta aquí (y se bajan a 30–40M): un grupo más ancho evita que siempre salgan los mismos baratos. */
export const BASE_BARATA = 55;

/** Qué salió en las últimas partidas (de cualquier sala): 2 = la última, 1 = la anterior. El sorteo prefiere lo que no salió hace poco. */
export interface Recientes {
  jugadores: Record<string, number>;
  trolls: Record<string, number>;
}

/** Rótulos de la placa cuando sale un troll: lo presentan como un fichaje más, sin delatarlo con la palabra. */
export const ETIQUETAS_SORPRESA = ['FICHAJE BOMBA', 'REFUERZO DE LUJO', 'JOYA DEL BARRIO', 'CRACK DE POTRERO', 'ÍDOLO LOCAL', 'PROMESA ETERNA', 'LEYENDA DEL ASADO', 'TAPADO DEL MERCADO'];

/**
 * Banda de precio de un jugador. `precioMinimo` es el precio BASE; en cada partida cada carta sale con un precio
 * sorteado dentro de esta banda, para que no se pueda memorizar (los de ~100M salen entre 80 y 120, por ejemplo).
 * Más ancho en términos relativos cuanto más barato. Se puede fijar a mano con `precioRango: [min, max]`.
 */
export function rangoPrecio(j: Pick<Jugador, 'precioMinimo' | 'precioRango'>): [number, number] {
  const r = j.precioRango;
  if (r && r.length === 2 && r[1] >= r[0]) return [Math.max(PRECIO_MIN, Math.round(r[0])), Math.max(PRECIO_MIN, Math.round(r[1]))];
  const base = j.precioMinimo;
  // Los que valen menos que el piso salen todos a $30M exactos; el resto, en una banda alrededor de su precio base (nunca bajo el piso).
  if (base < PRECIO_MIN) return [PRECIO_MIN, PRECIO_MIN];
  const k = base >= 60 ? 0.2 : 0.3;
  return [Math.max(PRECIO_MIN, Math.round(base * (1 - k))), Math.round(base * (1 + k))];
}

/** Señuelos: de vez en cuando un jugador flojo sale con precio de "bueno" (50–60) para que el precio no delate la calidad. */
export const SENUELO_HASTA = 40; // solo jugadores con precio base hasta aquí
export const SENUELO_PROB = 0.22;
export const SENUELO_MIN = 50;
export const SENUELO_MAX = 60;

export function sortearPrecio(rng: Rng, j: Pick<Jugador, 'precioMinimo' | 'precioRango'>, senuelo = true): number {
  if (senuelo && !j.precioRango && j.precioMinimo <= SENUELO_HASTA && rng() < SENUELO_PROB) return entero(rng, SENUELO_MIN, SENUELO_MAX);
  const [lo, hi] = rangoPrecio(j);
  return entero(rng, lo, hi);
}

export function cartasPorRonda(participantes: number, ajustes: Ajustes): number {
  return participantes + ajustes.extra;
}

export function generarMazo(
  pool: readonly Jugador[],
  trolls: readonly Troll[],
  participantes: number,
  ajustes: Ajustes,
  semilla: number,
  recientes?: Recientes,
): Mazo {
  const rng = crearRng(semilla);
  const nivelJ = (j: Jugador) => recientes?.jugadores[j.id] ?? 0;
  const nivelT = (t: Troll) => recientes?.trolls[t.id] ?? 0;
  const total = cartasPorRonda(participantes, ajustes);
  const usados = new Set<string>();
  const porPos = new Map<Pos, Jugador[]>();
  for (const j of pool) {
    if (!j.fotos?.length) continue; // sin foto no hay silueta: no entra al mazo
    if (!porPos.has(j.pos)) porPos.set(j.pos, []);
    porPos.get(j.pos)!.push(j);
  }

  // El precio de cada jugador se sortea una vez por partida (determinista con la semilla).
  const precioDe = new Map<string, number>();
  for (const lista of porPos.values()) for (const j of lista) precioDe.set(j.id, sortearPrecio(rng, j));
  const precio = (j: Jugador) => precioDe.get(j.id) ?? Math.max(1, Math.round(j.precioMinimo));

  const trollsActivos = trolls.filter((t) => t.activo && t.foto);
  // Barajado al azar y luego ordenado (de forma estable) por lo reciente que salió: primero los que no salieron hace poco.
  const barajarTrolls = () => barajar(rng, trollsActivos).sort((a, b) => nivelT(a) - nivelT(b));
  let bolsaTrolls = barajarTrolls();
  let ultimoTroll = '';
  const sacarTroll = (yaEnRonda: Set<string>): Troll | null => {
    if (!trollsActivos.length) return null;
    for (let intento = 0; intento < 3; intento++) {
      if (!bolsaTrolls.length) bolsaTrolls = barajarTrolls(); // se acabaron: se repiten
      const i = bolsaTrolls.findIndex((t) => t.id !== ultimoTroll && !yaEnRonda.has(t.id));
      if (i >= 0) {
        const [t] = bolsaTrolls.splice(i, 1);
        ultimoTroll = t.id;
        return t;
      }
      bolsaTrolls = [];
    }
    return null;
  };

  /**
   * Precio de salida de un troll. Camuflado: copia el precio mínimo de un futbolista real de esa posición
   * (con una pequeña variación), así la silueta + el precio no delatan que es un troll.
   */
  const precioTroll = (t: Troll, pos: Pos): number => {
    const reales = porPos.get(pos) ?? [];
    if (!ajustes.trollsCamuflados || !reales.length) return Math.max(1, Math.round(t.precioMinimo));
    const base = precio(elegir(rng, reales));
    return Math.max(5, Math.round(base + entero(rng, -3, 3)));
  };

  let serie = 0;
  const cartaDeJugador = (j: Jugador, hueco: number): Carta => ({
    uid: `c${++serie}`,
    tipo: 'jugador',
    refId: j.id,
    hueco,
    pos: FORMACION[hueco],
    nombre: j.nombre,
    apellido: j.apellido,
    pais: j.pais,
    rating: j.rating,
    rareza: j.rareza,
    etiqueta: j.etiqueta,
    dato: j.dato,
    precioMinimo: precio(j),
    foto: elegir(rng, j.fotos),
    token: tokenAleatorio(rng),
  });
  const cartaDeTroll = (t: Troll, hueco: number, disfraz: Jugador | null): Carta => ({
    uid: `c${++serie}`,
    tipo: 'troll',
    refId: t.id,
    hueco,
    pos: FORMACION[hueco],
    nombre: t.nombre || 'Sin nombre',
    apellido: '',
    pais: '',
    rating: t.rating,
    rareza: 'troll',
    etiqueta: elegir(rng, ETIQUETAS_SORPRESA),
    dato: t.descripcion || 'Nadie sabe de dónde salió',
    // Sale con la silueta y el precio de un futbolista real; al revelarse aparece el troll.
    precioMinimo: disfraz && ajustes.trollsCamuflados ? precio(disfraz) : precioTroll(t, FORMACION[hueco]),
    foto: t.foto,
    token: tokenAleatorio(rng),
    marco: !!t.opaca,
    ajuste: t.carta,
    fotoSilueta: disfraz ? elegir(rng, disfraz.fotos) : undefined,
    tokenSilueta: disfraz ? tokenAleatorio(rng) : undefined,
  });

  const rondas: RondaMazo[] = [];
  for (const hueco of ajustes.orden) {
    const pos = FORMACION[hueco];
    const libres = barajar(rng, (porPos.get(pos) ?? []).filter((j) => !usados.has(j.id))).sort((a, b) => nivelJ(a) - nivelJ(b));

    // Trolls de la ronda: cantidad al azar dentro del rango, dejando siempre lugar para al menos un futbolista.
    let nTrolls = Math.min(entero(rng, ajustes.trollsMin, ajustes.trollsMax), Math.max(0, total - 1));
    if (!trollsActivos.length) nTrolls = 0;
    let nFut = total - nTrolls;
    if (libres.length < nFut) {
      // No alcanzan los futbolistas de esa posición: se completa con trolls.
      nFut = libres.length;
      nTrolls = total - nFut;
    }

    const cartas: Carta[] = [];
    const trollsRonda = new Set<string>();
    for (let i = 0; i < nTrolls; i++) {
      const t = sacarTroll(trollsRonda);
      if (!t) break;
      trollsRonda.add(t.id);
      // Disfraz: un futbolista de esa posición que no salga en la partida (si sobran); si no, cualquiera.
      let disfraz: Jugador | null = null;
      if (libres.length > nFut) {
        // El disfraz también se saca de los que no salieron hace poco, si alcanza.
        const sinReciente = libres.filter((j) => nivelJ(j) === 0).length;
        disfraz = libres.splice(entero(rng, 0, Math.max(0, Math.min(libres.length - 1, Math.max(sinReciente, 1) - 1))), 1)[0];
        usados.add(disfraz.id);
      } else {
        const todos = porPos.get(pos) ?? [];
        disfraz = todos.length ? elegir(rng, todos) : null;
      }
      cartas.push(cartaDeTroll(t, hueco, disfraz));
    }

    // Garantía de jugabilidad: asegurar cartas baratas (los trolls baratos cuentan).
    const baratasYa = cartas.filter((c) => c.precioMinimo <= UMBRAL_BARATO).length;
    const elegidos: Jugador[] = [];
    const faltanBaratas = Math.max(0, Math.min(BARATAS_POR_RONDA, total) - baratasYa);
    // Primero los que están bajo el umbral (al azar); si no alcanzan, los más baratos que queden.
    // La garantía se decide por el precio BASE (no por el sorteado): los señuelos y la banda no pueden dejar una ronda sin baratas.
    const baratos = libres.filter((j) => j.precioMinimo <= BASE_BARATA);
    const resto = libres.filter((j) => j.precioMinimo > BASE_BARATA).sort((a, b) => a.precioMinimo - b.precioMinimo);
    for (const j of [...baratos, ...resto].slice(0, Math.min(faltanBaratas, nFut))) {
      elegidos.push(j);
      // Las cartas salvavidas nunca llevan señuelo ni se pasan del umbral.
      if (j.precioMinimo <= BASE_BARATA && precio(j) > UMBRAL_BARATO) precioDe.set(j.id, entero(rng, PRECIO_MIN, UMBRAL_BARATO));
    }
    for (const j of libres) {
      if (elegidos.length >= nFut) break;
      if (!elegidos.includes(j)) elegidos.push(j);
    }
    for (const j of elegidos) {
      usados.add(j.id);
      cartas.push(cartaDeJugador(j, hueco));
    }

    rondas.push({ hueco, pos, cartas: barajar(rng, cartas) });
  }

  // Muestra para el cartel de ronda: 3 futbolistas de esa posición que NO salen en la partida (no se spoilea nada).
  for (const r of rondas) {
    const delPuesto = porPos.get(r.pos) ?? [];
    const enRonda = new Set(r.cartas.map((c) => c.refId));
    const fuera = barajar(rng, delPuesto.filter((j) => !usados.has(j.id)));
    const relleno = barajar(rng, delPuesto.filter((j) => usados.has(j.id) && !enRonda.has(j.id)));
    r.muestra = [...fuera, ...relleno].slice(0, 3).map((j) => elegir(rng, j.fotos));
  }

  return { semilla, rondas };
}

/** Precio mínimo más barato de cada ronda: base de la reserva de presupuesto. */
export function pisosDeRonda(mazo: Mazo): number[] {
  return mazo.rondas.map((r) => (r.cartas.length ? Math.min(...r.cartas.map((c) => c.precioMinimo)) : 0));
}

/**
 * Carta de repuesto para alargar una ronda (regla "forzar" desactivada o quedó gente sin carta).
 * Devuelve un futbolista no usado de esa posición o, si no quedan, un troll.
 */
export function crearReponedor(pool: readonly Jugador[], trolls: readonly Troll[], mazo: Mazo, semilla: number) {
  const rng = crearRng((semilla ^ 0x51ed270b) >>> 0);
  const usados = new Set<string>();
  for (const r of mazo.rondas) for (const c of r.cartas) usados.add(c.refId);
  let serie = 0;
  const camuflar = mazo.rondas.some((r) => r.cartas.some((c) => c.tipo === 'troll' && c.precioMinimo > 20));
  const precioRepuesto = (t: Troll, pos: Pos): number => {
    const reales = pool.filter((j) => j.pos === pos);
    if (!camuflar || !reales.length) return Math.max(1, Math.round(t.precioMinimo));
    return Math.max(PRECIO_MIN, elegir(rng, reales).precioMinimo);
  };
  return (hueco: number): Carta | null => {
    const pos = FORMACION[hueco];
    const libres = pool.filter((j) => j.pos === pos && j.fotos?.length && !usados.has(j.id));
    const base = { uid: `x${++serie}`, hueco, pos, token: tokenAleatorio(rng) };
    if (libres.length) {
      const j = libres.slice().sort((a, b) => a.precioMinimo - b.precioMinimo)[0];
      usados.add(j.id);
      return {
        ...base,
        tipo: 'jugador',
        refId: j.id,
        nombre: j.nombre,
        apellido: j.apellido,
        pais: j.pais,
        rating: j.rating,
        rareza: j.rareza,
        etiqueta: j.etiqueta,
        dato: j.dato,
        precioMinimo: sortearPrecio(rng, j, false),
        foto: elegir(rng, j.fotos),
      };
    }
    const activos = trolls.filter((t) => t.activo && t.foto);
    if (!activos.length) return null;
    const t = elegir(rng, activos);
    return {
      ...base,
      tipo: 'troll',
      refId: t.id,
      nombre: t.nombre || 'Sin nombre',
      apellido: '',
      pais: '',
      rating: t.rating,
      rareza: 'troll',
      etiqueta: elegir(rng, ETIQUETAS_SORPRESA),
      dato: t.descripcion || 'Nadie sabe de dónde salió',
      precioMinimo: precioRepuesto(t, pos),
      foto: t.foto,
    };
  };
}
