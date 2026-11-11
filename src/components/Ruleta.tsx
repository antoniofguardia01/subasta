// Ruleta: cuando nadie oferta y no sobran cartas, el azar elige quién se la lleva.
import { CSSProperties, useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import type { EstadoPublico } from '../../shared/types';
import type { Sala } from '../lib/sala';
import { sonar } from '../lib/sonido';
import { reducirMovimiento, vibrar } from '../lib/util';
import { Avatar } from './comunes';

export function Ruleta({ sala, s, compacta }: { sala: Sala; s: EstadoPublico; compacta?: boolean }) {
  const raiz = useRef<HTMLDivElement>(null);
  const r = s.carta?.ruleta;
  const candidatos = useMemo(() => (r ? r.candidatos.map((id) => s.jugadores.find((j) => j.id === id)!).filter(Boolean) : []), [r, s.jugadores]);
  const ganador = s.jugadores.find((j) => j.id === r?.ganador);

  // La tira repite a los candidatos; el ganador queda en una casilla lejana para que gire un buen rato.
  const { tira, meta } = useMemo(() => {
    const n = Math.max(1, candidatos.length);
    const vueltas = Math.max(5, Math.ceil(30 / n));
    const tira = Array.from({ length: n * (vueltas + 2) }, (_, i) => candidatos[i % n]);
    const idx = candidatos.findIndex((j) => j?.id === r?.ganador);
    return { tira, meta: n * vueltas + Math.max(0, idx) };
  }, [candidatos, r?.ganador]);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || !r || !s.carta) return;
    const q = gsap.utils.selector(el);
    const cinta = q('.rul-cinta')[0] as HTMLElement;
    const casilla = (cinta.firstElementChild as HTMLElement).offsetWidth;
    const total = s.carta.duracion / 1000;
    const transcurrido = Math.max(0, (s.carta.duracion - (s.carta.vence - sala.ahora())) / 1000);
    const giro = Math.max(1.5, total - 1.9);
    let ultima = -1;
    const t = gsap.timeline();
    t.from(el, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0)
      .from(q('.rul-titulo'), { yPercent: -120, duration: 0.5, ease: 'expo.out' }, 0)
      .from(q('.rul-marco'), { scaleX: 0.6, opacity: 0, duration: 0.5, ease: 'expo.out' }, 0.08)
      .fromTo(
        cinta,
        { x: 0 },
        {
          x: -meta * casilla,
          duration: reducirMovimiento() ? 0.6 : giro,
          ease: 'power3.out',
          onUpdate() {
            const i = Math.round(-(gsap.getProperty(cinta, 'x') as number) / casilla);
            if (i !== ultima) {
              ultima = i;
              sonar.ruletaTic();
            }
          },
        },
        0.35,
      )
      .add(() => {
        sonar.alarma();
        vibrar([60, 40, 160]);
      })
      .to(q(`.rul-casilla[data-i="${meta}"]`), { scale: 1.28, duration: 0.4, ease: 'back.out(3)' })
      .fromTo(q('.rul-veredicto'), { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, '<');
    t.time(Math.min(transcurrido, t.duration()));
    return () => void t.kill();
  }, [r?.ganador, s.carta?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  return (
    <div ref={raiz} className="ruleta" data-compacta={compacta ? '1' : undefined}>
      <div className="rul-titulo">
        <b>La ruleta decide</b>
        <span>{r.liquidacion ? 'A nadie le alcanza: se la lleva por lo que tenga' : 'Nadie ofertó. Alguien paga el precio mínimo.'}</span>
      </div>
      <div className="rul-marco">
        <div className="rul-cinta">
          {tira.map((j, i) => (
            <div className="rul-casilla" data-i={i} key={i} style={{ '--c': j.color } as CSSProperties}>
              <Avatar src={j.avatar} color={j.color} />
              <span>{j.nombre}</span>
            </div>
          ))}
        </div>
        <i className="rul-aguja" />
      </div>
      <div className="rul-veredicto" style={{ '--c': ganador?.color } as CSSProperties}>
        ¡Le tocó a <b>{ganador?.nombre}</b>!
      </div>
    </div>
  );
}
