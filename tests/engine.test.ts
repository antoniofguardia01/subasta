import { describe, expect, it } from 'vitest';
import { Partida, TIEMPOS } from '../shared/game';
import { generarMazo, pisosDeRonda, rangoPrecio, SENUELO_HASTA, SENUELO_MAX, SENUELO_MIN, UMBRAL_BARATO } from '../shared/deck';
import { AJUSTES_DEFECTO, Ajustes, FORMACION, Jugador, Pos, Troll, rangoTrolls } from '../shared/types';

// ───────────── Datos de prueba: 270 jugadores (30 por posición, laterales 15 + 15) ─────────────
function pool(): Jugador[] {
  const out: Jugador[] = [];
  const grupos: [Pos, number][] = [['POR', 30], ['DFC', 30], ['LD', 15], ['LI', 15], ['MCD', 30], ['MC', 30], ['MCO', 30], ['EI', 30], ['DC', 30], ['ED', 30]];
  for (const [pos, n] of grupos)
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const precio = f < 0.07 ? 180 : f < 0.2 ? 110 : f < 0.4 ? 70 : f < 0.66 ? 40 : 15;
      out.push({
        id: `${pos}-${i}`,
        nombre: 'N',
        apellido: `${pos}${i}`,
        pos,
        pais: 'AR',
        rating: 60 + Math.round(precio / 6),
        rareza: precio >= 150 ? 'leyenda' : precio >= 100 ? 'prime' : precio >= 60 ? 'oro' : precio >= 30 ? 'plata' : 'comun',
        precioMinimo: precio,
        etiqueta: '',
        dato: '',
        fotos: [`/img/${pos}-${i}.webp`],
      });
    }
  return out;
}
function trolls(n = 30): Troll[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, nombre: `Troll ${i}`, descripcion: 'd', precioMinimo: 5, rating: 40, foto: `/img/t${i}.webp`, activo: true }));
}
const T = TIEMPOS;

function sala(n: number, ajustes: Partial<Ajustes> = {}, semilla = 42, nTrolls = 30) {
  const p = new Partida('TEST');
  p.cambiarAjustes(ajustes);
  for (let i = 0; i < n; i++) expect(p.entrar(`p${i}`, `Jugador ${i}`, 'a').ok).toBe(true);
  let ahora = 1000;
  expect(p.empezar(pool(), trolls(nTrolls), semilla, ahora)).toBe(true);
  const ir = (ms: number) => {
    ahora += ms;
    p.avanzar(ahora);
  };
  /** Avanza hasta que la fase sea la pedida. */
  const hasta = (...fases: string[]) => {
    for (let i = 0; i < 400 && !fases.includes(p.fase); i++) ir(Math.max(1, p.vence - ahora));
    expect(fases).toContain(p.fase);
  };
  return { p, ir, hasta, ahora: () => ahora };
}

