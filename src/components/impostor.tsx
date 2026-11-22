// Piezas del Impostor compartidas por el celular y la TV: escudo, carta del secreto, cuenta regresiva y tabla.
import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { EstadoImp, JugadorImpVista, Secreto } from '../../shared/impostor';
import { Avatar } from './comunes';
import { reducirMovimiento } from '../lib/util';

// ───────────── Escudo dibujado (versión clubes) ─────────────

const FORMA = 'M50 4 L93 15 V58 C93 88 73 106 50 117 C27 106 7 88 7 58 V15 Z';

function hashTexto(t: string) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Luminancia aproximada: para elegir tinta clara u oscura. */
function claro(hex: string) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

/**
 * Escudo genérico con los colores del club y su sigla. No copia el escudo real:
 * el diseño (mitad, franja, banda o bastones) sale del id, así cada club tiene siempre el mismo.
 */
export function Escudo({ colores, sigla, id, className = '' }: { colores: [string, string]; sigla: string; id: string; className?: string }) {
  const [c1, c2] = colores;
  const estilo = hashTexto(id) % 4;
  const clip = `esc-${id}`;
  return (
    <svg className={`escudo ${className}`} viewBox="0 0 100 121" role="img" aria-label={`Escudo ${sigla}`}>
      <defs>
        <clipPath id={clip}>
          <path d={FORMA} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="121" fill={c1} />
        {estilo === 0 && <rect x="50" width="50" height="121" fill={c2} />}
        {estilo === 1 && <rect x="36" width="28" height="121" fill={c2} />}
        {estilo === 2 && <path d="M-10 30 L30 -10 L110 70 L70 110 Z" fill={c2} />}
        {estilo === 3 && [14, 38, 62, 86].map((x) => <rect key={x} x={x - 6} width="12" height="121" fill={c2} />)}
        <rect y="47" width="100" height="27" fill="#101214" />
        <rect y="47" width="100" height="27" fill="none" stroke={claro(c1) ? c2 : c1} strokeWidth="2.5" />
      </g>
      <path d={FORMA} fill="none" stroke="#fff" strokeWidth="4" />
      <path d={FORMA} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.2" transform="translate(50 60) scale(.9) translate(-50 -60)" />
      <text x="50" y="68" textAnchor="middle" fontSize={sigla.length > 3 ? 16 : 19} fontWeight="900" fill="#fff" style={{ fontStretch: '125%', letterSpacing: '0.04em' }}>
        {sigla}
      </text>
    </svg>
  );
}

// ───────────── El secreto (foto del futbolista o escudo del club) ─────────────

export function ImagenSecreto({ s, className = '' }: { s: Secreto; className?: string }) {
  if (s.tipo === 'club' && s.colores) return <Escudo className={className} colores={s.colores} sigla={s.sigla ?? s.nombre.slice(0, 3).toUpperCase()} id={s.id} />;
  return <img className={`imp-foto ${className}`} src={s.img} alt="" draggable={false} />;
}

/** Carta grande con el secreto: imagen, nombre y detalle. */
export function CartaSecreto({ s, className = '', style }: { s: Secreto; className?: string; style?: CSSProperties }) {
  return (
    <div className={`imp-carta ${className}`} data-tipo={s.tipo} style={{ ...(s.colores ? { '--c1': s.colores[0], '--c2': s.colores[1] } : {}), ...style } as CSSProperties}>
      <div className="imp-carta-img">
        <ImagenSecreto s={s} />
      </div>
      {s.tipo === 'troll' && <span className="imp-carta-troll">Troll</span>}
      <div className="imp-carta-pie">
        <b>{s.nombre}</b>
        <span>{s.detalle}</span>
        {s.apodo && <em>{s.apodo}</em>}
      </div>
    </div>
  );
}

// ───────────── Cuenta regresiva sincronizada ─────────────

/** Segundos que faltan (se actualiza 4 veces por segundo). `ahora` es el reloj del servidor. */
export function useFaltan(vence: number, ahora: () => number): number {
  const [faltan, setFaltan] = useState(() => Math.max(0, vence - ahora()));
  useEffect(() => {
    if (!vence) return setFaltan(0);
    const t = () => setFaltan(Math.max(0, vence - ahora()));
    t();
    const id = setInterval(t, 250);
    return () => clearInterval(id);
  }, [vence, ahora]);
  return faltan;
}

const R = 44;
const LARGO = 2 * Math.PI * R;

