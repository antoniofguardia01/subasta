// Escenarios: cada uno cambia el fondo (patrón de formas) y la paleta base. Los colores de rareza no cambian.
import { guardar, leer } from './util';

export interface Tema {
  id: string;
  nombre: string;
  bajada: string;
  /** Colores de muestra para el selector. */
  muestra: [string, string, string];
}

export const TEMAS: Tema[] = [
  { id: 'estadio', nombre: 'Noche de estadio', bajada: 'Césped, cal y reflectores', muestra: ['#0fbf57', '#c6f432', '#06100c'] },
  { id: 'copa', nombre: 'Noche de copa', bajada: 'Azul europeo y estrellas', muestra: ['#1b4fe0', '#6fe3ff', '#050a1c'] },
  { id: 'album', nombre: 'Álbum del 86', bajada: 'Papel, tinta y figuritas', muestra: ['#17a7a0', '#efe4cc', '#1d2433'] },
  { id: 'pizarra', nombre: 'Pizarra táctica', bajada: 'Tiza, flechas y vestuario', muestra: ['#2c4a40', '#f4e04d', '#121816'] },
  { id: 'miami', nombre: 'Atardecer en Miami', bajada: 'Rosa, durazno y palmeras', muestra: ['#ff4f9a', '#ffd0a6', '#04171a'] },
];

const valido = (id: string | null | undefined): id is string => !!id && TEMAS.some((t) => t.id === id);

let temaSala = 'estadio';
const oyentes = new Set<() => void>();

/** Tema elegido en este dispositivo (null = usar el de la sala). */
export function temaPropio(): string | null {
  const t = leer<string | null>('tema', null);
  return valido(t) ? t : null;
}

export function elegirTemaPropio(id: string | null) {
  guardar('tema', id);
  aplicarTema(id ?? temaSala);
}

/** Aplica el tema de la sala salvo que el dispositivo haya elegido uno propio. */
export function aplicarTemaDeSala(id: string) {
  if (valido(id)) temaSala = id;
  aplicarTema(temaPropio() ?? temaSala);
}

export function aplicarTema(id: string) {
  const tema = valido(id) ? id : 'estadio';
  const raiz = document.documentElement;
  if (raiz.dataset.tema === tema) return;
  raiz.dataset.tema = tema;
  const color = getComputedStyle(raiz).getPropertyValue('--bg').trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  oyentes.forEach((f) => f());
}

export function temaActual(): string {
  return document.documentElement.dataset.tema ?? 'estadio';
}

export function alCambiarTema(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}
