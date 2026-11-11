// Generador pseudoaleatorio con semilla (mulberry32): el mismo mazo se puede regenerar para reconectar y testear.

export type Rng = () => number;

export function crearRng(semilla: number): Rng {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function entero(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function elegir<T>(rng: Rng, lista: readonly T[]): T {
  return lista[Math.floor(rng() * lista.length)];
}

export function barajar<T>(rng: Rng, lista: readonly T[]): T[] {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function tokenAleatorio(rng: Rng, largo = 12): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < largo; i++) s += abc[Math.floor(rng() * abc.length)];
  return s;
}
