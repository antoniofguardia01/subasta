import { describe, expect, it } from 'vitest';
import { MIN_DOS_IMPOSTORES, PartidaImp, PUNTOS_IMP, Secreto, TIEMPOS_IMP } from '../shared/impostor';
import { candidatosImp, Club, dificultadJugador } from '../shared/impostorDatos';
import type { Jugador, Troll } from '../shared/types';
import jugadoresJson from '../data/players.json';
import clubesJson from '../data/clubes.json';

const secretos: Secreto[] = Array.from({ length: 20 }, (_, i) => ({ tipo: 'jugador', id: `s${i}`, nombre: `Jugador ${i}`, detalle: 'DC · AR', grupo: i % 2 ? 'ataque' : 'medio' }));

function partida(n = 4, ajustes = {}) {
  const p = new PartidaImp('ABCD');
  for (let i = 0; i < n; i++) p.entrar(`p${i}`, `Jugador${i}`, '');
  p.cambiarAjustes(ajustes);
  expect(p.empezar(secretos, 42, 0)).toEqual({ ok: true });
  return p;
}
const r = (p: PartidaImp) => p.ronda!;
const civiles = (p: PartidaImp) => r(p).vivos.filter((x) => !r(p).impostores.includes(x));
/** Todos marcan "listo" y se pasa directo a votar. */
function aVotar(p: PartidaImp, t = 1) {
  for (const pid of r(p).participantes) p.visto(pid, t);
  expect(p.fase).toBe('debate');
  p.aVotar(t);
  expect(p.fase).toBe('votacion');
}
/** Todos los vivos votan a `contra` (y `contra` vota a otro cualquiera). */
function votarA(p: PartidaImp, contra: string, t = 2) {
  for (const pid of r(p).vivos) p.votar(pid, pid === contra ? r(p).vivos.find((x) => x !== contra)! : contra, t);
}

describe('Impostor: arranque', () => {
  it('pide al menos 3 participantes', () => {
    const p = new PartidaImp('X');
    p.entrar('a', 'Ana', '');
    p.entrar('b', 'Beto', '');
    expect(p.empezar(secretos, 1, 0).ok).toBe(false);
  });

  it('reparte un secreto y un impostor; el impostor no ve el secreto', () => {
    const p = partida(4);
    expect(p.fase).toBe('reparto');
    expect(r(p).impostores).toHaveLength(1);
    const imp = r(p).impostores[0];
    const v = p.vista(imp, 20);
    expect(v.tu?.impostor).toBe(true);
    expect(v.tu?.secreto).toBeNull();
    const civil = civiles(p)[0];
    expect(p.vista(civil, 20).tu?.secreto?.id).toBe(r(p).secreto.id);
    // Nadie ve quién es el impostor ni el secreto en la vista pública.
    expect(p.vista(null, 20).ronda?.impostores).toBeNull();
    expect(p.vista(null, 20).ronda?.secreto).toBeNull();
    expect(JSON.stringify(p.vista(imp, 20))).not.toContain(r(p).secreto.nombre);
  });

  it('2 impostores solo con suficiente gente', () => {
    expect(r(partida(5, { impostores: 2 })).impostores).toHaveLength(1);
    const p = partida(MIN_DOS_IMPOSTORES, { impostores: 2 });
    expect(r(p).impostores).toHaveLength(2);
    const [a, b] = r(p).impostores;
    expect(p.vista(a, 20).tu?.companeros).toEqual([b]);
  });

  it('el reparto pasa solo al debate cuando vence el tiempo', () => {
    const p = partida(4);
    p.avanzar(TIEMPOS_IMP.reparto, secretos);
    expect(p.fase).toBe('debate');
  });
});

describe('Impostor: orden para hablar', () => {
  it('cada ronda sortea un orden nuevo con todos los participantes', () => {
    const p = partida(6, { rondas: 6, adivinar: false });
    const ordenes = new Set<string>();
    for (let k = 0; k < 6; k++) {
      expect([...r(p).orden].sort()).toEqual([...r(p).participantes].sort());
      ordenes.add(r(p).orden.join(','));
      aVotar(p, 100 * k);
      votarA(p, r(p).impostores[0], 100 * k + 1);
      p.avanzar(p.vence, secretos);
      p.siguiente(secretos, p.vence);
    }
    expect(ordenes.size).toBeGreaterThan(1);
  });

  it('si sacan a un inocente se sigue en el mismo orden, sin el eliminado', () => {
    const p = partida(5);
    const antes = r(p).orden.slice();
    aVotar(p);
    const inocente = civiles(p)[0];
    votarA(p, inocente);
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('debate');
    expect(p.vista(null, 20).ronda?.orden).toEqual(antes.filter((x) => x !== inocente));
  });
});