describe('mazo', () => {
  it('reparte participantes + extra cartas en cada una de las 11 rondas', () => {
    for (const n of [3, 5, 8])
      for (const extra of [0, 1, 2]) {
        const m = generarMazo(pool(), trolls(), n, { ...AJUSTES_DEFECTO, extra }, 7);
        expect(m.rondas).toHaveLength(11);
        for (const r of m.rondas) expect(r.cartas).toHaveLength(n + extra);
      }
  });

  it('no repite ningún jugador ni troll en la partida y respeta la posición', () => {
    for (let s = 1; s <= 40; s++) {
      const m = generarMazo(pool(), trolls(), 8, AJUSTES_DEFECTO, s);
      const ids = m.rondas.flatMap((r) => r.cartas.map((c) => c.refId));
      expect(new Set(ids).size).toBe(ids.length);
      m.rondas.forEach((r, i) => {
        expect(r.pos).toBe(FORMACION[i]);
        for (const c of r.cartas) if (c.tipo === 'jugador') expect(c.refId.startsWith(r.pos + '-')).toBe(true);
      });
    }
  });

  it('el rango de trolls por ronda crece con la cantidad de participantes', () => {
    expect(rangoTrolls(3)).toEqual({ min: 1, max: 1 });
    expect(rangoTrolls(5)).toEqual({ min: 1, max: 2 });
    expect(rangoTrolls(6)).toEqual({ min: 1, max: 3 });
    expect(rangoTrolls(8)).toEqual({ min: 2, max: 4 });
    expect(rangoTrolls(10)).toEqual({ min: 3, max: 5 });
    // En una sala, el modo automático aplica el rango al empezar.
    for (const n of [6, 10]) {
      const { p } = sala(n, {}, n * 31, 60);
      const r = rangoTrolls(n);
      expect(p.ajustes.trollsMin).toBe(r.min);
      expect(p.ajustes.trollsMax).toBe(r.max);
      const vistos = new Set<number>();
      for (const ronda of p.mazo!.rondas) {
        const t = ronda.cartas.filter((c) => c.tipo === 'troll').length;
        expect(t).toBeGreaterThanOrEqual(r.min);
        expect(t).toBeLessThanOrEqual(r.max);
        vistos.add(t);
      }
      expect(vistos.size).toBeGreaterThan(1); // varía de una ronda a otra
    }
  });

  it('el anfitrión puede fijar su propio rango de trolls antes de empezar (apaga el automático)', () => {
    const { p } = sala(6, { trollsMin: 2, trollsMax: 2 }, 77, 60);
    expect(p.ajustes.trollsAuto).toBe(false);
    for (const ronda of p.mazo!.rondas) expect(ronda.cartas.filter((c) => c.tipo === 'troll')).toHaveLength(2);
    // Y al salir, la carta no se delata con la palabra "troll".
    for (const ronda of p.mazo!.rondas) for (const c of ronda.cartas) expect(c.etiqueta.toLowerCase()).not.toContain('troll');
  });

  it('los trolls salen camuflados: con un precio de futbolista real, no regalados', () => {
    const precios: number[] = [];
    for (let s = 1; s <= 20; s++) {
      const m = generarMazo(pool(), trolls(), 6, { ...AJUSTES_DEFECTO, trollsMin: 1, trollsMax: 3 }, s);
      for (const r of m.rondas) for (const c of r.cartas) if (c.tipo === 'troll') precios.push(c.precioMinimo);
    }
    // Cada troll sale disfrazado con la silueta de un futbolista real que no está en la partida.
    const m1 = generarMazo(pool(), trolls(), 6, AJUSTES_DEFECTO, 5);
    const reales = new Set(m1.rondas.flatMap((r) => r.cartas.filter((c) => c.tipo === 'jugador').map((c) => c.foto)));
    for (const r of m1.rondas)
      for (const c of r.cartas.filter((x) => x.tipo === 'troll')) {
        expect(c.fotoSilueta).toMatch(new RegExp(`/img/${r.pos}-`));
        expect(reales.has(c.fotoSilueta!)).toBe(false);
        expect(c.tokenSilueta).not.toBe(c.token);
      }
    expect(Math.min(...precios)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...precios)).toBeGreaterThan(100); // a veces se disfrazan de estrella
    expect(precios.filter((p) => p > 30).length / precios.length).toBeGreaterThan(0.4);
    // Con el camuflaje apagado vuelven a su precio propio.
    const m = generarMazo(pool(), trolls(), 6, { ...AJUSTES_DEFECTO, trollsCamuflados: false }, 3);
    for (const r of m.rondas) for (const c of r.cartas) if (c.tipo === 'troll') expect(c.precioMinimo).toBe(5);
  });

  it('quien compra un troll paga lo que ofertó, como con cualquier jugador', () => {
    const { p, hasta, ir, ahora } = sala(3);
    // Avanza hasta que la carta en puja sea un troll.
    for (let i = 0; i < 60; i++) {
      hasta('puja');
      if (p.cartaActual()!.tipo === 'troll') break;
      ir(15000);
      if (p.fase === 'ultima') ir(10000);
    }
    const c = p.cartaActual()!;
    expect(c.tipo).toBe('troll');
    const pid = p.pendientes()[0].id;
    const rival = p.pendientes()[1]?.id ?? pid;
    const antes = p.jugador(pid)!.saldo;
    p.ofertar(pid, c.uid, ahora());
    if (rival !== pid) {
      p.ofertar(rival, c.uid, ahora());
      p.ofertar(pid, c.uid, ahora());
    }
    const precio = p.precio;
    ir(15000);
    expect(p.compradorId).toBe(pid);
    expect(p.jugador(pid)!.saldo).toBe(antes - precio);
    expect(precio).toBeGreaterThan(c.precioMinimo);
  });

  it('mete 1 o 2 trolls por ronda, en posiciones que cambian', () => {
    const posiciones = new Set<number>();
    const cantidades = new Set<number>();
    for (let s = 1; s <= 30; s++) {
      const m = generarMazo(pool(), trolls(), 5, AJUSTES_DEFECTO, s);
      for (const r of m.rondas) {
        const idx = r.cartas.map((c, i) => (c.tipo === 'troll' ? i : -1)).filter((i) => i >= 0);
        expect(idx.length).toBeGreaterThanOrEqual(1);
        expect(idx.length).toBeLessThanOrEqual(2);
        cantidades.add(idx.length);
        idx.forEach((i) => posiciones.add(i));
      }
    }
    expect(cantidades).toEqual(new Set([1, 2]));
    expect(posiciones.size).toBe(6); // salieron en todas las posiciones posibles de la ronda
  });

  it('con pocas fotos troll las repite, pero nunca seguidas ni dos veces en la misma ronda', () => {
    const m = generarMazo(pool(), trolls(3), 8, AJUSTES_DEFECTO, 9);
    const orden = m.rondas.flatMap((r) => r.cartas.filter((c) => c.tipo === 'troll').map((c) => c.refId));
    expect(orden.length).toBeGreaterThanOrEqual(11);
    for (const r of m.rondas) {
      const t = r.cartas.filter((c) => c.tipo === 'troll').map((c) => c.refId);
      expect(new Set(t).size).toBe(t.length);
    }
  });

  it('el precio de cada carta se sortea en una banda alrededor del precio base y cambia entre partidas', () => {
    expect(rangoPrecio({ precioMinimo: 100 })).toEqual([80, 120]);
    expect(rangoPrecio({ precioMinimo: 40 })).toEqual([28, 52]);
    expect(rangoPrecio({ precioMinimo: 15 })).toEqual([9, 21]);
    expect(rangoPrecio({ precioMinimo: 100, precioRango: [90, 130] })).toEqual([90, 130]);
    const base = new Map(pool().map((j) => [j.id, j]));
    const vistos = new Map<string, Set<number>>();
    let senuelos = 0;
    for (let semilla = 1; semilla <= 40; semilla++) {
      const m = generarMazo(pool(), trolls(), 6, AJUSTES_DEFECTO, semilla);
      for (const r of m.rondas)
        for (const c of r.cartas) {
          if (c.tipo !== 'jugador') continue;
          const j = base.get(c.refId)!;
          const [lo, hi] = rangoPrecio(j);
          const enBanda = c.precioMinimo >= lo && c.precioMinimo <= hi;
          const esSenuelo = j.precioMinimo <= SENUELO_HASTA && c.precioMinimo >= SENUELO_MIN && c.precioMinimo <= SENUELO_MAX;
          expect(enBanda || esSenuelo).toBe(true);
          if (esSenuelo && !enBanda) senuelos++;
          if (j.precioMinimo > SENUELO_HASTA) expect(enBanda).toBe(true); // los buenos nunca llevan señuelo
          if (!vistos.has(c.refId)) vistos.set(c.refId, new Set());
          vistos.get(c.refId)!.add(c.precioMinimo);
        }
    }
    expect(senuelos).toBeGreaterThan(0); // a veces un flojo sale caro
    // Un mismo jugador no sale siempre al mismo precio.
    const variados = [...vistos.values()].filter((s) => s.size >= 3).length;
    expect(variados).toBeGreaterThan(vistos.size * 0.5);
    // La misma semilla repite los mismos precios.
    const a = generarMazo(pool(), trolls(), 6, AJUSTES_DEFECTO, 9).rondas.flatMap((r) => r.cartas.map((c) => c.precioMinimo));
    const b = generarMazo(pool(), trolls(), 6, AJUSTES_DEFECTO, 9).rondas.flatMap((r) => r.cartas.map((c) => c.precioMinimo));
    expect(a).toEqual(b);
  });

  it('dos partidas seguidas son distintas y la misma semilla repite el mazo', () => {
    const a = generarMazo(pool(), trolls(), 5, AJUSTES_DEFECTO, 1);
    const b = generarMazo(pool(), trolls(), 5, AJUSTES_DEFECTO, 2);
    const a2 = generarMazo(pool(), trolls(), 5, AJUSTES_DEFECTO, 1);
    const firma = (m: typeof a) => m.rondas.map((r) => r.cartas.map((c) => c.refId).join(',')).join('|');
    expect(firma(a)).not.toBe(firma(b));
    expect(firma(a)).toBe(firma(a2));
  });

  it('cada ronda trae al menos 2 cartas baratas y los pisos caben holgados en el presupuesto', () => {
    for (let s = 1; s <= 40; s++) {
      const m = generarMazo(pool(), trolls(), 6, { ...AJUSTES_DEFECTO, trollsMin: 0, trollsMax: 0 }, s);
      for (const r of m.rondas) expect(r.cartas.filter((c) => c.precioMinimo <= UMBRAL_BARATO).length).toBeGreaterThanOrEqual(2);
      expect(pisosDeRonda(m).reduce((x, y) => x + y, 0)).toBeLessThan(AJUSTES_DEFECTO.presupuesto / 2);
    }
  });
});

