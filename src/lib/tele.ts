// Identidad y conexión de una TV. La identidad vive en el navegador de la tele (localStorage);
// el servidor solo guarda en memoria qué teles están encendidas y su código de emparejamiento.
import { useSyncExternalStore } from 'react';
import { guardar, leer } from './util';

export interface EstadoTele {
  conectada: boolean;
  codigo: string | null;
  nombre: string;
  tvId: string;
}

const NOMBRES = ['Sala de estar', 'La tele grande', 'Tele del quincho', 'Pantalla gigante', 'Tele del living'];

let estado: EstadoTele = { conectada: false, codigo: null, nombre: '', tvId: '' };
let ws: WebSocket | null = null;
let activa = false;
let latido: ReturnType<typeof setInterval> | null = null;
let salaActual: string | null = null;
const oyentes = new Set<() => void>();
const alIr = new Set<(sala: string | null) => void>();

function poner(p: Partial<EstadoTele>) {
  estado = { ...estado, ...p };
  oyentes.forEach((f) => f());
}

function identidad() {
  let tvId = leer<string>('tv.id', '');
  if (!tvId) {
    tvId = crypto.randomUUID();
    guardar('tv.id', tvId);
  }
  let nombre = leer<string>('tv.nombre', '');
  if (!nombre) {
    nombre = NOMBRES[Math.floor(Math.random() * NOMBRES.length)];
    guardar('tv.nombre', nombre);
  }
  return { tvId, nombre };
}

function conectar() {
  if (!activa) return;
  const { tvId, nombre } = identidad();
  poner({ tvId, nombre });
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const s = new WebSocket(`${proto}://${location.host}/api/tv/ws?tv=${encodeURIComponent(tvId)}&nombre=${encodeURIComponent(nombre)}`);
  ws = s;
  s.onopen = () => {
    poner({ conectada: true });
    s.send(JSON.stringify({ t: 'en', sala: salaActual }));
    if (latido) clearInterval(latido);
    latido = setInterval(() => s.readyState === 1 && s.send(JSON.stringify({ t: 'ping' })), 20000);
  };
  s.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data) as { t: string; codigo?: string; sala?: string; nombre?: string };
      if (m.t === 'codigo') poner({ codigo: m.codigo ?? null });
      else if (m.t === 'ir' && m.sala) alIr.forEach((f) => f(m.sala!));
      else if (m.t === 'soltar') alIr.forEach((f) => f(null));
      else if (m.t === 'nombre' && m.nombre) {
        guardar('tv.nombre', m.nombre);
        poner({ nombre: m.nombre });
      }
    } catch {
      /* mensaje inválido */
    }
  };
  s.onclose = (ev) => {
    if (ws !== s) return;
    if (latido) clearInterval(latido);
    poner({ conectada: false });
    if (activa && ev.code !== 4000) setTimeout(conectar, 1500);
  };
}

/** Enciende el modo TV en este navegador (queda recordado para la próxima vez). */
export function encenderTele() {
  guardar('tv.modo', true);
  if (activa) return;
  activa = true;
  conectar();
}

export function apagarTele() {
  guardar('tv.modo', false);
  activa = false;
  ws?.close();
  ws = null;
  poner({ conectada: false, codigo: null });
}

export const esTele = () => leer('tv.modo', false);

export function renombrarTele(nombre: string) {
  const n = nombre.trim().slice(0, 24);
  if (!n) return;
  guardar('tv.nombre', n);
  poner({ nombre: n });
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'nombre', nombre: n }));
}

/** Avisa al registro en qué sala está la tele (para que el celular lo vea). */
export function teleEnSala(sala: string | null) {
  salaActual = sala;
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'en', sala }));
}

export function alLlamarTele(f: (sala: string | null) => void) {
  alIr.add(f);
  return () => {
    alIr.delete(f);
  };
}

export function useTele(): EstadoTele {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estado,
  );
}