describe('Impostor: votación', () => {
  it('no se puede votar a uno mismo ni a un eliminado', () => {
    const p = partida(4);
    aVotar(p);
    p.votar('p0', 'p0', 2);
    expect(r(p).votos.p0).toBeUndefined();
  });

  it('descubren al impostor: gana el grupo, buen ojo suma', () => {
    const p = partida(4, { adivinar: false });
    aVotar(p);
    const imp = r(p).impostores[0];
    votarA(p, imp);
    expect(p.fase).toBe('veredicto');
    expect(r(p).veredictos[0]).toMatchObject({ pid: imp, eraImpostor: true, empate: false });
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('finronda');
    for (const c of civiles(p)) expect(p.jugador(c)!.puntos).toBe(PUNTOS_IMP.grupoGana + PUNTOS_IMP.buenOjo);
    expect(p.jugador(imp)!.puntos).toBe(0);
    expect(p.vista(null, 20).ronda?.secreto?.id).toBe(r(p).secreto.id);
  });

  it('eliminan a un inocente: sigue la ronda con menos tiempo de debate', () => {
    const p = partida(5);
    aVotar(p);
    const inocente = civiles(p)[0];
    votarA(p, inocente);
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('debate');
    expect(r(p).votacion).toBe(2);
    expect(p.duracion).toBe(Math.max(30, p.ajustes.debate * TIEMPOS_IMP.debateSiguiente) * 1000);
    expect(r(p).vivos).not.toContain(inocente);
  });

  it('el impostor gana si quedan tantos impostores como inocentes', () => {
    const p = partida(3);
    aVotar(p);
    votarA(p, civiles(p)[0]);
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('finronda');
    expect(r(p).ganador).toBe('impostor');
    expect(p.jugador(r(p).impostores[0])!.puntos).toBe(PUNTOS_IMP.impostorGana);
  });

  it('dos empates seguidos: gana el impostor', () => {
    const p = partida(4);
    aVotar(p);
    p.avanzar(p.vence, secretos); // nadie votó
    expect(r(p).veredictos[0].empate).toBe(true);
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('debate');
    p.aVotar(10);
    p.avanzar(p.vence, secretos);
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('finronda');
    expect(r(p).motivo).toBe('empates');
  });
});

describe('Impostor: adivinanza y tragos', () => {
  it('el impostor descubierto adivina y se lleva puntos', () => {
    const p = partida(4, { tragos: true });
    aVotar(p);
    const imp = r(p).impostores[0];
    votarA(p, imp);
    p.avanzar(p.vence, secretos);
    expect(p.fase).toBe('adivina');
    expect(p.vista(null, 20).ronda?.opciones).toHaveLength(8);
    expect(p.vista(null, 20).ronda?.opciones?.some((o) => o.id === r(p).secreto.id)).toBe(true);
    p.adivinar(imp, r(p).secreto.id, 5);
    expect(r(p).ganador).toBe('impostor');
    expect(r(p).motivo).toBe('adivino');
    expect(p.jugador(imp)!.puntos).toBe(PUNTOS_IMP.impostorAdivina);
    // Lo eliminaron: toma igual.
    expect(p.jugador(imp)!.tragos).toBe(1);
  });

  it('modo tragos: cada eliminación es un trago; sin el modo, no se cuentan', () => {
    const p = partida(5, { tragos: true });
    aVotar(p);
    const inocente = civiles(p)[0];
    votarA(p, inocente);
    expect(p.jugador(inocente)!.tragos).toBe(1);
    expect(p.jugador(inocente)!.eliminado).toBe(1);
    const q = partida(5);
    aVotar(q);
    const otro = civiles(q)[0];
    votarA(q, otro);
    expect(q.jugador(otro)!.tragos).toBe(0);
  });
});

describe('Impostor: rondas y final', () => {
  it('juega las rondas configuradas sin repetir secreto y termina', () => {
    const p = partida(4, { rondas: 3, adivinar: false });
    const vistos = new Set<string>();
    for (let k = 0; k < 3; k++) {
      vistos.add(r(p).secreto.id);
      aVotar(p, 100 * k);
      votarA(p, r(p).impostores[0], 100 * k + 1);
      p.avanzar(p.vence, secretos);
      expect(p.fase).toBe('finronda');
      p.siguiente(secretos, p.vence);
    }
    expect(p.fase).toBe('final');
    expect(vistos.size).toBe(3);
    expect(p.historial).toHaveLength(3);
  });

  it('si se va el impostor la ronda se anula sin puntos', () => {
    const p = partida(4);
    const imp = r(p).impostores[0];
    p.expulsar(imp, 5);
    expect(p.fase).toBe('finronda');
    expect(r(p).motivo).toBe('abandono');
    expect(p.jugadores.every((j) => j.puntos === 0)).toBe(true);
  });

  it('se guarda y se restaura en la misma fase', () => {
    const p = partida(4);
    aVotar(p);
    const q = new PartidaImp('ABCD');
    q.importar(JSON.parse(JSON.stringify(p.exportar())), 1000);
    expect(q.fase).toBe('votacion');
    expect(q.ronda!.secreto.id).toBe(r(p).secreto.id);
  });
});