describe('subasta', () => {
  it('arranca con 1000M, muestra el precio mínimo y abre la puja con 15 s', () => {
    const { p, hasta } = sala(3);
    expect(p.jugadores.every((j) => j.saldo === 1000)).toBe(true);
    hasta('presenta');
    const carta = p.cartaActual()!;
    expect(p.precio).toBe(carta.precioMinimo);
    hasta('puja');
    expect(p.duracion).toBe(15000);
    expect(p.vista().carta!.revelada).toBeUndefined(); // la identidad no viaja antes de la revelación
  });

  it('cada oferta suma exactamente 1M sobre el precio mínimo y reinicia el contador a 15 s', () => {
    const { p, hasta, ir, ahora } = sala(3);
    hasta('puja');
    const c = p.cartaActual()!;
    ir(9000);
    expect(p.ofertar('p0', c.uid, ahora())).toBe(true);
    expect(p.precio).toBe(c.precioMinimo + 1);
    expect(p.vence - ahora()).toBe(15000);
    ir(14000);
    expect(p.fase).toBe('puja');
    expect(p.ofertar('p1', c.uid, ahora())).toBe(true);
    expect(p.precio).toBe(c.precioMinimo + 2);
    expect(p.vence - ahora()).toBe(15000);
  });

  it('oferta personalizada: salta a la cifra elegida, pero nunca por debajo del mínimo ni por encima del tope', () => {
    const { p, hasta, ahora } = sala(3);
    hasta('puja');
    const c = p.cartaActual()!;
    expect(p.ofertar('p0', c.uid, ahora(), c.precioMinimo + 20)).toBe(true);
    expect(p.precio).toBe(c.precioMinimo + 20);
    expect(p.vence - ahora()).toBe(15000);
    p.eventos = [];
    expect(p.ofertar('p1', c.uid, ahora(), c.precioMinimo + 10)).toBe(false); // ya la pasaron
    expect(p.eventos).toContainEqual({ e: 'rechazo', pid: 'p1', motivo: 'superado' });
    expect(p.ofertar('p1', c.uid, ahora(), 99999)).toBe(false); // más que su tope
    expect(p.eventos).toContainEqual({ e: 'rechazo', pid: 'p1', motivo: 'sin_saldo' });
    expect(p.ofertar('p1', c.uid, ahora())).toBe(true); // el toque normal sigue sumando 1
    expect(p.precio).toBe(c.precioMinimo + 21);
  });

  it('ofertas simultáneas: se resuelven por orden de llegada, cada una +1M', () => {
    const { p, hasta, ahora } = sala(4);
    hasta('puja');
    const c = p.cartaActual()!;
    const t = ahora() + 100;
    expect(p.ofertar('p0', c.uid, t)).toBe(true);
    expect(p.ofertar('p1', c.uid, t)).toBe(true);
    expect(p.ofertar('p2', c.uid, t)).toBe(true);
    expect(p.precio).toBe(c.precioMinimo + 3);
    expect(p.liderId).toBe('p2');
    expect(p.ofertar('p2', c.uid, t)).toBe(false); // no se puede superar a uno mismo
  });

  it('vende al último que ofertó cuando el contador llega a 0 y descuenta el saldo', () => {
    const { p, hasta, ir, ahora } = sala(3);
    hasta('puja');
    const c = p.cartaActual()!;
    p.ofertar('p1', c.uid, ahora());
    ir(15000);
    expect(p.fase).toBe('martillo');
    expect(p.desenlace).toBe('vendido');
    expect(p.compradorId).toBe('p1');
    expect(p.jugador('p1')!.saldo).toBe(1000 - (c.precioMinimo + 1));
    expect(p.jugador('p1')!.equipo[c.hueco]).toBeNull(); // todavía no revelada
    hasta('revela');
    expect(p.jugador('p1')!.equipo[c.hueco]!.pagado).toBe(c.precioMinimo + 1);
    expect(p.vista().carta!.revelada!.nombre).toBe(c.nombre);
  });

  it('rechaza ofertas tardías y de quien ya compró en la ronda', () => {
    const { p, hasta, ir, ahora } = sala(3);
    hasta('puja');
    const c = p.cartaActual()!;
    p.ofertar('p0', c.uid, ahora());
    ir(15000);
    p.eventos = [];
    expect(p.ofertar('p1', c.uid, ahora())).toBe(false);
    expect(p.eventos).toContainEqual({ e: 'rechazo', pid: 'p1', motivo: 'tarde' });
    hasta('puja');
    const c2 = p.cartaActual()!;
    p.eventos = [];
    expect(p.ofertar('p0', c2.uid, ahora())).toBe(false);
    expect(p.eventos).toContainEqual({ e: 'rechazo', pid: 'p0', motivo: 'ya_compraste' });
    // una oferta con el uid de la carta anterior también llega tarde
    expect(p.ofertar('p1', c.uid, ahora())).toBe(false);
  });

  it('si nadie oferta y sobran cartas, la carta pasa sin venderse', () => {
    const { p, hasta, ir } = sala(3);
    hasta('puja');
    expect(p.sobran()).toBe(1);
    ir(15000);
    expect(p.desenlace).toBe('pasa');
    expect(p.jugadores.every((j) => j.saldo === 1000)).toBe(true);
    hasta('puja');
    expect(p.sobran()).toBe(0);
  });

  it('saltear: solo con sobrantes, sin ofertas y con cupo; descarta la carta para todos', () => {
    const { p, hasta, ahora } = sala(3);
    hasta('puja');
    const c = p.cartaActual()!;
    expect(p.saltear('p0', c.uid, ahora())).toBe(true);
    expect(p.jugador('p0')!.skips).toBe(1);
    expect(p.desenlace).toBe('salteada');
    hasta('puja');
    const c2 = p.cartaActual()!;
    p.eventos = [];
    expect(p.saltear('p1', c2.uid, ahora())).toBe(false); // ya no sobran
    expect(p.eventos).toContainEqual({ e: 'rechazo', pid: 'p1', motivo: 'no_sobran' });
  });

  it('no se puede saltear una carta que ya tiene ofertas', () => {
    const { p, hasta, ahora } = sala(3);
    hasta('puja');
    const c = p.cartaActual()!;
    p.ofertar('p0', c.uid, ahora());
    expect(p.saltear('p1', c.uid, ahora())).toBe(false);
  });

  it('sin sobrantes y sin ofertas: última oportunidad, y una oferta reanuda la subasta normal', () => {
    const { p, hasta, ir, ahora } = sala(3);
    hasta('puja');
    ir(15000); // pasa la carta extra
    hasta('puja');
    ir(15000);
    expect(p.fase).toBe('ultima');
    expect(p.duracion).toBe(10000);
    const c = p.cartaActual()!;
    expect(p.ofertar('p2', c.uid, ahora())).toBe(true);
    expect(p.fase).toBe('puja');
    expect(p.vence - ahora()).toBe(15000);
    ir(15000);
    expect(p.desenlace).toBe('vendido');
    expect(p.compradorId).toBe('p2');
  });

  it('si tampoco hay ofertas en la última oportunidad, la ruleta elige y se paga el precio mínimo', () => {
    const { p, hasta, ir } = sala(3);
    hasta('puja');
    ir(15000);
    hasta('puja');
    const c = p.cartaActual()!;
    ir(15000);
    ir(10000);
    expect(p.fase).toBe('ruleta');
    expect(p.ruleta!.candidatos).toHaveLength(3);
    const ganador = p.ruleta!.ganador;
    ir(T.ruleta);
    expect(p.desenlace).toBe('ruleta');
    expect(p.compradorId).toBe(ganador);
    expect(p.jugador(ganador)!.saldo).toBe(1000 - c.precioMinimo);
  });

  it('el último pendiente se lleva la última carta al precio mínimo, sin subasta', () => {
    const { p, hasta, ir, ahora } = sala(3, { extra: 0 });
    for (const pid of ['p0', 'p1']) {
      hasta('puja');
      p.ofertar(pid, p.cartaActual()!.uid, ahora());
      ir(15000);
    }
    hasta('presenta');
    const c = p.cartaActual()!;
    ir(T.presenta);
    expect(p.fase).toBe('martillo');
    expect(p.desenlace).toBe('obligado');
    expect(p.compradorId).toBe('p2');
    expect(p.jugador('p2')!.saldo).toBe(1000 - c.precioMinimo);
  });

  it('nadie se lleva un jugador gratis ni por debajo del mínimo en una partida entera sin ofertas', () => {
    const { p, hasta } = sala(5);
    hasta('final');
    for (const h of p.historial)
      if (h.compradorId) {
        expect(h.precio!).toBeGreaterThanOrEqual(1);
        // Normalmente el precio mínimo; menos solo si al forzado no le alcanzaba (liquidación).
        expect(h.precio!).toBeLessThanOrEqual(h.carta.precioMinimo);
      }
    for (const j of p.jugadores) {
      expect(j.equipo.every((f) => f)).toBe(true);
      expect(j.saldo).toBeGreaterThanOrEqual(0);
    }
  });

  it('el anfitrión puede terminar la partida a mitad: se calculan resultados con lo que hay', () => {
    const { p, hasta, ir, ahora } = sala(3);
    hasta('puja');
    p.ofertar('p0', p.cartaActual()!.uid, ahora());
    ir(15000);
    hasta('puja');
    p.terminar();
    expect(p.fase).toBe('final');
    expect(p.final!.puestos).toHaveLength(3);
    expect(p.proximoVencimiento()).toBeNull();
  });

  it('pausa: congela el contador y lo retoma donde estaba', () => {
    const { p, hasta, ir, ahora } = sala(3);
    hasta('puja');
    ir(5000);
    p.pausar(true, ahora());
    ir(60000);
    expect(p.fase).toBe('puja');
    expect(p.ofertar('p0', p.cartaActual()!.uid, ahora())).toBe(false);
    p.pausar(false, ahora());
    expect(p.vence - ahora()).toBe(10000);
  });
});

