// Puntaje final y premios cómicos. Los pesos son configuración: se ajustan acá.
import { Ajustes, EstadoPublico, FichaEquipo, Historial, Premio, PuestoFinal, Rareza } from './types';

export const PUNTAJE = {
  rareza: { comun: 0, plata: 2, oro: 5, prime: 9, leyenda: 14, troll: 0 } as Record<Rareza, number>,
  /** Bonus por tener los 11. */
  equipoCompleto: 25,
  /** Malus por cada troll en el equipo. */
  porTroll: -8,
  /** Un punto por cada tantos millones sin gastar (premia poco: la plata es para gastarla). */
  millonesPorPunto: 40,
};

interface ParaPuntaje {
  id: string;
  nombre: string;
  saldo: number;
  gastado: number;
  equipo: (FichaEquipo | null)[];
}

export function calcularFinal(jugadores: readonly ParaPuntaje[], historial: readonly Historial[], _ajustes: Ajustes): NonNullable<EstadoPublico['final']> {
  const puestos: PuestoFinal[] = jugadores.map((j) => {
    const fichas = j.equipo.filter((f): f is FichaEquipo => !!f);
    const rating = fichas.reduce((s, f) => s + f.rating, 0);
    const rareza = fichas.reduce((s, f) => s + PUNTAJE.rareza[f.rareza], 0);
    const completo = fichas.length === j.equipo.length ? PUNTAJE.equipoCompleto : 0;
    const trolls = fichas.filter((f) => f.tipo === 'troll').length * PUNTAJE.porTroll;
    const ahorro = Math.floor(j.saldo / PUNTAJE.millonesPorPunto);
    return { pid: j.id, puntos: rating + rareza + completo + trolls + ahorro, desglose: { rating, rareza, completo, trolls, ahorro } };
  });
  puestos.sort((a, b) => b.puntos - a.puntos);

  const premios: Premio[] = [];
  const nombre = (pid: string) => jugadores.find((j) => j.id === pid)?.nombre ?? '?';
  const compras = historial.filter((h) => h.compradorId && h.precio !== undefined);

  const masCara = [...compras].sort((a, b) => b.precio! - a.precio!)[0];
  if (masCara)
    premios.push({
      clave: 'billetera',
      titulo: 'Billetera fácil',
      detalle: `${nombre(masCara.compradorId!)} pagó $${masCara.precio}M por ${masCara.carta.apellido || masCara.carta.nombre}. Nadie lo obligó.`,
      pid: masCara.compradorId!,
    });

  const robo = compras
    .filter((h) => h.carta.tipo === 'jugador')
    .map((h) => ({ h, valor: h.carta.rating - h.precio! / 4 }))
    .sort((a, b) => b.valor - a.valor)[0]?.h;
  if (robo)
    premios.push({
      clave: 'robo',
      titulo: 'El robo del año',
      detalle: `${nombre(robo.compradorId!)} se llevó a ${robo.carta.apellido || robo.carta.nombre} por $${robo.precio}M. Llamen a la policía.`,
      pid: robo.compradorId!,
    });

  const sobreprecio = compras
    .map((h) => ({ h, extra: h.precio! - h.carta.precioMinimo }))
    .sort((a, b) => b.extra - a.extra)[0];
  if (sobreprecio && sobreprecio.extra >= 10 && sobreprecio.h !== masCara)
    premios.push({
      clave: 'calentura',
      titulo: 'Calentura del año',
      detalle: `${nombre(sobreprecio.h.compradorId!)} pagó $${sobreprecio.extra}M de más por ${sobreprecio.h.carta.apellido || sobreprecio.h.carta.nombre}. El orgullo sale caro.`,
      pid: sobreprecio.h.compradorId!,
    });

  const trollsPor = new Map<string, number>();
  for (const h of compras) if (h.carta.tipo === 'troll') trollsPor.set(h.compradorId!, (trollsPor.get(h.compradorId!) ?? 0) + 1);
  const reyTroll = [...trollsPor.entries()].sort((a, b) => b[1] - a[1])[0];
  if (reyTroll)
    premios.push({
      clave: 'trolls',
      titulo: 'Coleccionista de trolls',
      detalle: `${nombre(reyTroll[0])} juntó ${reyTroll[1]} ${reyTroll[1] === 1 ? 'troll' : 'trolls'}. Eso no es un equipo, es un asado.`,
      pid: reyTroll[0],
    });

  const forzadoPor = new Map<string, number>();
  for (const h of compras) if (h.desenlace === 'obligado' || h.desenlace === 'ruleta') forzadoPor.set(h.compradorId!, (forzadoPor.get(h.compradorId!) ?? 0) + 1);
  const obligado = [...forzadoPor.entries()].sort((a, b) => b[1] - a[1])[0];
  if (obligado)
    premios.push({
      clave: 'obligado',
      titulo: 'El que agarra lo que queda',
      detalle: `${nombre(obligado[0])} se llevó ${obligado[1]} ${obligado[1] === 1 ? 'jugador' : 'jugadores'} a la fuerza. Así también es la vida.`,
      pid: obligado[0],
    });

  const tacano = [...jugadores].sort((a, b) => b.saldo - a.saldo)[0];
  if (tacano && tacano.saldo >= 100)
    premios.push({
      clave: 'tacano',
      titulo: 'Codo de oro',
      detalle: `A ${tacano.nombre} le sobraron $${tacano.saldo}M. La plata no se lleva a la tumba.`,
      pid: tacano.id,
    });

  if (puestos.length > 1) {
    const ultimo = puestos[puestos.length - 1];
    premios.push({
      clave: 'peor',
      titulo: 'Peor equipo del año',
      detalle: `${nombre(ultimo.pid)} armó un equipo que desciende antes de arrancar.`,
      pid: ultimo.pid,
    });
  }

  return { puestos, premios };
}