const amigos: Troll[] = Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, nombre: `Amigo ${i}`, descripcion: `Cuento ${i}`, precioMinimo: 8, rating: 40, foto: `/catalogo/troll/t-${i}.webp?v=1`, activo: true }));

describe('Impostor: trolls como secreto', () => {
  const jugs = jugadoresJson as unknown as Jugador[];
  const cs = clubesJson as unknown as Club[];

  it('según la opción, entran, entran mezclados o son los únicos', () => {
    const base = { modo: 'jugadores' as const, dificultad: 1 as const };
    const nada = candidatosImp({ ...base, trolls: 'no' }, jugs, cs, amigos);
    const mezcla = candidatosImp({ ...base, trolls: 'aveces' }, jugs, cs, amigos);
    const solo = candidatosImp({ ...base, trolls: 'solo' }, jugs, cs, amigos);
    expect(nada.some((c) => c.tipo === 'troll')).toBe(false);
    expect(mezcla.filter((c) => c.tipo === 'troll')).toHaveLength(10);
    expect(mezcla.length).toBe(nada.length + 10);
    expect(solo.every((c) => c.tipo === 'troll')).toBe(true);
    expect(solo[0]).toMatchObject({ nombre: expect.stringContaining('Amigo'), detalle: expect.stringContaining('Cuento') });
  });

  it('los trolls pendientes, apagados o en clubes no salen', () => {
    const raros: Troll[] = [{ ...amigos[0], pendiente: true }, { ...amigos[1], activo: false }, amigos[2]];
    expect(candidatosImp({ modo: 'jugadores', dificultad: 1, trolls: 'aveces' }, jugs, cs, raros).filter((c) => c.tipo === 'troll')).toHaveLength(1);
    expect(candidatosImp({ modo: 'clubes', dificultad: 3, trolls: 'solo' }, jugs, cs, amigos).some((c) => c.tipo === 'troll')).toBe(false);
  });

  it('"a veces" saca trolls en una parte de las rondas, y la adivinanza usa otros trolls', () => {
    const mezcla = candidatosImp({ modo: 'jugadores', dificultad: 1, trolls: 'aveces' }, jugs, cs, amigos);
    let conTroll = 0;
    const N = 60;
    for (let k = 0; k < N; k++) {
      const p = new PartidaImp('ABCD');
      for (let i = 0; i < 3; i++) p.entrar(`p${i}`, `Jugador${i}`, '');
      p.empezar(mezcla, 1000 + k, 0);
      if (p.ronda!.secreto.tipo === 'troll') {
        conTroll++;
        const ops = p.ronda!.opciones;
        expect(ops).toHaveLength(8);
        expect(ops.filter((o) => o.tipo === 'troll').length).toBeGreaterThanOrEqual(8);
      }
    }
    expect(conTroll).toBeGreaterThan(N * 0.1);
    expect(conTroll).toBeLessThan(N * 0.6);
  });

  it('con "solo trolls" todas las rondas son de un amigo', () => {
    const solo = candidatosImp({ modo: 'jugadores', dificultad: 1, trolls: 'solo' }, jugs, cs, amigos);
    const p = new PartidaImp('ABCD');
    for (let i = 0; i < 3; i++) p.entrar(`p${i}`, `Jugador${i}`, '');
    p.cambiarAjustes({ rondas: 3, trolls: 'solo' });
    p.empezar(solo, 5, 0);
    expect(p.ronda!.secreto.tipo).toBe('troll');
    expect(p.ajustes.trolls).toBe('solo');
  });
});

describe('Impostor: datos', () => {
  it('hay suficientes futbolistas y clubes en cada dificultad', () => {
    const js = jugadoresJson as unknown as Jugador[];
    const cs = clubesJson as unknown as Club[];
    for (const dificultad of [1, 2, 3] as const) {
      expect(candidatosImp({ modo: 'jugadores', dificultad }, js, cs).length).toBeGreaterThanOrEqual(40);
      expect(candidatosImp({ modo: 'clubes', dificultad }, js, cs).length).toBeGreaterThanOrEqual(20);
    }
    expect(dificultadJugador({ rating: 91, rareza: 'prime' })).toBe(1);
  });
});
