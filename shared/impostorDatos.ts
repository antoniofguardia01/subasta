// Arma la lista de secretos posibles para el Impostor: todos los futbolistas con foto, todos los clubes, o solo trolls.
import type { AjustesImp, Secreto } from './impostor';
import { POS_NOMBRE, type Jugador, type Troll } from './types';

export interface Club {
  id: string;
  nombre: string;
  sigla: string;
  pais: string;
  liga: string;
  colores: [string, string];
  /** 1 = lo conoce todo el mundo, 3 = para los que saben (ya no se usa para filtrar: siempre entran todos). */
  dificultad: 1 | 2 | 3;
  apodo: string;
}

/** Posición agrupada (sirve para agrupar secretos parecidos). */
const GRUPO_POS: Record<string, string> = { POR: 'arco', LD: 'defensa', DFC: 'defensa', LI: 'defensa', MCD: 'medio', MC: 'medio', MCO: 'medio', ED: 'ataque', DC: 'ataque', EI: 'ataque' };

export function secretosJugadores(jugadores: Jugador[]): Secreto[] {
  return jugadores
    .filter((j) => j.fotos?.length)
    .map((j) => ({
      tipo: 'jugador' as const,
      id: j.id,
      nombre: `${j.nombre} ${j.apellido}`.trim(),
      detalle: `${POS_NOMBRE[j.pos] ?? j.pos} · ${j.pais}`,
      grupo: GRUPO_POS[j.pos] ?? 'otros',
      img: j.fotos[0],
    }));
}

export function secretosClubes(clubes: Club[]): Secreto[] {
  return clubes.map((c) => ({
    tipo: 'club' as const,
    id: c.id,
    nombre: c.nombre,
    detalle: `${c.liga} · ${c.pais}`,
    grupo: c.pais,
    colores: c.colores,
    sigla: c.sigla,
    apodo: c.apodo,
  }));
}

/** Los trolls con nombre (los amigos) pueden ser secreto: la foto es la cara, la descripción es el "detalle". */
export function secretosTrolls(trolls: Troll[]): Secreto[] {
  return trolls
    .filter((t) => t.activo && !t.pendiente && t.nombre.trim())
    .map((t) => ({
      tipo: 'troll' as const,
      id: t.id,
      nombre: t.nombre.trim(),
      detalle: t.descripcion.trim() || 'Una cara conocida',
      grupo: 'troll',
      img: t.foto,
    }));
}

/**
 * Sin dificultad: siempre entran todos. En la versión futbolistas hay dos opciones:
 * sin trolls (todos los futbolistas) o solo trolls (los amigos). En clubes no hay trolls.
 */
export function candidatosImp(a: Pick<AjustesImp, 'modo'> & { trolls?: string }, jugadores: Jugador[], clubes: Club[], trolls: Troll[] = []): Secreto[] {
  if (a.modo === 'clubes') return secretosClubes(clubes);
  const futbolistas = secretosJugadores(jugadores);
  if (a.trolls !== 'solo') return futbolistas;
  // "Solo trolls" necesita al menos 2 cartas distintas; si no alcanzan, se juega con futbolistas.
  const amigos = secretosTrolls(trolls);
  return amigos.length >= 2 ? amigos : futbolistas;
}