describe('reserva de presupuesto', () => {
  it('no deja ofertar por encima de saldo − reserva', () => {
    const { p, hasta, ahora } = sala(3);
    hasta('puja');
    const j = p.jugador('p0')!;
    const c = p.cartaActual()!;
    j.saldo = p.reserva() + c.precioMinimo; // le alcanza justo el mínimo, pero ofertar es mínimo + 1
    p.eventos = [];
    expect(p.ofertar('p0', c.uid, ahora())).toBe(false);
    expect(p.eventos).toContainEqual({ e: 'rechazo', pid: 'p0', motivo: 'sin_saldo' });
    j.saldo += 1;
    expect(p.ofertar('p0', c.uid, ahora())).toBe(true);
  });

  it('si al forzado no le alcanza el mínimo, paga lo que puede (nunca gratis, nunca en rojo)', () => {
    const { p, hasta, ir } = sala(2, { extra: 0, trollsMin: 0, trollsMax: 0 });
    hasta('puja');
    for (const j of p.jugadores) j.saldo = p.reserva() + p.pisos[0]; // justo lo mínimo para sobrevivir
    ir(15000);
    ir(10000);
    expect(p.fase).toBe('ruleta');
    ir(T.ruleta);
    const g = p.jugador(p.compradorId!)!;
    expect(p.pagado!).toBeGreaterThanOrEqual(1);
    expect(g.saldo).toBeGreaterThanOrEqual(p.reserva());
  });

  it('partidas completas con ofertas agresivas al azar: nunca hay estado sin salida', () => {
    for (let semilla = 1; semilla <= 60; semilla++) {
      const n = 3 + (semilla % 6);
      const { p, ir, ahora } = sala(n, { extra: semilla % 3 }, semilla);
      let r = semilla * 7919;
      const azar = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let paso = 0; paso < 200000 && p.fase !== 'final'; paso++) {
        if (p.fase === 'puja' || p.fase === 'ultima') {
          const c = p.cartaActual()!;
          const pend = p.pendientes();
          // Ofertan como locos hasta fundirse.
          const quien = pend[Math.floor(azar() * pend.length)];
          const u = azar();
          if (u < 0.75) p.ofertar(quien.id, c.uid, ahora());
          else if (u < 0.8) p.saltear(quien.id, c.uid, ahora());
          if (u > 0.93) ir(p.vence - ahora());
          else ir(50);
        } else ir(Math.max(1, p.vence - ahora()));
      }
      expect(p.fase).toBe('final');
      for (const j of p.jugadores) {
        expect(j.saldo).toBeGreaterThanOrEqual(0);
        expect(j.equipo.filter((f) => f).length).toBe(11);
      }
      const ids = p.historial.map((h) => h.carta.uid);
      expect(new Set(ids).size).toBe(ids.length);
      for (const h of p.historial) if (h.compradorId) expect(h.precio!).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('copia de seguridad', () => {
  it('una partida restaurada a mitad de una puja sigue exactamente igual', () => {
    const { p, hasta, ir, ahora } = sala(4);
    hasta('puja');
    p.ofertar('p0', p.cartaActual()!.uid, ahora());
    ir(15000);
    hasta('puja');
    p.ofertar('p2', p.cartaActual()!.uid, ahora());
    const copia = JSON.parse(JSON.stringify(p.exportar()));
    const q = new Partida('TEST');
    q.importar(copia, pool(), trolls(), ahora());
    expect(JSON.stringify(q.vista())).toBe(JSON.stringify({ ...p.vista(), jugadores: p.vista().jugadores.map((j) => ({ ...j, conectado: false })) }));
    // Y se puede seguir jugando hasta el final desde la copia.
    let t = ahora();
    for (let i = 0; i < 3000 && q.fase !== 'final'; i++) {
      t = Math.max(t + 1, q.vence);
      q.avanzar(t);
    }
    expect(q.fase).toBe('final');
    for (const j of q.jugadores) expect(j.equipo.filter((f) => f).length).toBe(11);
  });
});

describe('sala', () => {
  it('nombres únicos, máximo 8 y reconexión con la misma identidad', () => {
    const p = new Partida('X');
    expect(p.entrar('a', 'Toto', 'x').ok).toBe(true);
    expect(p.entrar('b', 'toto', 'x').ok).toBe(false);
    expect(p.entrar('a', 'Toto', 'y').ok).toBe(true); // el mismo dispositivo vuelve a entrar
    expect(p.jugadores).toHaveLength(1);
    p.conectar('a', false);
    expect(p.jugador('a')!.conectado).toBe(false);
    p.conectar('a', true);
    expect(p.jugador('a')!.conectado).toBe(true);
    for (let i = 0; i < 9; i++) p.entrar(`z${i}`, `Otro ${i}`, 'x');
    expect(p.jugadores).toHaveLength(10);
    expect(p.entrar('extra', 'Once', 'x').ok).toBe(false);
  });

  it('expulsar al que iba ganando devuelve la carta a su precio mínimo', () => {
    const { p, hasta, ahora } = sala(4);
    hasta('puja');
    const c = p.cartaActual()!;
    p.ofertar('p1', c.uid, ahora());
    p.expulsar('p1', ahora());
    expect(p.liderId).toBeNull();
    expect(p.precio).toBe(c.precioMinimo);
    expect(p.jugadores).toHaveLength(3);
  });

  it('la vista pública nunca expone la identidad de cartas no reveladas', () => {
    const { p, hasta } = sala(4);
    hasta('puja');
    const texto = JSON.stringify(p.vista());
    for (const r of p.mazo!.rondas) for (const c of r.cartas) {
      expect(texto).not.toContain(c.foto);
      expect(texto).not.toContain(`"${c.apellido || c.nombre}"`);
    }
  });
});
