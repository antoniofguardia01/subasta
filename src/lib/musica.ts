// Música dinámica generada en vivo con WebAudio (sin archivos): un secuenciador de compases en La menor
// (Am – F – C – G) con capas que van entrando según la intensidad (0 = lobby tranquilo, 1 = última oportunidad):
//   0.00 pad + bajo suave · 0.30 hi-hat · 0.35 bombo · 0.45 arpegio · 0.50 palmas/caja · 0.60 bombo a negras · 0.80 arpegio doble
// El tempo sube con la intensidad (104 → 140 bpm).
import { alCambiarSonido, audio, sonidoActivo } from './sonido';
import { guardar, leer } from './util';

type Ctx = BaseAudioContext;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
// Acordes por compás: raíz del bajo + notas del acorde (MIDI).
const ACORDES = [
  { bajo: 45, notas: [57, 60, 64] }, // Am
  { bajo: 41, notas: [53, 57, 60] }, // F
  { bajo: 48, notas: [55, 60, 64] }, // C
  { bajo: 43, notas: [55, 59, 62] }, // G
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
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(dst);
  o.start(t);
  o.stop(t + 0.25);
}

export const tempo = (nivel: number) => 104 + Math.max(0, Math.min(1, nivel)) * 36;
export const duracionCompas = (nivel: number) => (60 / tempo(nivel)) * 4;

/** Escribe un compás completo de música a partir del instante `t`. Devuelve su duración en segundos. */
export function escribirCompas(ctx: Ctx, dst: AudioNode, t: number, indice: number, nivel: number): number {
  const ac = ACORDES[indice % ACORDES.length];
  const paso = 60 / tempo(nivel) / 4; // semicorchea
  const dur = paso * 16;

  // Pad: el acorde largo, siempre presente.
  for (const n of ac.notas) nota(ctx, dst, t, midi(n), dur * 1.05, 'triangle', 0.045, 1800, dur * 0.35);
  // Bajo: más movido cuanto más intensidad.
  if (nivel >= 0.08) {
    const pasos = nivel < 0.5 ? [0, 6, 10] : [0, 2, 4, 6, 8, 10, 12, 14];
    pasos.forEach((p, i) => {
      const f = midi(ac.bajo + (nivel >= 0.5 && i % 4 === 3 ? 12 : 0));
      nota(ctx, dst, t + p * paso, f, paso * (nivel < 0.5 ? 3.2 : 1.7), 'sawtooth', 0.11, 420 + nivel * 500);
    });
  }
  // Percusión.
  const hat = nivel >= 0.3;
  const bomboFuerte = nivel >= 0.6;
  for (let p = 0; p < 16; p++) {
    const tp = t + p * paso;
    if (nivel >= 0.35 && (p === 0 || p === 8 || (bomboFuerte && (p === 4 || p === 12)))) bombo(ctx, dst, tp, 0.5);
    if (hat) {
      const fuerte = nivel >= 0.6;
      if (fuerte || p % 2 === 1 || p % 4 === 2) golpeRuido(ctx, dst, tp, 0.05, p % 4 === 2 ? 0.1 : 0.06, 'highpass', 7500);
    }
    if (nivel >= 0.5 && (p === 4 || p === 12)) {
      golpeRuido(ctx, dst, tp, 0.14, 0.22, 'bandpass', 1900);
      if (nivel >= 0.75) golpeRuido(ctx, dst, tp + paso * 0.5, 0.05, 0.1, 'bandpass', 2400);
    }
  }
  // Arpegio: dos octavas cuando la cosa se pone fea.
  if (nivel >= 0.45) {
    const [a, b, c] = ac.notas;
    const patron = [a, b, c, b, a, b, c, b + 12, a + 12, c, b, c, a, b, c, b];
    patron.forEach((n, i) => {
      const alto = nivel >= 0.8 && i % 2 === 1 ? 12 : 0;
      nota(ctx, dst, t + i * paso, midi(n + 12 + alto), paso * 0.9, 'square', 0.028 + nivel * 0.016, 2600 + nivel * 2400);
    });
  }
  // Redoble de caja en el último compás del ciclo cuando está muy caliente.
  if (nivel >= 0.85 && indice % 4 === 3) for (let p = 12; p < 16; p++) golpeRuido(ctx, dst, t + p * paso, 0.06, 0.12 + (p - 12) * 0.04, 'bandpass', 2200);
  return dur;
}

/** Renderiza `segundos` de música con la intensidad que devuelva `nivelEn(t)` (para probar sin altavoces). */
export async function renderizarPrueba(segundos: number, nivelEn: (t: number) => number, sr = 32000): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(segundos * sr), sr);
  const bus = ctx.createGain();
  bus.gain.value = 0.55;
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
    filtro.frequency.value = 6000;
    bus.connect(filtro).connect(maestro);
  }
  bus.gain.setTargetAtTime(0.8, ctx.currentTime, 0.6);
  if (!timer) {
    siguiente = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      const c = audio().ctx;
      if (!c || !bus || objetivo === null) return;
      // La intensidad se acerca a la pedida de a poco, para que los cambios no sean bruscos.
      actual += (objetivo - actual) * 0.5;
      filtro?.frequency.setTargetAtTime(1800 + actual * 6000, c.currentTime, 0.3);
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
