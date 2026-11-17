// Qué juego corre en una sala (subasta o impostor). Se pregunta una vez y se recuerda en la pestaña.
import { useEffect, useState } from 'react';

export type Juego = 'subasta' | 'impostor';

const memoria = new Map<string, Juego>();

function recordado(codigo: string): Juego | null {
  if (memoria.has(codigo)) return memoria.get(codigo)!;
  try {
    const v = sessionStorage.getItem('juego.' + codigo);
    return v === 'impostor' || v === 'subasta' ? v : null;
  } catch {
    return null;
  }
}

export function recordarJuego(codigo: string, juego: Juego) {
  memoria.set(codigo, juego);
  try {
    sessionStorage.setItem('juego.' + codigo, juego);
  } catch {
    /* sin almacenamiento */
  }
}

/** null mientras se pregunta; si la sala no existe se trata como subasta (esa pantalla ya muestra "no existe"). */
export function useJuego(codigo: string): Juego | null {
  const [juego, setJuego] = useState<Juego | null>(() => recordado(codigo));
  useEffect(() => {
    if (juego) return;
    let vivo = true;
    fetch(`/api/salas/${codigo}`)
      .then((r) => r.json())
      .then((d: { existe?: boolean; juego?: string }) => {
        const j: Juego = d.juego === 'impostor' ? 'impostor' : 'subasta';
        if (d.existe) recordarJuego(codigo, j);
        if (vivo) setJuego(j);
      })
      .catch(() => vivo && setJuego('subasta'));
    return () => {
      vivo = false;
    };
  }, [codigo, juego]);
  return juego;
}
