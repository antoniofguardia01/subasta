// Tabla final (por trolls y gasto) y premios cómicos.
import { Ajustes, EstadoPublico, FichaEquipo, Historial, Premio, PuestoFinal } from './types';

interface ParaPuntaje {
  id: string;
  nombre: string;
  saldo: number;
  gastado: number;
  tragos?: number;
  equipo: (FichaEquipo | null)[];
}

export function calcularFinal(jugadores: readonly ParaPuntaje[], historial: readonly Historial[], ajustes: Ajustes): NonNullable<EstadoPublico['final']> {
  // Tabla: menos trolls arriba; si empatan, el que gastó menos. Sin puntajes ni medias.
  const puestos: PuestoFinal[] = jugadores.map((j) => {
    const fichas = j.equipo.filter((f): f is FichaEquipo => !!f);
    return { pid: j.id, trolls: fichas.filter((f) => f.tipo === 'troll').length, gastado: j.gastado, fichas: fichas.length, tragos: j.tragos ?? 0 };
  });
  puestos.sort((a, b) => a.trolls - b.trolls || a.gastado - b.gastado);

  const premios: Premio[] = [];
  const nombre = (pid: string) => jugadores.find((j) => j.id === pid)?.nombre ?? '?';
  const compras = historial.filter((h) => h.compradorId && h.precio !== undefined);

  // Modo tragos: el premio principal es para quien más tomó.
  if (ajustes.tragos) {
    const total = jugadores.reduce((s, j) => s + (j.tragos ?? 0), 0);
    const sediento = [...jugadores].sort((a, b) => (b.tragos ?? 0) - (a.tragos ?? 0))[0];
    if (sediento && (sediento.tragos ?? 0) > 0)
      premios.push({
        clave: 'sediento',
        titulo: 'El más sediento',
        detalle: `${sediento.nombre} tomó ${sediento.tragos} ${sediento.tragos === 1 ? 'trago' : 'tragos'} (en total la mesa se tomó ${total}). Que alguien le pase agua.`,
        pid: sediento.id,
      });
    else premios.push({ clave: 'sediento', titulo: 'Mesa sobria', detalle: 'Nadie tomó un solo trago. Increíble, o muy aburridos.', pid: jugadores[0]?.id ?? '' });
  }

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
      titulo: 'Último de la tabla',
      detalle: `${nombre(ultimo.pid)} terminó abajo de todo: ${ultimo.trolls} ${ultimo.trolls === 1 ? 'troll' : 'trolls'} en el equipo. Eso no es un plantel, es un asado.`,
      pid: ultimo.pid,
    });
  }

  return { puestos, premios };
}
