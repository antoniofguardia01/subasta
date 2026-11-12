// Simulación de calibración: partidas completas con bots que ofertan según cuánto quieren cada carta.
//   npm run simulate            → 300 partidas con 3–10 participantes
//   npm run simulate -- 1000    → otra cantidad
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Partida } from '../shared/game';
import type { Jugador, Troll } from '../shared/types';

const RAIZ = path.resolve(import.meta.dirname, '..');
const pool = JSON.parse(readFileSync(path.join(RAIZ, 'data/players.json'), 'utf8')) as Jugador[];
const trolls = JSON.parse(readFileSync(path.join(RAIZ, 'data/trolls.json'), 'utf8')) as Troll[];
const N = Number(process.argv[2]) || 300;

let semilla = 12345;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);

const r = { n: 0, sinEquipo: 0, sobrante: [] as number[], gastoMedio: [] as number[], guerras: 0, vendidas: 0, obligadas: 0, ruletas: 0, pasadas: 0, sobreprecio: [] as number[] };

for (let g = 0; g < N; g++) {
  const n = 3 + (g % 8);
  const p = new Partida('SIM');
  for (let i = 0; i < n; i++) p.entrar(`p${i}`, `J${i}`, '');
  let t = 1000;
  p.empezar(pool, trolls, Math.floor(azar() * 4e9), t);
  // Cada bot tiene un apetito (qué tanto se pasa del precio mínimo) y una ganas distinta por cada carta.
  const apetito = p.jugadores.map(() => 0.9 + azar() * 1.6);
  let valor = new Map<string, number>();
  let cartaVista = '';
  for (let paso = 0; paso < 400000 && p.fase !== 'final'; paso++) {
    if (p.fase === 'puja' || p.fase === 'ultima') {
      const c = p.cartaActual()!;
      if (c.uid !== cartaVista) {
        cartaVista = c.uid;
        valor = new Map(p.jugadores.map((j, i) => [j.id, c.precioMinimo * (apetito[i] * (0.7 + azar() * 0.9)) + azar() * 20]));
      }
      for (const j of p.pendientes()) if (azar() < 0.18 && p.precio + 1 <= (valor.get(j.id) ?? 0)) p.ofertar(j.id, c.uid, t);
      t += 400;
      if (p.vence - t < 400) t = p.vence;
    } else t = Math.max(t + 1, p.vence);
    p.avanzar(t);
  }
  r.n++;
  r.gastoMedio.push(p.jugadores.reduce((a, j) => a + j.gastado, 0) / n);
  for (const j of p.jugadores) {
    if (j.equipo.some((f) => !f)) r.sinEquipo++;
    r.sobrante.push(j.saldo);
  }
  for (const h of p.historial) {
    if (!h.compradorId) {
      r.pasadas++;
      continue;
    }
    r.vendidas++;
    if (h.desenlace === 'obligado') r.obligadas++;
    if (h.desenlace === 'ruleta') r.ruletas++;
    const extra = h.precio! - h.carta.precioMinimo;
    r.sobreprecio.push(extra);
    if (extra >= 15) r.guerras++;
  }
}
const prom = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
console.log(`Partidas: ${r.n} (3–10 participantes)`);
console.log(`Participantes que NO completaron los 11 huecos: ${r.sinEquipo} (debe ser 0)`);
console.log(`Gasto medio por participante: $${prom(r.gastoMedio).toFixed(0)}M de $1000M`);
console.log(`Saldo final: promedio $${prom(r.sobrante).toFixed(0)}M · 10% más bajo $${pct(r.sobrante, 0.1)}M · 10% más alto $${pct(r.sobrante, 0.9)}M`);
console.log(`Compras: ${r.vendidas} · con guerra (+15M o más): ${((r.guerras / r.vendidas) * 100).toFixed(0)}% · obligados: ${((r.obligadas / r.vendidas) * 100).toFixed(1)}% · ruleta: ${((r.ruletas / r.vendidas) * 100).toFixed(1)}%`);
console.log(`Sobreprecio medio: +$${prom(r.sobreprecio).toFixed(1)}M · el 90% pagó hasta +$${pct(r.sobreprecio, 0.9)}M · máximo +$${Math.max(...r.sobreprecio)}M`);
