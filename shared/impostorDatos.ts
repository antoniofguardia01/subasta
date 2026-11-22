// Arma la lista de secretos posibles (futbolistas o clubes) para el Impostor según el modo y la dificultad.
import type { AjustesImp, Secreto } from './impostor';
import { filtrarDificultad } from './impostor';
import { POS_NOMBRE, type Jugador, type Troll } from './types';

export interface Club {
  id: string;
  nombre: string;
  sigla: string;
  pais: string;
  liga: string;
  colores: [string, string];
  /** 1 = lo conoce todo el mundo, 3 = para los que saben. */
  dificultad: 1 | 2 | 3;
  apodo: string;
}

/** Qué tan conocido es un futbolista, por su nivel. */
export function dificultadJugador(j: Pick<Jugador, 'rating' | 'rareza'>): 1 | 2 | 3 {
  if (j.rareza === 'leyenda' || j.rating >= 86) return 1;
  if (j.rating >= 82) return 2;
  return 3;
}

/** Posición agrupada: los señuelos de la adivinanza salen del mismo grupo. */
const GRUPO_POS: Record<string, string> = { POR: 'arco', LD: 'defensa', DFC: 'defensa', LI: 'defensa', MCD: 'medio', MC: 'medio', MCO: 'medio', ED: 'ataque', DC: 'ataque', EI: 'ataque' };

export function secretosJugadores(jugadores: Jugador[]): (Secreto & { dificultad: number })[] {
  return jugadores
    .filter((j) => j.fotos?.length)
    .map((j) => ({
      tipo: 'jugador' as const,
      id: j.id,
      nombre: `${j.nombre} ${j.apellido}`.trim(),
      detalle: `${POS_NOMBRE[j.pos] ?? j.pos} · ${j.pais}`,
      grupo: GRUPO_POS[j.pos] ?? 'otros',
      img: j.fotos[0],
      dificultad: dificultadJugador(j),
    }));
}

export function secretosClubes(clubes: Club[]): (Secreto & { dificultad: number })[] {
  return clubes.map((c) => ({
    tipo: 'club' as const,
    id: c.id,
    nombre: c.nombre,
    detalle: `${c.liga} · ${c.pais}`,
    grupo: c.pais,
    colores: c.colores,
    sigla: c.sigla,
    apodo: c.apodo,
    dificultad: c.dificultad,
  }));
}

/** Los trolls con nombre (los amigos) pueden ser secreto: la foto es la cara, la descripción es el "detalle". */
export function secretosTrolls(trolls: Troll[]): (Secreto & { dificultad: number })[] {
  return trolls
    .filter((t) => t.activo && !t.pendiente && t.nombre.trim())
    .map((t) => ({
      tipo: 'troll' as const,
      id: t.id,
      nombre: t.nombre.trim(),
      detalle: t.descripcion.trim() || 'Una cara conocida',
      grupo: 'troll',
      img: t.foto,
      // Los amigos los conoce todo el grupo: entran con cualquier dificultad.
      dificultad: 1,
    }));
}

export function candidatosImp(a: Pick<AjustesImp, 'modo' | 'dificultad'> & { trolls?: AjustesImp['trolls'] }, jugadores: Jugador[], clubes: Club[], trolls: Troll[] = []): Secreto[] {
  const sinDif = ({ dificultad: _d, ...s }: Secreto & { dificultad: number }): Secreto => s;
  if (a.modo === 'clubes') return filtrarDificultad(secretosClubes(clubes), a.dificultad).map(sinDif);
  const modoTrolls = a.trolls ?? 'aveces';
  const amigos = secretosTrolls(trolls).map(sinDif);
  const futbolistas = filtrarDificultad(secretosJugadores(jugadores), a.dificultad).map(sinDif);
  // "Solo trolls" necesita al menos 2 cartas distintas; si no alcanzan, se completa con futbolistas.
  if (modoTrolls === 'solo' && amigos.length >= 2) return amigos;
  if (modoTrolls === 'no') return futbolistas;
  return [...futbolistas, ...amigos];
}
