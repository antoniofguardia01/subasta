// Íconos dibujados a mano en SVG (reemplazan a los glifos de texto, que cada TV dibuja distinto).
import type { Rareza } from '../../shared/types';

type P = { className?: string; size?: number | string };
const svg = (size: P['size'] = '1em', cls = '') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  className: `icono ${cls}`.trim(),
  'aria-hidden': true,
  focusable: false,
});

/** Insignia de rareza: pelota (común), medalla (plata), diamante (oro), doble diamante (prime), estrella (leyenda), máscara (sorpresa). */
export function IconoRareza({ rareza, className, size }: P & { rareza: Rareza }) {
  const p = svg(size, className);
  switch (rareza) {
    case 'comun':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M12 7.6l3.8 2.8-1.5 4.4H9.7L8.2 10.4z" fill="currentColor" />
        </svg>
      );
    case 'plata':
      return (
        <svg {...p}>
          <path d="M7 2h4l1 5-3 1zM17 2h-4l-1 5 3 1z" fill="currentColor" opacity=".7" />
          <circle cx="12" cy="15" r="7" fill="currentColor" />
          <circle cx="12" cy="15" r="4.2" fill="none" stroke="#0007" strokeWidth="1.6" />
        </svg>
      );
    case 'oro':
      return (
        <svg {...p}>
          <path d="M12 2l8 8-8 12-8-12z" fill="currentColor" />
          <path d="M4 10h16M12 2l-3.5 8L12 22l3.5-12z" fill="none" stroke="#0006" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case 'prime':
      return (
        <svg {...p}>
          <path d="M8 4l6 7-6 11-6-11z" fill="currentColor" opacity=".55" />
          <path d="M15 2l7 8-7 12-7-12z" fill="currentColor" />
          <path d="M8 10h14" stroke="#0006" strokeWidth="1.2" />
        </svg>
      );
    case 'leyenda':
      return <img className={`icono ${className ?? ''}`} src="/img/iconos/estrella.webp" alt="" style={{ width: size ?? '1em', height: size ?? '1em', objectFit: 'contain' }} />;
    default:
      return (
        <svg {...p}>
          <path d="M2.5 7c3-1.6 6-1.4 9.5.4C15.5 5.6 18.5 5.4 21.5 7c0 7-3 11.5-9.5 11.5S2.5 14 2.5 7z" fill="currentColor" />
          <path d="M6 10.5q2-1.6 4 0M14 10.5q2-1.6 4 0M8.5 14q3.5 2.6 7 0" fill="none" stroke="#000a" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
  }
}

export function IconoSonido({ on, className, size }: P & { on: boolean }) {
  return (
    <svg {...svg(size, className)}>
      <path d="M3 9.5h3.5L11.5 5v14l-5-4.5H3z" fill="currentColor" strokeLinejoin="round" />
      {on ? (
        <path d="M15 9a4 4 0 010 6M17.8 6.4a7.6 7.6 0 010 11.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function IconoMusica({ on, className, size }: P & { on: boolean }) {
  return (
    <svg {...svg(size, className)}>
      <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="6.5" cy="18" r="3" fill="currentColor" />
      <circle cx="16.5" cy="16" r="3" fill="currentColor" />
      {!on && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}

export function IconoLapiz({ className, size }: P) {
  return (
    <svg {...svg(size, className)}>
      <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5zM13.5 7l3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function IconoCerrar({ className, size }: P) {
  return (
    <svg {...svg(size, className)}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconoMenos({ className, size }: P) {
  return (
    <svg {...svg(size, className)}>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Pluma: modo liviano (menos efectos). */
export function IconoLiviano({ className, size }: P) {
  return (
    <svg {...svg(size, className)}>
      <path d="M20 3.5C11 4 6 9.5 5 19l2.2-2.4C9 16 13.5 15 16.5 11c-1.7.3-3 .2-4 0 2.4-.7 4.8-2 6.2-4.2C19.4 5.8 19.8 4.7 20 3.5z" fill="currentColor" />
      <path d="M5 19l-1.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
