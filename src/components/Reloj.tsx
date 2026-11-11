// Contador sincronizado con el servidor: anillo vivo, golpe de recarga con cada oferta y cuenta final.
import { useEffect, useRef } from 'react';
import type { Sala } from '../lib/sala';
import { sonar } from '../lib/sonido';

export interface Tic {
  /** 0 normal · 1 últimos 5 s · 2 últimos 3 s */
  tension: 0 | 1 | 2;
  /** 0 nada · 1 "a la una" · 2 "a las dos" · 3 "a las tres" */
  cuenta: 0 | 1 | 2 | 3;
}

interface Props {
  sala: Sala;
  /** El contador solo corre en las fases de puja. */
  activo: boolean;
  vence: number;
  duracion: number;
  pausaResto?: number;
  alTic?: (t: Tic) => void;
  sonido?: boolean;
  className?: string;
}

const R = 46;
const LARGO = 2 * Math.PI * R;

export function Reloj({ sala, activo, vence, duracion, pausaResto, alTic, sonido, className = '' }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const arco = useRef<SVGCircleElement>(null);
  const texto = useRef<HTMLSpanElement>(null);
  const p = useRef({ activo, vence, duracion, pausaResto, alTic, sonido });
  const venceAntes = useRef(vence);
  p.current = { activo, vence, duracion, pausaResto, alTic, sonido };

  // Golpe de recarga: el vencimiento se alejó (alguien ofertó).
  useEffect(() => {
    if (activo && vence > venceAntes.current + 500 && raiz.current) {
      raiz.current.dataset.golpe = '0';
      void raiz.current.offsetWidth;
      raiz.current.dataset.golpe = '1';
    }
    venceAntes.current = vence;
  }, [vence, activo]);

  useEffect(() => {
    let raf = 0;
    let seg = -1;
    let activoAntes = false;
    let tension = -1;
    let cuenta = -1;
    const paso = () => {
      const c = p.current;
      const resto = !c.activo ? c.duracion : c.pausaResto != null ? c.pausaResto : Math.max(0, c.vence - sala.ahora());
      const k = c.duracion > 0 ? Math.min(1, resto / c.duracion) : 0;
      arco.current?.setAttribute('stroke-dashoffset', String(LARGO * (1 - k)));
      const s = Math.ceil(resto / 1000);
      if (s !== seg || c.activo !== activoAntes) {
        seg = s;
        activoAntes = c.activo;
        if (texto.current) texto.current.textContent = String(s);
        if (c.activo && c.pausaResto == null && raiz.current) {
          // Pulso por segundo; crece cuando queda poco.
          raiz.current.dataset.pulso = '0';
          void raiz.current.offsetWidth;
          raiz.current.dataset.pulso = s <= 3 ? '3' : s <= 5 ? '2' : '1';
          if (c.sonido && s > 0 && s <= 5) sonar.tic(s <= 3);
        }
      }
      const t: 0 | 1 | 2 = !c.activo || c.pausaResto != null ? 0 : resto <= 3000 ? 2 : resto <= 5000 ? 1 : 0;
      const n: 0 | 1 | 2 | 3 = !c.activo || c.pausaResto != null || resto > 3000 || resto <= 0 ? 0 : resto > 2000 ? 1 : resto > 1000 ? 2 : 3;
      if (t !== tension || n !== cuenta) {
        if (n !== cuenta && n > 0 && c.sonido) sonar.cuenta(n);
        tension = t;
        cuenta = n;
        if (raiz.current) raiz.current.dataset.tension = String(t);
        c.alTic?.({ tension: t, cuenta: n });
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [sala]);

  return (
    <div ref={raiz} className={`reloj ${className}`} data-activo={activo ? '1' : '0'} data-pausa={pausaResto != null ? '1' : undefined}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="reloj-pista" cx="50" cy="50" r={R} />
        <circle ref={arco} className="reloj-arco" cx="50" cy="50" r={R} strokeDasharray={LARGO} strokeDashoffset={0} transform="rotate(-90 50 50)" />
      </svg>
      <span ref={texto} className="reloj-num num" />
    </div>
  );
}
