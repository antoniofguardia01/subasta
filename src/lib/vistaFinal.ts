// Qué equipo se muestra en los resultados: el que eligió el anfitrión o, si no eligió, rota cada 15 s.
import { useEffect, useState } from 'react';
import type { EstadoPublico } from '../../shared/types';
import type { Sala } from './sala';

export const ROTACION_MS = 15000;

export function useEquipoEnPantalla(sala: Sala, s: EstadoPublico): { pid: string | null; auto: boolean; resto: number } {
  const orden = s.final?.puestos.map((p) => p.pid) ?? [];
  const calcular = () => {
    if (s.finalVista) return { pid: s.finalVista, auto: false, resto: 0 };
    if (!orden.length) return { pid: null, auto: true, resto: 0 };
    const pasado = Math.max(0, sala.ahora() - s.finalDesde);
    return { pid: orden[Math.floor(pasado / ROTACION_MS) % orden.length], auto: true, resto: ROTACION_MS - (pasado % ROTACION_MS) };
  };
  const [v, setV] = useState(calcular);
  useEffect(() => {
    setV(calcular());
    const id = setInterval(() => setV(calcular()), 500);
    return () => clearInterval(id);
  }, [s.finalVista, s.finalDesde, orden.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
