// Mezcla los archivos del repo con lo que se editó desde el panel (trolls, precios, jugadores nuevos, plantillas).
import type { Jugador, Troll } from './types';
import type { Plantilla } from './ticker';

export interface CatalogoDatos {
  trolls: (Omit<Troll, 'foto'> & { v: number })[];
  overrides: Record<string, Partial<Jugador> & { fotoV?: number }>;
  extras: (Jugador & { fotoV: number })[];
  plantillas: { custom: Plantilla[]; apagadas: string[] };
}

export const fotoTroll = (id: string, v: number) => `/catalogo/troll/${id}.webp?v=${v}`;
export const fotoJugador = (id: string, v: number) => `/catalogo/jugador/${id}.webp?v=${v}`;

export function jugadoresFinal(base: readonly Jugador[], cat: CatalogoDatos | null): Jugador[] {
  if (!cat) return base.slice();
  const lista = base.map((j) => {
    const o = cat.overrides[j.id];
    if (!o) return j;
    const { fotoV, ...resto } = o;
    return { ...j, ...resto, fotos: fotoV ? [fotoJugador(j.id, fotoV)] : j.fotos };
  });
  for (const e of cat.extras) lista.push({ ...e, fotos: [fotoJugador(e.id, e.fotoV)] });
  return lista;
}

/** Si en el panel hay trolls cargados, se usan esos; si no, los dibujos de muestra del repo. */
export function trollsFinal(base: readonly Troll[], cat: CatalogoDatos | null): Troll[] {
  if (!cat || !cat.trolls.length) return base.slice();
  return cat.trolls.map((t) => ({ ...t, foto: fotoTroll(t.id, t.v) }));
}

export function plantillasFinal(base: readonly Plantilla[], cat: CatalogoDatos | null): Plantilla[] {
  if (!cat) return base.slice();
  const apagadas = new Set(cat.plantillas.apagadas);
  return [...base.filter((p) => !apagadas.has(p.id)), ...cat.plantillas.custom];
}
