// Música dinámica generada en vivo con WebAudio (sin archivos): house / electrónica suave.
// Secuenciador de compases en La menor (Am9 – Fmaj7 – Cmaj7 – G6) con capas que entran según la intensidad
// (0 = lobby tranquilo, 1 = última oportunidad):
//   0.00 colchón de acordes · 0.20 bajo en contratiempo · 0.25 bombo suave · 0.30 hi-hat abierto · 0.35 acordes cortos (stabs)
//   0.50 palmas suaves + plucks · 0.60 shaker · 0.80 plucks en semicorcheas · 0.85 redoble de palmas cada 4 compases
// Los acordes "respiran" con el bombo (sidechain simulado). El tempo sube con la intensidad (112 → 124 bpm).
import { alCambiarSonido, audio, sonidoActivo } from './sonido';
import { guardar, leer } from './util';

type Ctx = BaseAudioContext;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
// Acordes por compás: raíz del bajo + notas del acorde (MIDI).
const ACORDES = [
  { bajo: 45, notas: [57, 60, 64, 67] }, // Am7
  { bajo: 41, notas: [53, 57, 60, 64] }, // Fmaj7
  { bajo: 48, notas: [55, 60, 64, 71] }, // Cmaj7
  { bajo: 43, notas: [55, 59, 62, 64] }, // G6
];

let ruidoBuf: AudioBuffer | null = null;
function ruido(ctx: Ctx): AudioBuffer {
  if (ruidoBuf && ruidoBuf.sampleRate === ctx.sampleRate) return ruidoBuf;
  ruidoBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = ruidoBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ruidoBuf;
}

function nota(ctx: Ctx, dst: AudioNode, t: number, f: number, dur: number, tipo: OscillatorType, vol: number, filtro?: number, ataque = 0.008) {
  const o = ctx.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let salida: AudioNode = g;
  o.connect(g);
  if (filtro) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filtro;
    g.connect(lp);
    salida = lp;
  }
  salida.connect(dst);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function golpeRuido(ctx: Ctx, dst: AudioNode, t: number, dur: number, vol: number, tipo: BiquadFilterType, frec: number) {
  const s = ctx.createBufferSource();
  s.buffer = ruido(ctx);
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.frequency.value = frec;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dst);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

function bombo(ctx: Ctx, dst: AudioNode, t: number, vol: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(125, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g).connect(dst);
  o.start(t);
  o.stop(t + 0.3);
}

export const tempo = (nivel: number) => 112 + Math.max(0, Math.min(1, nivel)) * 12;
export const duracionCompas = (nivel: number) => (60 / tempo(nivel)) * 4;

/** Escribe un compás completo de música a partir del instante `t`. Devuelve su duración en segundos. */
export function escribirCompas(ctx: Ctx, dst: AudioNode, t: number, indice: number, nivel: number): number {
  const ac = ACORDES[indice % ACORDES.length];
  const paso = 60 / tempo(nivel) / 4; // semicorchea
  const dur = paso * 16;
  const conBombo = nivel >= 0.25;

  // Los acordes pasan por un volumen que se hunde con cada bombo y vuelve (el "bombeo" del house).
  const aire = ctx.createGain();
  aire.connect(dst);
  aire.gain.setValueAtTime(1, t);
  if (conBombo)
    for (let b = 0; b < 4; b++) {
      const tb = t + b * paso * 4;
      aire.gain.setValueAtTime(0.4, tb);
      aire.gain.linearRampToValueAtTime(1, tb + paso * 3.4);
    }

  // Colchón: el acorde largo, siempre presente.
  for (const n of ac.notas) nota(ctx, aire, t, midi(n), dur * 1.08, 'triangle', 0.04, 1500, dur * 0.4);
  // Acordes cortos de órgano (stabs) a contratiempo.
  if (nivel >= 0.35)
    for (const p of [3, 10]) for (const n of ac.notas) nota(ctx, aire, t + p * paso, midi(n + 12), paso * 1.6, 'sine', 0.03, 2400, 0.01);
  // Bajo suave en el contratiempo.
  if (nivel >= 0.2)
    for (const p of [2, 6, 10, 14]) {
      nota(ctx, aire, t + p * paso, midi(ac.bajo), paso * 1.8, 'sawtooth', 0.085, 240 + nivel * 120, 0.01);
      nota(ctx, aire, t + p * paso, midi(ac.bajo), paso * 1.8, 'sine', 0.12, undefined, 0.01);
    }
  // Percusión.
  for (let p = 0; p < 16; p++) {
    const tp = t + p * paso;
    if (conBombo && p % 4 === 0) bombo(ctx, dst, tp, 0.34);
    if (nivel >= 0.3 && p % 4 === 2) golpeRuido(ctx, dst, tp, 0.11, 0.05, 'highpass', 8200); // hi-hat abierto en contratiempo
    if (nivel >= 0.6 && p % 2 === 1) golpeRuido(ctx, dst, tp, 0.04, 0.022, 'highpass', 9000); // shaker
    if (nivel >= 0.5 && (p === 4 || p === 12)) {
      golpeRuido(ctx, dst, tp, 0.12, 0.075, 'bandpass', 1500);
      golpeRuido(ctx, dst, tp + 0.012, 0.09, 0.04, 'bandpass', 2300);
    }
  }
  // Plucks suaves: corcheas, y semicorcheas cuando la cosa se calienta.
  if (nivel >= 0.5) {
    const [a, b, c, d] = ac.notas;
    const patron = [a, c, b, d, c, b, d, c];
    const salto = nivel >= 0.8 ? 1 : 2;
    for (let i = 0; i < 16; i += salto) nota(ctx, aire, t + i * paso, midi(patron[(i / salto) % patron.length] + 12), paso * 1.4, 'triangle', 0.024, 2600, 0.004);
  }
  // Redoble de palmas en el último compás del ciclo cuando está muy caliente.
  if (nivel >= 0.85 && indice % 4 === 3) for (let p = 12; p < 16; p++) golpeRuido(ctx, dst, t + p * paso, 0.07, 0.07 + (p - 12) * 0.02, 'bandpass', 2000);
  return dur;
}

