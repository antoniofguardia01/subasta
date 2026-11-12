// Piezas compartidas por el escenario (TV) y el celular.
import { CSSProperties, memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import qrcode from 'qrcode-generator';
import type { FichaEquipo, JugadorSala, MensajeTicker, Pos } from '../../shared/types';
import { FORMACION } from '../../shared/types';
import { alCambiarTema, temaActual } from '../lib/temas';
import { reducirMovimiento } from '../lib/util';

// ───────────── Fondo animado ─────────────

const PATRON: Record<string, string> = { estadio: 'circulos', copa: 'rayos', album: 'puntos', pizarra: 'lineas', miami: 'bandas' };

export function useTema(): string {
  return useSyncExternalStore(alCambiarTema, temaActual);
}

export const Fondo = memo(function Fondo({ paleta = 'misterio', vel = 1, className = '' }: { paleta?: string; vel?: number; className?: string }) {
  const tema = useTema();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // --fu = 1% del ancho del fondo: las formas se dimensionan con eso (sin aspect-ratio, que falta en teles viejas).
    const el = ref.current!;
    const medir = () => el.style.setProperty('--fu', `${el.clientWidth / 100}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`fondo ${className}`} data-paleta={paleta} data-patron={PATRON[tema] ?? 'circulos'} style={{ '--vel': vel } as CSSProperties}>
      <i className="fa" />
      <i className="fb" />
      <i className="fc" />
      <i className="fd" />
      <i className="grano" />
    </div>
  );
});

// ───────────── Pantalla completa ─────────────

/** Botón de pantalla completa. No se muestra donde el navegador no lo permite (por ejemplo, iPhone). */
export function BotonPantalla({ corto = false, className = '' }: { corto?: boolean; className?: string }) {
  const doc = document as Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const raiz = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', f);
    document.addEventListener('webkitfullscreenchange', f);
    f();
    return () => {
      document.removeEventListener('fullscreenchange', f);
      document.removeEventListener('webkitfullscreenchange', f);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) return null;
  const alternar = () => {
    if (on) void (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
    else void (raiz.requestFullscreen ? raiz.requestFullscreen() : raiz.webkitRequestFullscreen?.());
  };
  return (
    <button type="button" className={`btn-pantalla ${className}`} onClick={alternar} aria-pressed={on} aria-label={on ? 'Salir de pantalla completa' : 'Pantalla completa'} title={on ? 'Salir de pantalla completa' : 'Pantalla completa'}>
      <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
      {!corto && <span>{on ? 'Salir' : 'Pantalla completa'}</span>}
    </button>
  );
}

// ───────────── Avatar ─────────────

/** La URL de la foto puede traer `r=cx,cy,ancho,proporción` (dónde está la cara). Con eso se encuadra la cara en el círculo. */
export function encuadreRostro(src: string): CSSProperties | undefined {
  const m = src.match(/[?&]r=([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
  if (!m) return undefined;
  const [cx, cy, w, ar] = [+m[1], +m[2], +m[3], +m[4]];
  if (!(w > 0) || !(ar > 0)) return undefined;
  // La cara ocupa ~60% del círculo; la imagen siempre tiene que cubrirlo entero.
  const W = Math.max(0.6 / w, 1.02, 1.02 * ar);
  const H = W / ar;
  const clamp = (v: number, tam: number) => Math.min(0, Math.max(1 - tam, v));
  const izq = clamp(0.5 - cx * W, W);
  const arriba = clamp(0.46 - cy * H, H);
  return { position: 'absolute', margin: 0, maxWidth: 'none', objectFit: 'fill', width: `${W * 100}%`, height: `${H * 100}%`, left: `${izq * 100}%`, top: `${arriba * 100}%` };
}

export function Avatar({ src, color, off, className = '' }: { src: string; color?: string; off?: boolean; className?: string }) {
  return (
    <span className={`avatar ${className}`} data-off={off ? '1' : undefined} style={color ? ({ '--c': color } as CSSProperties) : undefined}>
      {src && <img src={src} alt="" draggable={false} style={encuadreRostro(src)} />}
    </span>
  );
}

// ───────────── Número que rueda ─────────────

/**
 * Muestra un número. Si cambia poco (una oferta de +1M) los dígitos que cambian "ruedan";
 * si cambia mucho (un saldo que se descuenta) cuenta hasta el valor nuevo.
 */
export function Numero({ valor, prefijo = '', sufijo = '', className = '' }: { valor: number; prefijo?: string; sufijo?: string; className?: string }) {
  const [mostrado, setMostrado] = useState(valor);
  const previo = useRef(valor);
  const tween = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const desde = previo.current;
    previo.current = valor;
    tween.current?.kill();
    if (Math.abs(valor - desde) <= 3 || reducirMovimiento()) {
      setMostrado(valor);
      return;
    }
    const o = { v: desde };
    tween.current = gsap.to(o, {
      v: valor,
      duration: Math.min(1.1, 0.35 + Math.abs(valor - desde) / 400),
      ease: 'power2.out',
      onUpdate: () => setMostrado(Math.round(o.v)),
    });
    return () => {
      tween.current?.kill();
    };
  }, [valor]);

  const texto = String(mostrado);
  return (
    <span className={`numero num ${className}`}>
      {prefijo && <span className="numero-fijo">{prefijo}</span>}
      {texto.split('').map((d, i) => (
        // La clave incluye el dígito: al cambiar se remonta y dispara la animación de rodar.
        <span className="numero-d" key={`${texto.length - i}-${d}`}>
          {d}
        </span>
      ))}
      {sufijo && <span className="numero-fijo">{sufijo}</span>}
    </span>
  );
}

// ───────────── QR ─────────────

export const QR = memo(function QR({ texto, className = '' }: { texto: string; className?: string }) {
  const { d, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { d, n };
  }, [texto]);
  return (
    <svg className={`qr ${className}`} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label="Código QR">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" rx={1.2} />
      <path d={d} fill="#0b0f0d" />
    </svg>
  );
});

// ───────────── Ticker ─────────────

const RELLENO: MensajeTicker = { id: -1, texto: 'SUBASTA FUTBOLERA · Cada oferta suma 1 millón · Si nadie oferta y no sobran cartas, decide la ruleta', tipo: 'sistema' };

/**
 * Barra de noticias sin fin. Los mensajes nuevos entran por la derecha sin saltos:
 * la cinta se alimenta sola a medida que avanza y recicla lo que ya salió de pantalla.
 */
export function Ticker({ mensajes, pausa, alto }: { mensajes: MensajeTicker[]; pausa?: boolean; alto?: number }) {
  const via = useRef<HTMLDivElement>(null);
  const cinta = useRef<HTMLDivElement>(null);
  const marca = useRef<HTMLDivElement>(null);
  const datos = useRef({ mensajes, pausa, vistos: new Set<number>(), urgentes: [] as MensajeTicker[], indice: 0 });
  datos.current.pausa = pausa;

  useEffect(() => {
    const d = datos.current;
    const primera = d.vistos.size === 0;
    const nuevos = mensajes.filter((m) => !d.vistos.has(m.id));
    for (const m of mensajes) d.vistos.add(m.id);
    d.mensajes = mensajes;
    if (!primera && nuevos.length) {
      // Lo nuevo salta la fila (los manuales primero) y el rótulo avisa.
      d.urgentes.push(...nuevos.sort((a, b) => Number(b.tipo === 'manual') - Number(a.tipo === 'manual')));
      const m = marca.current;
      if (m) {
        m.dataset.flash = '0';
        void m.offsetWidth;
        m.dataset.flash = '1';
      }
    }
  }, [mensajes]);

  useEffect(() => {
    const v = via.current!;
    const c = cinta.current!;
    const d = datos.current;
    let x = v.clientWidth * 0.6;
    let ultimo = performance.now();
    let raf = 0;
    let ultimoId = -999;
    const siguiente = (): { m: MensajeTicker; nuevo: boolean } => {
      const u = d.urgentes.shift();
      if (u) {
        ultimoId = u.id;
        return { m: u, nuevo: true };
      }
      const lista = d.mensajes.length ? d.mensajes : [RELLENO];
      let m = lista[d.indice++ % lista.length];
      if (m.id === ultimoId && lista.length > 1) m = lista[d.indice++ % lista.length];
      ultimoId = m.id;
      return { m, nuevo: false };
    };
    const paso = (t: number) => {
      const dt = Math.min(0.05, (t - ultimo) / 1000);
      ultimo = t;
      if (!d.pausa) x -= v.clientHeight * 2.1 * dt; // velocidad proporcional al alto de la barra
      // Quitar lo que ya salió por la izquierda.
      let primero = c.firstElementChild as HTMLElement | null;
      while (primero && primero.offsetWidth + x <= 0) {
        x += primero.offsetWidth;
        primero.remove();
        primero = c.firstElementChild as HTMLElement | null;
      }
      // Alimentar por la derecha hasta cubrir la pantalla.
      let guardia = 0;
      while (c.scrollWidth + x < v.clientWidth + 160 && guardia++ < 12) {
        const { m, nuevo } = siguiente();
        const el = document.createElement('span');
        el.className = 'ticker-msg';
        el.dataset.tipo = m.tipo;
        if (nuevo) el.dataset.nuevo = '1';
        el.textContent = m.texto;
        c.appendChild(el);
      }
      c.style.transform = `translate3d(${x}px,0,0)`;
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="ticker" style={alto ? ({ '--tk-h': `${alto}px` } as CSSProperties) : undefined}>
      <div className="ticker-marca" ref={marca}>
        <b>Último momento</b>
      </div>
      <div className="ticker-via" ref={via}>
        <div className="ticker-cinta" ref={cinta} style={{ animation: 'none' }} />
      </div>
    </div>
  );
}

// ───────────── Cancha con la formación ─────────────

/** Posición de cada hueco de la formación 4-3-3 sobre la cancha (en % del ancho y alto). */
export const HUECOS_XY: [number, number][] = [
  [50, 89], // POR
  [85, 68], // LD
  [62, 73], // DFC
  [38, 73], // DFC
  [15, 68], // LI
  [50, 53], // MCD
  [70, 41], // MC
  [30, 37], // MCO
  [83, 17], // ED
  [50, 12], // DC
  [17, 17], // EI
];

export function Cancha({ equipo, color, huecoActivo, className = '' }: { equipo: (FichaEquipo | null)[]; color: string; huecoActivo?: number; className?: string }) {
  return (
    <div className={`cancha ${className}`} style={{ '--c': color } as CSSProperties}>
      <svg className="cancha-lineas" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden>
        <rect x="2" y="2" width="96" height="126" rx="1.5" />
        <line x1="2" y1="65" x2="98" y2="65" />
        <circle cx="50" cy="65" r="12" />
        <rect x="26" y="106" width="48" height="22" />
        <rect x="38" y="119" width="24" height="9" />
        <rect x="26" y="2" width="48" height="22" />
        <rect x="38" y="2" width="24" height="9" />
      </svg>
      {FORMACION.map((pos: Pos, i) => {
        const f = equipo[i];
        const [x, y] = HUECOS_XY[i];
        return (
          <div
            key={i}
            className="cancha-hueco"
            data-hueco={i}
            data-lleno={f ? '1' : '0'}
            data-activo={huecoActivo === i ? '1' : undefined}
            data-rareza={f?.rareza}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="cancha-foto">{f ? <img src={f.img} alt="" /> : <b>{pos}</b>}</span>
            {f && (
              <span className="cancha-nombre">
                {f.apellido || f.nombre}
                <i className="num">${f.pagado}M</i>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const cuentaEquipo = (j: JugadorSala) => j.equipo.filter(Boolean).length;