export function Cuenta({ vence, duracion, ahora, className = '' }: { vence: number; duracion: number; ahora: () => number; className?: string }) {
  const faltan = useFaltan(vence, ahora);
  const seg = Math.ceil(faltan / 1000);
  const frac = duracion > 0 ? faltan / duracion : 0;
  const tension = seg <= 5 && vence > 0 ? 2 : seg <= 10 && vence > 0 ? 1 : 0;
  const texto = seg >= 60 ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : String(seg);
  return (
    <div className={`imp-cuenta ${className}`} data-tension={tension}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="imp-cuenta-pista" cx="50" cy="50" r={R} />
        <circle className="imp-cuenta-arco" cx="50" cy="50" r={R} strokeDasharray={LARGO} strokeDashoffset={LARGO * (1 - frac)} transform="rotate(-90 50 50)" />
      </svg>
      <span className="num" key={seg <= 5 ? seg : 'x'}>
        {vence ? texto : ''}
      </span>
    </div>
  );
}

// ───────────── Tabla de posiciones (con reordenamiento animado) ─────────────

export function ordenTabla(jugadores: JugadorImpVista[]) {
  return [...jugadores].sort((a, b) => b.puntos - a.puntos || b.ganadas - a.ganadas || a.tragos - b.tragos || a.nombre.localeCompare(b.nombre));
}

/**
 * La tabla arranca con las posiciones de antes de la ronda y, tras una pausa,
 * cada fila se desliza a su nuevo lugar mientras el +N aparece.
 */
export function Tabla({ s, yo, delta, tragos, className = '', demora = 0.9 }: { s: EstadoImp; yo?: string | null; delta?: Record<string, number> | null; tragos?: boolean; className?: string; demora?: number }) {
  const final = ordenTabla(s.jugadores);
  const antes = delta ? ordenTabla(s.jugadores.map((j) => ({ ...j, puntos: j.puntos - (delta[j.id] ?? 0) }))) : final;
  const [orden, setOrden] = useState(antes.map((j) => j.id));
  const caja = useRef<HTMLOListElement>(null);
  const firma = final.map((j) => `${j.id}:${j.puntos}`).join(',');

  useEffect(() => {
    setOrden(antes.map((j) => j.id));
    const id = setTimeout(() => setOrden(final.map((j) => j.id)), demora * 1000);
    return () => clearTimeout(id);
  }, [firma]); // eslint-disable-line react-hooks/exhaustive-deps

  // FLIP: se mide antes y después de reordenar y cada fila viaja de su lugar viejo al nuevo.
  const previas = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const filas = [...el.querySelectorAll<HTMLElement>('[data-pid]')];
    const ahora = new Map(filas.map((f) => [f.dataset.pid!, f.offsetTop]));
    if (!reducirMovimiento())
      for (const f of filas) {
        const antes = previas.current.get(f.dataset.pid!);
        const dy = antes == null ? 0 : antes - ahora.get(f.dataset.pid!)!;
        if (dy) gsap.fromTo(f, { y: dy }, { y: 0, duration: 0.7, ease: 'expo.out' });
      }
    previas.current = ahora;
  }, [orden.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const porId = new Map(s.jugadores.map((j) => [j.id, j]));
  const mostrar = orden.map((id) => porId.get(id)).filter(Boolean) as JugadorImpVista[];
  for (const j of final) if (!orden.includes(j.id)) mostrar.push(j);
  const puesto = (j: JugadorImpVista) => final.findIndex((x) => x.puntos === j.puntos) + 1;
  return (
    <ol className={`imp-tabla ${className}`} ref={caja}>
      {mostrar.map((j, i) => {
        const d = delta?.[j.id] ?? 0;
        return (
          <li key={j.id} data-pid={j.id} data-yo={j.id === yo ? '1' : undefined} data-lider={puesto(j) === 1 && j.puntos > 0 ? '1' : undefined} style={{ '--c': j.color, '--i': i } as CSSProperties}>
            <span className="it-puesto num">{puesto(j)}</span>
            <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
            <b className="it-nombre">{j.nombre}</b>
            {d > 0 && (
              <em className="it-delta num" style={{ animationDelay: `${demora}s` }}>
                +{d}
              </em>
            )}
            {tragos && (
              <span className="it-tragos num" title="Tragos">
                <img src="/img/iconos/trago.webp" alt="" />
                {j.tragos}
              </span>
            )}
            <span className="it-puntos num">{j.puntos}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const MOTIVO_TEXTO: Record<string, string> = {
  descubierto: 'Lo descubrieron a tiempo',
  sobrevivio: 'Nadie lo descubrió a tiempo',
  empates: 'El grupo no se puso de acuerdo dos veces',
  abandono: 'Ronda anulada: alguien se fue',
};

export const DIFICULTAD_TEXTO = ['', 'Cracks', 'Conocidos', 'Todos'];
