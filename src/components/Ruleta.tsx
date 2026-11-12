// Ruleta: cuando nadie oferta y no sobran cartas, el azar elige quién se la lleva.
// Es una rueda circular: un gajo por participante (con su cara), una aguja roja arriba y un tic al pasar cada gajo.
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
  const n = Math.max(1, candidatos.length);
  const seg = 360 / n;
  const idxGanador = Math.max(0, candidatos.findIndex((j) => j?.id === r?.ganador));
  // Gajos de colores (un color por participante) con una raya fina entre uno y otro.
  const fondo = useMemo(() => {
    const colores = candidatos.map((j, i) => `${j.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
    return `repeating-conic-gradient(from -0.35deg, rgba(0,0,0,0.4) 0 0.7deg, transparent 0.7deg ${seg}deg), conic-gradient(${colores || '#444 0deg 360deg'})`;
  }, [candidatos, seg]);
  // Cuanto más gente, más chicas las caras para que entren en el gajo.
  const k = n <= 3 ? 0.2 : n <= 5 ? 0.16 : n <= 7 ? 0.13 : 0.105;

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || !r || !s.carta) return;
    const q = gsap.utils.selector(el);
    const disco = q('.rul-disco')[0] as HTMLElement;
    const aguja = q('.rul-aguja')[0] as HTMLElement;
    const total = s.carta.duracion / 1000;
    const transcurrido = Math.max(0, (s.carta.duracion - (s.carta.vence - sala.ahora())) / 1000);
    const giro = Math.max(1.5, total - 1.9);
    // El destino sale de datos fijos del sorteo (no de Math.random), así todos los aparatos frenan en el mismo punto.
    const jitter = ((((r.ganador.length * 7 + idxGanador * 13) % 10) / 10) - 0.5) * seg * 0.5;
    const destino = 360 * 6 - (idxGanador + 0.5) * seg + jitter;
    let ultimo = -1;
    const t = gsap.timeline();
    t.from(el, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0)
      .from(q('.rul-titulo'), { yPercent: -120, duration: 0.5, ease: 'expo.out' }, 0)
      .from(q('.rul-rueda'), { scale: 0.55, opacity: 0, rotation: -25, duration: 0.6, ease: 'back.out(1.5)' }, 0.08)
      .fromTo(
        disco,
        { rotation: 0 },
        {
          rotation: destino,
          duration: reducirMovimiento() ? 0.6 : giro,
          ease: 'power4.out',
          onUpdate() {
            const grados = gsap.getProperty(disco, 'rotation') as number;
            const bajoLaAguja = Math.floor(((((-grados) % 360) + 360) % 360) / seg);
            if (bajoLaAguja !== ultimo) {
              ultimo = bajoLaAguja;
              sonar.ruletaTic();
              gsap.fromTo(aguja, { rotation: -24 }, { rotation: 0, duration: 0.16, ease: 'power2.out', overwrite: true });
            }
          },
        },
        0.35,
      )
      .add(() => {
        sonar.alarma();
        vibrar([60, 40, 160]);
      })
      .to(q(`.rul-slot[data-i="${idxGanador}"] .rul-slot-in`), { scale: 1.3, duration: 0.4, ease: 'back.out(3)' })
      .to(q('.rul-slot'), { opacity: (i: number) => (i === idxGanador ? 1 : 0.4), duration: 0.4 }, '<')
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
      <div className="rul-rueda" style={{ '--k': k } as CSSProperties}>
        <div className="rul-disco" style={{ background: fondo }}>
          {candidatos.map((j, i) => (
            <div className="rul-slot" data-i={i} key={j.id} style={{ '--a': `${(i + 0.5) * seg}deg`, '--c': j.color } as CSSProperties}>
              <div className="rul-slot-in">
                <Avatar src={j.avatar} color={j.color} />
                <span>{j.nombre}</span>
              </div>
            </div>
          ))}
        </div>
        <i className="rul-eje" />
        <i className="rul-aguja" />
      </div>
      <div className="rul-veredicto" style={{ '--c': ganador?.color } as CSSProperties}>
        ¡Le tocó a <b>{ganador?.nombre}</b>!
      </div>
    </div>
  );
}
