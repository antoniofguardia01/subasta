import { describe, expect, it } from 'vitest';
import { Partida, TIEMPOS } from '../shared/game';
import { generarMazo, pisosDeRonda, UMBRAL_BARATO } from '../shared/deck';
import { AJUSTES_DEFECTO, Ajustes, FORMACION, Jugador, Pos, Troll } from '../shared/types';

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
        expect(h.precio!).toBe(h.carta.precioMinimo);
      }
    for (const j of p.jugadores) {
      expect(j.equipo.every((f) => f)).toBe(true);
      expect(j.saldo).toBeGreaterThanOrEqual(0);
    }
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
    for (let i = 0; i < 7; i++) p.entrar(`z${i}`, `Otro ${i}`, 'x');
    expect(p.entrar('extra', 'Noveno', 'x').ok).toBe(false);
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