/** Renderiza `segundos` de música con la intensidad que devuelva `nivelEn(t)` (para probar sin altavoces). */
export async function renderizarPrueba(segundos: number, nivelEn: (t: number) => number, sr = 32000): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(segundos * sr), sr);
  const bus = ctx.createGain();
  bus.gain.value = 0.6;
  bus.connect(ctx.destination);
  let t = 0;
  let i = 0;
  while (t < segundos) t += escribirCompas(ctx, bus, t, i++, nivelEn(t));
  return (await ctx.startRendering()).getChannelData(0);
}

// ───────────── Reproducción en vivo ─────────────

let activa = leer('musica', true);
const oyentes = new Set<() => void>();
export const musicaPreferida = () => activa;
export function alCambiarMusica(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}
export function ponerMusica(on: boolean) {
  activa = on;
  guardar('musica', on);
  aplicar();
  oyentes.forEach((f) => f());
}

let bus: GainNode | null = null;
let filtro: BiquadFilterNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let siguiente = 0;
let compas = 0;
let objetivo: number | null = null; // intensidad pedida por la pantalla (null = silencio)
let actual = 0.2; // intensidad suavizada

function aplicar() {
  const { ctx, maestro } = audio();
  const sonar = activa && objetivo !== null && sonidoActivo() && !!ctx && !!maestro;
  if (!sonar || !ctx || !maestro) {
    if (bus && ctx) bus.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    if (timer && !(activa && objetivo !== null)) {
      const t = timer;
      setTimeout(() => {
        if (t === timer && !(activa && objetivo !== null)) {
          clearInterval(t);
          timer = null;
        }
      }, 900);
    }
    return;
  }
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = 0;
    filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 5000;
    bus.connect(filtro).connect(maestro);
  }
  bus.gain.setTargetAtTime(0.6, ctx.currentTime, 0.6);
  if (!timer) {
    siguiente = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      const c = audio().ctx;
      if (!c || !bus || objetivo === null) return;
      // La intensidad se acerca a la pedida de a poco, para que los cambios no sean bruscos.
      actual += (objetivo - actual) * 0.5;
      filtro?.frequency.setTargetAtTime(1600 + actual * 3400, c.currentTime, 0.3);
      while (siguiente < c.currentTime + 0.4) siguiente += escribirCompas(c, bus, siguiente, compas++, actual);
    }, 120);
  }
}

/** Pide la música con una intensidad 0–1 (o `null` para apagarla). Se llama cada vez que cambia la fase. */
export function musica(nivel: number | null) {
  objetivo = nivel === null ? null : Math.max(0, Math.min(1, nivel));
  aplicar();
}

// Si se prende o apaga el sonido general, la música lo sigue.
alCambiarSonido(aplicar);
