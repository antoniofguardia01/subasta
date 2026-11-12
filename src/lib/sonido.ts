// Sonido sintetizado con WebAudio (sin archivos): martillo, tic-tac, ofertas, revelación, troll, ruleta.
import { guardar, leer } from './util';

let ctx: AudioContext | null = null;
let maestro: GainNode | null = null;
let activo = leer('sonido', false);
const oyentes = new Set<() => void>();

export const sonidoActivo = () => activo && !!ctx && ctx.state === 'running';
export const sonidoPreferido = () => activo;

export function alCambiarSonido(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Debe llamarse desde un gesto del usuario (los navegadores bloquean el audio automático). */
export async function activarSonido(on: boolean) {
  activo = on;
  guardar('sonido', on);
  if (on) {
    try {
      if (!ctx) {
        ctx = new AudioContext();
        maestro = ctx.createGain();
        maestro.gain.value = 0.5;
        maestro.connect(ctx.destination);
      }
      await ctx.resume();
      void cargarMuestras();
    } catch {
      activo = false;
    }
  } else await ctx?.suspend().catch(() => {});
  oyentes.forEach((f) => f());
}

// Muestras grabadas (generadas con Higgsfield): se usan cuando están cargadas; si no, suena el sintetizador.
const MUESTRAS = ['martillazo', 'revela', 'troll', 'ovacion'] as const;
type Muestra = (typeof MUESTRAS)[number];
const buffers: Partial<Record<Muestra, AudioBuffer>> = {};
let cargando = false;

async function cargarMuestras() {
  if (cargando || !ctx) return;
  cargando = true;
  await Promise.all(
    MUESTRAS.map(async (m) => {
      try {
        const r = await fetch(`/media/sfx/${m}.mp3`);
        buffers[m] = await ctx!.decodeAudioData(await r.arrayBuffer());
      } catch {
        /* sin muestra: queda el sintetizador */
      }
    }),
  );
}

function muestra(m: Muestra, vol = 0.8, cuando = 0): boolean {
  const b = buffers[m];
  if (!sonidoActivo() || !ctx || !maestro || !b) return false;
  const src = ctx.createBufferSource();
  src.buffer = b;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(maestro);
  src.start(ctx.currentTime + cuando);
  return true;
}

/** Intenta reanudar el audio si ya estaba elegido (tras el primer toque en la página). */
export function desbloquearSonido() {
  if (activo && (!ctx || ctx.state !== 'running')) void activarSonido(true);
}

function tono(frec: number, dur: number, tipo: OscillatorType = 'sine', vol = 0.3, hasta?: number, cuando = 0) {
  if (!sonidoActivo() || !ctx || !maestro) return;
  const t = ctx.currentTime + cuando;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(frec, t);
  if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(maestro);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function ruido(dur: number, vol = 0.3, filtro = 1200, cuando = 0, tipo: BiquadFilterType = 'lowpass') {
  if (!sonidoActivo() || !ctx || !maestro) return;
  const t = ctx.currentTime + cuando;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.frequency.value = filtro;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(maestro);
  src.start(t);
}

const sonarBase = {
  /** Oferta: sube de tono con el sobreprecio, así se oye cómo se calienta la puja. */
  oferta(sobre = 0) {
    const f = 520 + Math.min(40, sobre) * 14;
    tono(f, 0.09, 'triangle', 0.22);
    tono(f * 1.5, 0.12, 'sine', 0.12, undefined, 0.03);
  },
  rechazo() {
    tono(180, 0.18, 'sawtooth', 0.14, 110);
  },
  tic(fuerte = false) {
    tono(fuerte ? 1100 : 820, 0.045, 'square', fuerte ? 0.14 : 0.07);
  },
  /** "A la una… a las dos… a las tres…" */
  cuenta(n: number) {
    tono(330 + n * 110, 0.22, 'triangle', 0.28);
    ruido(0.08, 0.12, 2400);
  },
  martillo() {
    if (muestra('martillazo', 1)) {
      tono(110, 0.5, 'sine', 0.35, 50);
      return;
    }
    tono(150, 0.32, 'sine', 0.6, 46);
    ruido(0.16, 0.5, 900);
    tono(900, 0.05, 'square', 0.12);
    tono(110, 0.5, 'sine', 0.3, 60, 0.1);
  },
  golpeSuave() {
    tono(200, 0.2, 'sine', 0.3, 90);
    ruido(0.1, 0.18, 600);
  },
  entra() {
    ruido(0.35, 0.16, 1800, 0, 'bandpass');
    tono(220, 0.3, 'sine', 0.1, 440);
  },
  barrido() {
    ruido(0.5, 0.2, 3200, 0, 'highpass');
  },
  revela(nivel: 0 | 1 | 2) {
    if (!muestra('revela', 0.7)) ruido(0.45, 0.22, 4000, 0, 'highpass');
    const notas = nivel === 2 ? [392, 494, 587, 784, 988] : nivel === 1 ? [392, 494, 587, 784] : [440, 554, 659];
    notas.forEach((f, i) => tono(f, 0.5 + i * 0.05, 'triangle', 0.18, undefined, 0.12 + i * 0.07));
    if (nivel > 0) tono(98, 1.2, 'sine', 0.3, undefined, 0.1);
  },
  ovacion() {
    muestra('ovacion', 0.6, 0.15);
  },
  troll() {
    if (muestra('troll', 0.9)) return;
    tono(300, 0.16, 'sawtooth', 0.22, 220);
    tono(220, 0.16, 'sawtooth', 0.22, 165, 0.18);
    tono(165, 0.5, 'sawtooth', 0.24, 82, 0.36);
    tono(620, 0.08, 'square', 0.1, 1200, 0.9);
  },
  ruletaTic() {
    tono(1400, 0.03, 'square', 0.08);
  },
  alarma() {
    tono(660, 0.14, 'square', 0.14);
    tono(880, 0.14, 'square', 0.14, undefined, 0.16);
  },
  fanfarria() {
    muestra('ovacion', 0.8);
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tono(f, 0.28, 'triangle', 0.22, undefined, i * 0.13));
    ruido(1.4, 0.12, 5000, 0.2, 'highpass');
  },
  toque() {
    tono(700, 0.04, 'sine', 0.1);
  },
};

// ───────────── Ambiente de estadio ─────────────
// Murmullo continuo de hinchada (ruido rosa filtrado con oleadas lentas). Solo lo usa la pantalla principal.
// `nivel` 0 = tribuna tranquila, 1 = puja caliente / última oportunidad.
let amb: { g: GainNode; f: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;

function bufferRosa(seg: number): AudioBuffer {
  const n = Math.floor(ctx!.sampleRate * seg);
  const buf = ctx!.createBuffer(2, n, ctx!.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      // Oleadas de voces: modulación lenta e irregular.
      const ola = 0.65 + 0.35 * Math.sin((i / n) * Math.PI * 2 * 3 + c) * Math.sin((i / n) * Math.PI * 2 * 7.3);
      d[i] = (b0 + b1 + b2 + w * 0.05) * ola;
    }
    // Funde los extremos para que el bucle no haga clic.
    const fade = Math.floor(ctx!.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      d[i] *= i / fade;
      d[n - 1 - i] *= i / fade;
    }
  }
  return buf;
}

export function ambiente(nivel: number | null) {
  if (!ctx || !maestro) return;
  const t = ctx.currentTime;
  if (nivel === null || !sonidoActivo()) {
    if (amb) {
      const a = amb;
      a.g.gain.setTargetAtTime(0, t, 0.4);
      a.src.stop(t + 2);
      amb = null;
    }
    return;
  }
  if (!amb) {
    const src = ctx.createBufferSource();
    src.buffer = bufferRosa(6);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(maestro);
    src.start();
    amb = { g, f, src };
  }
  const k = Math.max(0, Math.min(1, nivel));
  amb.g.gain.setTargetAtTime(0.16 + k * 0.34, t, 0.8);
  amb.f.frequency.setTargetAtTime(520 + k * 700, t, 0.8);
}

export const sonar = {
  ...sonarBase,
  /** Silbato de árbitro: dos pitadas cortas (o una larga). */
  silbato(largo = false) {
    if (!sonidoActivo() || !ctx || !maestro) return;
    const pitadas = largo ? [[0, 0.9]] : [[0, 0.18], [0.26, 0.42]];
    for (const [ini, dur] of pitadas) {
      const t = ctx.currentTime + ini;
      const o = ctx.createOscillator();
      const vib = ctx.createOscillator();
      const vg = ctx.createGain();
      const g = ctx.createGain();
      o.frequency.value = 2900;
      vib.frequency.value = 38; // el "trino" de la bolita
      vg.gain.value = 140;
      vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
      g.gain.setValueAtTime(0.13, t + dur - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(maestro);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.02);
      vib.stop(t + dur + 0.02);
    }
  },
  /** "¡Uuuuh!" de la tribuna cuando nadie oferta o salió una sorpresa. */
  uuuh() {
    if (!sonidoActivo() || !ctx || !maestro) return;
    const t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * 1.6);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    src.connect(f).connect(g).connect(maestro);
    src.start(t);
  },
};
