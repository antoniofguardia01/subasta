// Sorteo del mazo: se genera completo al pulsar "Empezar", conociendo la cantidad de participantes.
import { Ajustes, Carta, FORMACION, Jugador, Mazo, Pos, RondaMazo, Troll } from './types';
import { Rng, barajar, crearRng, elegir, entero, tokenAleatorio } from './rng';

/** Un jugador cuenta como "barato" (carta salvavidas) si su precio mínimo no supera este valor. */
export const UMBRAL_BARATO = 30;
/** Cada ronda lleva al menos esta cantidad de cartas baratas. */
export const BARATAS_POR_RONDA = 2;

/** Rótulos de la placa cuando sale un troll: lo presentan como un fichaje más, sin delatarlo con la palabra. */
export const ETIQUETAS_SORPRESA = ['FICHAJE BOMBA', 'REFUERZO DE LUJO', 'JOYA DEL BARRIO', 'CRACK DE POTRERO', 'ÍDOLO LOCAL', 'PROMESA ETERNA', 'LEYENDA DEL ASADO', 'TAPADO DEL MERCADO'];

export function cartasPorRonda(participantes: number, ajustes: Ajustes): number {
  return participantes + ajustes.extra;
}

export function generarMazo(
  pool: readonly Jugador[],
  trolls: readonly Troll[],
  participantes: number,
  ajustes: Ajustes,
  semilla: number,
): Mazo {
  const rng = crearRng(semilla);
  const total = cartasPorRonda(participantes, ajustes);
  const usados = new Set<string>();
  const porPos = new Map<Pos, Jugador[]>();
  for (const j of pool) {
    if (!j.fotos?.length) continue; // sin foto no hay silueta: no entra al mazo
    if (!porPos.has(j.pos)) porPos.set(j.pos, []);
    porPos.get(j.pos)!.push(j);
  }

  const trollsActivos = trolls.filter((t) => t.activo && t.foto);
  let bolsaTrolls = barajar(rng, trollsActivos);
  let ultimoTroll = '';
  const sacarTroll = (yaEnRonda: Set<string>): Troll | null => {
    if (!trollsActivos.length) return null;
    for (let intento = 0; intento < 3; intento++) {
      if (!bolsaTrolls.length) bolsaTrolls = barajar(rng, trollsActivos); // se acabaron: se repiten
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
    const base = elegir(rng, reales).precioMinimo;
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
    precioMinimo: Math.max(1, Math.round(j.precioMinimo)),
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
    precioMinimo: disfraz && ajustes.trollsCamuflados ? Math.max(1, Math.round(disfraz.precioMinimo)) : precioTroll(t, FORMACION[hueco]),
    foto: t.foto,
    token: tokenAleatorio(rng),
    marco: !!t.opaca,
    fotoSilueta: disfraz ? elegir(rng, disfraz.fotos) : undefined,
    tokenSilueta: disfraz ? tokenAleatorio(rng) : undefined,
  });

  const rondas: RondaMazo[] = [];
  for (const hueco of ajustes.orden) {
    const pos = FORMACION[hueco];
    const libres = barajar(rng, (porPos.get(pos) ?? []).filter((j) => !usados.has(j.id)));

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
        disfraz = libres.splice(entero(rng, 0, libres.length - 1), 1)[0];
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
    const baratos = libres.filter((j) => j.precioMinimo <= UMBRAL_BARATO);
    const resto = libres.filter((j) => j.precioMinimo > UMBRAL_BARATO).sort((a, b) => a.precioMinimo - b.precioMinimo);
    for (const j of [...baratos, ...resto].slice(0, Math.min(faltanBaratas, nFut))) elegidos.push(j);
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
    return Math.max(5, elegir(rng, reales).precioMinimo);
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
        precioMinimo: Math.max(1, Math.round(j.precioMinimo)),
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
