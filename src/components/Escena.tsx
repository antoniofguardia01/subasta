// La escena de la carta: silueta + precio (misterio), martillazo y revelación.
// La silueta es la MISMA imagen que la foto a color, con un filtro que la vuelve blanca: no hay assets duplicados.
import { CSSProperties, RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { CartaActualVista, Desenlace, EstadoPublico, Fase, JugadorSala, Rareza } from '../../shared/types';
import { POS_NOMBRE } from '../../shared/types';
import type { Sala } from '../lib/sala';
import { esLite } from '../lib/rendimiento';
import { sonar } from '../lib/sonido';
import { reducirMovimiento, vibrar } from '../lib/util';
import { Avatar, Fondo, Numero } from './comunes';
import type { FxApi } from './Fx';
import type { Tic } from './Reloj';
import { IconoRareza } from './Iconos';

interface Props {
  sala: Sala;
  s: EstadoPublico;
  tic: Tic;
  fx: RefObject<FxApi | null>;
  compacta?: boolean;
  /** La ficha comprada "vuela" al equipo del comprador: el padre anima el vuelo. */
  alVolar?: (origen: DOMRect, img: string, compradorId: string) => void;
}

const SELLO: Record<Desenlace, string> = { vendido: '¡Vendido!', pasa: 'Pasa', salteada: 'Salteada', obligado: 'Obligado', ruleta: 'Le tocó' };
const CUENTA = ['', 'A la una…', 'A las dos…', '¡A las tres!'];
const CUENTA_SOLA = ['', '¿Nadie?', '¿Seguro?', 'Se va…'];
const GIGANTE: Record<Rareza, string> = { comun: 'FICHAJE', plata: 'PLATA', oro: 'ORO', prime: 'PRIME', leyenda: 'LEYENDA', troll: 'SORPRESA' };

type Q = (s: string) => Element[];

function reiniciar(q: Q) {
  gsap.set(q('.esc-figura'), { yPercent: 108, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  gsap.set(q('.esc-silueta'), { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 });
  gsap.set(q('.esc-luz'), { opacity: 0, yPercent: 0 });
  gsap.set(q('.esc-destello'), { opacity: 0 });
  gsap.set(q('.esc-fondo2'), { clipPath: 'circle(0% at 70% 62%)' });
  gsap.set(q('.esc-rayos'), { opacity: 0 });
  gsap.set(q('.esc-foco'), { opacity: 0 });
  gsap.set(q('.esc-gigante'), { opacity: 0 });
  gsap.set(q('.placa-precio'), { xPercent: -115 });
  gsap.set(q('.placa-nombre'), { xPercent: -115 });
  gsap.set(q('.esc-sello'), { opacity: 0 });
  gsap.set(q('.esc-martillo'), { opacity: 0 });
  gsap.set(q('.esc-venta'), { opacity: 0 });
  gsap.set(q('.esc-troll'), { opacity: 0 });
  gsap.set(q('.esc-capa'), { scaleX: 1, scaleY: 1, x: 0 });
}

function colocar(q: Q) {
  gsap.set(q('.esc-figura'), { yPercent: 0 });
  gsap.set(q('.placa-precio'), { xPercent: 0 });
}

export function Escena({ sala, s, tic, fx, compacta, alVolar }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const previa = useRef<{ uid: string | null; fase: Fase | null }>({ uid: null, fase: null });
  const [pulso, setPulso] = useState(0);
  const carta: CartaActualVista | null = s.carta;
  const fase = s.fase;
  const rev = carta?.revelada;
  const jug = (id?: string | null): JugadorSala | undefined => s.jugadores.find((j) => j.id === id);
  const lider = jug(carta?.liderId);
  const comprador = jug(carta?.compradorId);
  const salteador = jug(carta?.salteadaPor);

  // Unidad de medida propia: 1% del ancho de la escena (sirve igual en TV 4K y en un celular).
  useLayoutEffect(() => {
    const el = raiz.current!;
    const medir = () => {
      el.style.setProperty('--u', `${el.clientWidth / 100}px`);
      el.style.setProperty('--v', `${el.clientHeight / 100}px`);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cada oferta: golpe en la placa y chispa del color del que ofertó.
  useEffect(
    () =>
      sala.alEvento((ev, est) => {
        if (ev.e !== 'oferta') return;
        setPulso((n) => n + 1);
        const el = raiz.current;
        if (!el) return;
        const placa = el.querySelector('.esc-placa');
        if (placa && !reducirMovimiento()) gsap.fromTo(placa, { scale: 1.07 }, { scale: 1, duration: 0.32, ease: 'back.out(3)', overwrite: 'auto' });
        const color = est.jugadores.find((j) => j.id === ev.pid)?.color ?? '#fff';
        fx.current?.estallar(compacta ? 0.3 : 0.24, 0.5, [color, '#ffffff'], 16, 0.5);
      }),
    [sala, fx, compacta],
  );

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const q = gsap.utils.selector(el) as unknown as Q;
    const ant = previa.current;
    previa.current = { uid: carta?.uid ?? null, fase };
    if (!carta) return;
    const nueva = ant.uid !== carta.uid;
    const rm = reducirMovimiento();
    const total = carta.duracion / 1000;
    const transcurrido = Math.max(0, Math.min(total, (carta.duracion - (carta.vence - sala.ahora())) / 1000));
    const figura = q('.esc-figura');

    if (nueva) {
      tl.current?.kill();
      reiniciar(q);
      if (fase === 'presenta') {
        // ── Entrada: la silueta sube desde abajo y la placa entra por la izquierda ──
        const t = gsap.timeline();
        t.add(() => sonar.entra(), 0.1)
          .to(figura, { yPercent: 0, duration: rm ? 0.3 : 0.95, ease: 'expo.out' }, 0.12)
          .to(q('.placa-precio'), { xPercent: 0, duration: rm ? 0.3 : 0.7, ease: 'expo.out' }, 0.38)
          .from(q('.pp-rotulo'), { opacity: 0, x: -30, duration: 0.4, ease: 'expo.out' }, 0.62)
          .from(q('.pp-monto'), { opacity: 0, scale: rm ? 1 : 0.6, transformOrigin: '0% 60%', duration: 0.55, ease: 'back.out(1.8)' }, 0.74)
          .from(q('.pp-pos'), { opacity: 0, y: 14, duration: 0.4, ease: 'expo.out' }, 1.0);
        t.time(Math.min(transcurrido, t.duration()));
        tl.current = t;
      } else colocar(q);
    }

    const impacto = (colores: string[], fuerte: boolean, conSonido = true) => {
      fx.current?.onda(compacta ? 0.62 : 0.7, 0.6, colores[0], fuerte ? 0.75 : 0.4);
      fx.current?.estallar(compacta ? 0.62 : 0.7, 0.62, colores, fuerte ? 90 : 30, fuerte ? 1 : 0.6);
      if (fuerte) {
        if (conSonido) {
          sonar.martillo();
          vibrar([40, 30, 90]);
        }
      } else sonar.golpeSuave();
    };

    if (fase === 'martillo' && (nueva || ant.fase !== 'martillo')) {
      tl.current?.kill();
      colocar(q);
      const d = carta.desenlace ?? 'vendido';
      const venta = d === 'vendido' || d === 'obligado' || d === 'ruleta';
      const color = comprador?.color ?? '#ffffff';
      const t = gsap.timeline();
      const capa = q('.esc-capa');
      const video = q('.esc-martillo-video')[0] as HTMLVideoElement | undefined;
      if (venta && video && !rm) {
        // ── Martillazo en video (solo TV): corte rápido con el martillo real; al desvanecerse cae el sello ──
        t.add(() => {
          video.currentTime = 0;
          void video.play().catch(() => {});
        }, 0)
          .fromTo(video, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: 'power1.out' }, 0)
          .add(() => {
            sonar.martillo();
            vibrar([40, 30, 90]);
          }, 0.45)
          .to(video, { opacity: 0, duration: 0.22, ease: 'power2.in' }, 0.95)
          .add(() => impacto([color, '#ffffff', '#ffe27a'], true, false), 0.95)
          .to(capa, { scaleY: 0.94, scaleX: 1.03, duration: 0.07, ease: 'power2.out' }, 0.95)
          .to(capa, { scaleY: 1, scaleX: 1, duration: 0.7, ease: 'elastic.out(1, 0.35)' }, 1.02)
          .fromTo(q('.esc-destello'), { opacity: 0.85 }, { opacity: 0, duration: 0.4, ease: 'power2.out' }, 0.95)
          .fromTo(q('.esc-sello'), { opacity: 0, scale: 2.6, rotation: -20 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.34, ease: 'back.out(2.2)' }, 0.95)
          .fromTo(q('.esc-venta'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, 1.0);
        if (d !== 'vendido') t.fromTo(capa, { x: -14 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.2)' }, 1.0);
      } else if (venta) {
        // ── Martillazo: baja en 160 ms, aplasta la escena, destello, onda y sello ──
        t.set(q('.esc-martillo'), { opacity: 1, rotation: 14, transformOrigin: '50% 94%' })
          .to(q('.esc-martillo'), { rotation: -88, duration: rm ? 0.01 : 0.16, ease: 'power4.in' })
          .add(() => impacto([color, '#ffffff', '#ffe27a'], true))
          .to(capa, { scaleY: rm ? 1 : 0.94, scaleX: rm ? 1 : 1.03, duration: 0.07, ease: 'power2.out' })
          .to(capa, { scaleY: 1, scaleX: 1, duration: 0.7, ease: 'elastic.out(1, 0.35)' })
          .fromTo(q('.esc-destello'), { opacity: 0.85 }, { opacity: 0, duration: 0.4, ease: 'power2.out' }, '<-0.07')
          .fromTo(q('.esc-sello'), { opacity: 0, scale: rm ? 1 : 2.6, rotation: -20 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.34, ease: 'back.out(2.2)' }, '<')
          .to(q('.esc-martillo'), { rotation: -52, opacity: 0, duration: 0.45, ease: 'power2.out' }, '<0.3')
          .fromTo(q('.esc-venta'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, '<0.05');
        if (d !== 'vendido' && !rm) t.fromTo(capa, { x: -14 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.2)' }, 0.18);
      } else {
        // ── Pasa / salteada: sin martillo; la silueta se apaga y cae el sello ──
        t.add(() => {
          impacto(['#ffffff'], false);
          sonar.uuuh();
        }, 0.05)
          .to(figura, { opacity: 0.45, yPercent: 4, rotation: d === 'salteada' ? 5 : 0, duration: 0.5, ease: 'power2.out' }, 0)
          .fromTo(q('.esc-sello'), { opacity: 0, scale: rm ? 1 : 1.8, rotation: 8 }, { opacity: 1, scale: 1, rotation: -6, duration: 0.4, ease: 'back.out(1.8)' }, 0.05)
          .fromTo(q('.esc-venta'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, 0.3);
      }
      t.time(Math.min(transcurrido, t.duration()));
      tl.current = t;
    }

    if (fase === 'revela' && rev && (nueva || ant.fase !== 'revela')) {
      tl.current?.kill();
      colocar(q);
      const nivel: 0 | 1 | 2 = rev.rareza === 'leyenda' ? 2 : rev.rareza === 'prime' ? 1 : 0;
      const troll = rev.tipo === 'troll';
      const vendida = !!carta.compradorId;
      const u = el.clientWidth / 100;
      const alto = (figura[0] as HTMLElement).offsetHeight;
      const t = gsap.timeline();
      let F = 0.25; // momento del destello

      t.to(q('.esc-sello'), { opacity: 0, scale: 0.85, duration: 0.25, ease: 'power2.in' }, 0);
      t.to(figura, { opacity: 1, yPercent: 0, rotation: 0, duration: 0.3, ease: 'power2.out' }, 0);
      if (vendida && !rm) {
        // Anticipación: la silueta "respira" antes de encenderse.
        t.to(figura, { scale: 0.96, duration: 0.22, ease: 'power2.out' }, 0.05)
          .to(figura, { scale: 1.03, duration: 0.16, ease: 'power2.in' })
          .to(figura, { scale: 0.97, duration: 0.16, ease: 'power2.out' })
          .to(figura, { scale: 1.05, duration: 0.16, ease: 'power2.in' });
        F = 0.82;
        // El escenario se oscurece y queda solo un foco sobre la silueta: redoble.
        t.to(q('.esc-foco'), { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.05);
        if (troll) {
          // Los trolls tiemblan: algo anda mal…
          t.to(figura, { x: u * 1.4, duration: 0.05, repeat: 9, yoyo: true, ease: 'sine.inOut' }, F).set(figura, { x: 0 });
          F += 0.55;
        } else if (nivel > 0) {
          // Cartas grandes: cámara lenta, rayos y zoom antes del destello.
          const pausa = nivel === 2 ? 1.25 : 0.8;
          t.to(q('.esc-rayos'), { opacity: 1, duration: 0.5, ease: 'power2.out' }, F - 0.2).to(figura, { scale: 1.12, duration: pausa, ease: 'power1.in' }, F);
          F += pausa;
        }
      }

      t.add(() => {
        if (troll) sonar.troll();
        else sonar.revela(vendida ? nivel : 0);
        if (vendida && nivel > 0) sonar.ovacion();
        const p = getComputedStyle(el.querySelector('.esc-fondo2')!);
        const colores = [p.getPropertyValue('--f1').trim() || '#fff', p.getPropertyValue('--fa').trim() || '#fff', '#ffffff'];
        fx.current?.onda(compacta ? 0.62 : 0.7, 0.6, colores[0], 0.9);
        if (vendida) fx.current?.estallar(compacta ? 0.62 : 0.7, 0.55, colores, nivel === 2 ? 160 : nivel === 1 ? 110 : 50, 1 + nivel * 0.3);
        if (vendida && nivel > 0) fx.current?.confeti(colores, nivel === 2 ? 180 : 90);
        if (vendida) vibrar(nivel ? [30, 40, 30, 40, 120] : 50);
      }, F);
      t.fromTo(q('.esc-destello'), { opacity: 0 }, { opacity: 1, duration: 0.1, ease: 'power2.in' }, F)
        .to(q('.esc-destello'), { opacity: 0, duration: nivel ? 1.0 : 0.6, ease: 'power2.out' })
        // El fondo cambia de paleta con un barrido circular que nace en el pecho del jugador.
        .to(q('.esc-fondo2'), { clipPath: 'circle(150% at 70% 62%)', duration: rm ? 0.3 : 0.85, ease: 'expo.out' }, F + 0.02)
        // El color aparece de abajo hacia arriba, detrás de una línea de luz.
        .to(q('.esc-silueta'), { clipPath: 'inset(0% 0% 100% 0%)', duration: rm ? 0.2 : 0.55, ease: 'power2.inOut' }, F + 0.05)
        .fromTo(q('.esc-luz'), { opacity: 1, y: 0 }, { y: -alto, duration: 0.55, ease: 'power2.inOut' }, F + 0.05)
        .to(q('.esc-luz'), { opacity: 0, duration: 0.15 }, F + 0.55)
        .to(q('.placa-precio'), { xPercent: -115, duration: 0.3, ease: 'power2.in' }, F + 0.04)
        .fromTo(q('.placa-nombre'), { xPercent: -115 }, { xPercent: 0, duration: 0.6, ease: 'expo.out' }, F + 0.32)
        .from(q('.pn-nombre'), { yPercent: 70, opacity: 0, duration: 0.5, ease: 'expo.out' }, F + 0.44)
        // El apellido cae letra por letra, como un marcador que se arma.
        .from(q('.pn-l'), { yPercent: -130, rotationX: 80, opacity: 0, duration: 0.55, ease: 'back.out(2.2)', stagger: 0.035 }, F + 0.5)
        .from(q('.pn-etiqueta'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.45, ease: 'expo.out' }, F + 0.8)
        // El foco se apaga con el destello, los rayos giran (más fuertes cuanto más rara la carta) y la palabra gigante cruza detrás.
        .to(q('.esc-foco'), { opacity: 0, duration: 0.5, ease: 'power2.out' }, F)
        .to(q('.esc-rayos'), { opacity: vendida ? (troll ? 0.5 : [0.45, 0.85, 1][nivel]) : 0.25, duration: 0.6, ease: 'power2.out' }, F + 0.05)
        .fromTo(q('.esc-gigante'), { opacity: 0, xPercent: 25 }, { opacity: 1, xPercent: -25, duration: Math.max(4, total - F - 1), ease: 'none' }, F + 0.1)
        // Golpe de cámara: todo se acerca y vuelve.
        .fromTo(q('.esc-capa'), { scale: 1.07 }, { scale: 1, duration: 0.9, ease: 'expo.out', immediateRender: false }, F);
      // El puntaje cuenta desde cero.
      const nota = el.querySelector<HTMLElement>('.pn-etiqueta b');
      if (nota && !rm) {
        const o = { v: 0 };
        t.to(o, { v: rev.rating, duration: 0.9, ease: 'power2.out', onUpdate: () => (nota.textContent = String(Math.round(o.v))) }, F + 0.85);
      }
      // Mientras se lee, el jugador respira con un acercamiento muy lento.
      if (!rm) t.to(figura, { scale: 1.035, duration: Math.max(3, total - F - 2.5), ease: 'sine.inOut' }, F + 1.2);
      if (!rm) {
        if (troll) {
          t.fromTo(figura, { rotation: -11, scale: 1.12 }, { rotation: 0, scale: 1, duration: 1.1, ease: 'elastic.out(1.1, 0.3)' }, F + 0.08)
            .fromTo(q('.esc-troll'), { opacity: 0, scale: 3.2, rotation: 28 }, { opacity: 1, scale: 1, rotation: 11, duration: 0.42, ease: 'back.out(2.4)' }, F + 0.22);
        } else t.to(figura, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.5)' }, F + 0.1);
      } else if (troll) t.set(q('.esc-troll'), { opacity: 1, rotation: 11 }, F + 0.2);

      // ── Salida coreografiada, justo antes de que el servidor pase a la siguiente carta ──
      const X = Math.max(F + 1.4, total - 1.05);
      t.to(q('.placa-nombre'), { xPercent: -115, duration: 0.36, ease: 'power2.in' }, X)
        .to(q('.esc-venta'), { opacity: 0, y: 16, duration: 0.22, ease: 'power2.in' }, X)
        .to(q('.esc-troll'), { opacity: 0, scale: 0.7, duration: 0.22, ease: 'power2.in' }, X)
        .to(q('.esc-rayos'), { opacity: 0, duration: 0.3 }, X)
        .to(q('.esc-gigante'), { opacity: 0, duration: 0.3 }, X)
        .to(q('.esc-fondo2'), { clipPath: 'circle(0% at 70% 62%)', duration: 0.6, ease: 'expo.inOut' }, X + 0.22);
      if (vendida && alVolar && !rm)
        t.add(() => {
          const img = el.querySelector<HTMLImageElement>('.esc-color');
          if (!img) return;
          alVolar(img.getBoundingClientRect(), img.src, carta.compradorId!);
          gsap.set(figura, { opacity: 0 });
        }, X);
      else t.to(figura, { yPercent: 110, duration: 0.45, ease: 'power2.in' }, X);

      t.time(Math.min(transcurrido, t.duration()));
      tl.current = t;
    }
  }, [carta?.uid, fase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => void tl.current?.kill(), []);
  useEffect(() => {
    if (s.pausa) sonar.silbato(true);
  }, [s.pausa]);

  const enPuja = fase === 'puja' || fase === 'ultima';
  const vel = enPuja ? (tic.tension === 2 ? 3.2 : tic.tension === 1 ? 2 : 1.15) : fase === 'revela' ? 1.6 : 1;
  const textoCuenta = enPuja && tic.cuenta ? (carta?.liderId ? CUENTA : CUENTA_SOLA)[tic.cuenta] : '';
  const d = carta?.desenlace;

  return (
    <div
      ref={raiz}
      className="escena"
      data-compacta={compacta ? '1' : undefined}
      data-fase={fase}
      data-tension={enPuja ? tic.tension : 0}
      data-desenlace={d}
      data-rareza={rev?.rareza}
      style={{ '--lider': lider?.color ?? 'transparent', '--comprador': comprador?.color ?? salteador?.color ?? '#ffffff' } as CSSProperties}
    >
      <div className="esc-capa">
        <Fondo paleta="misterio" vel={vel} className="esc-fondo" />
        <div className="esc-fondo2">
          <Fondo paleta={rev?.rareza ?? 'misterio'} vel={1.4} />
        </div>
        <div className="esc-gigante" aria-hidden data-paleta={rev?.rareza}>
          <span>{rev ? (rev.tipo === 'troll' ? 'SORPRESA · SORPRESA' : `${GIGANTE[rev.rareza]} · ${GIGANTE[rev.rareza]}`) : ''}</span>
        </div>
        <div className="esc-rayos" aria-hidden>
          <i />
        </div>

        {carta && (
          <div className="esc-figura">
            <img
              className="esc-color"
              data-marco={rev?.marco ? '1' : undefined}
              data-ajuste={rev?.ajuste ? '1' : undefined}
              style={rev?.ajuste ? ({ '--ax': `${rev.ajuste[0]}%`, '--ay': `${rev.ajuste[1]}%`, '--as': rev.ajuste[2] } as CSSProperties) : undefined}
              src={rev?.img ?? carta.img}
              alt=""
              draggable={false}
            />
            <img className="esc-silueta" src={carta.img} alt="" draggable={false} />
            <i className="esc-luz" />
          </div>
        )}

        <div className="esc-foco" aria-hidden />
        <div className="esc-destello" />

        {carta && (
          <div className="esc-placa">
            <div className="placa-precio" data-lider={lider ? '1' : '0'}>
              <span className="pp-rotulo">Precio</span>
              <span className="pp-monto" key={`m${pulso}`}>
                <Numero valor={carta.precio} prefijo="$" sufijo="M" />
              </span>
              <span className="pp-pos">{POS_NOMBRE[carta.pos]}</span>
              <span className="pp-lider" data-on={lider && enPuja ? '1' : '0'}>
                {lider && (
                  <>
                    <Avatar src={lider.avatar} color={lider.color} />
                    <b>{lider.nombre}</b> va ganando
                  </>
                )}
              </span>
            </div>
            {rev && (
              <div className="placa-nombre" data-paleta={rev.rareza}>
                <div className="pn-cuerpo">
                  {rev.apellido && rev.nombre && (
                    <span className="pn-linea pn-nombre" style={{ '--k': Math.min(1, 12 / rev.nombre.length) } as CSSProperties}>
                      <span>{rev.nombre}</span>
                    </span>
                  )}
                  {/* Los nombres largos se achican en proporción para entrar siempre en la placa. */}
                  <span className="pn-linea pn-apellido" style={{ '--k': Math.min(1, 9.2 / (rev.apellido || rev.nombre).length) } as CSSProperties}>
                    <span>
                      {(rev.apellido || rev.nombre).split('').map((l, i) => (
                        <span className="pn-l" key={i}>
                          {l === ' ' ? '\u00a0' : l}
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
                <div className="pn-etiqueta">
                  <i><IconoRareza rareza={rev.rareza} /></i>
                  <span>{rev.etiqueta}</span>
                  {rev.tipo === 'jugador' && <b className="num">{rev.rating}</b>}
                </div>
              </div>
            )}
          </div>
        )}

        {carta && (
          <div className="esc-venta">
            {comprador ? (
              <>
                <Avatar src={comprador.avatar} color={comprador.color} />
                <span>
                  <b>{comprador.nombre}</b>
                  {d === 'obligado' ? ' no tenía opción' : d === 'ruleta' ? ' salió sorteado' : ' se lo lleva'}
                </span>
                <em className="num">${carta.pagado}M</em>
              </>
            ) : salteador ? (
              <>
                <Avatar src={salteador.avatar} color={salteador.color} />
                <span>
                  <b>{salteador.nombre}</b> la salteó
                </span>
              </>
            ) : (
              <span>Nadie la quiso</span>
            )}
          </div>
        )}

        <div className="esc-sello" aria-hidden>
          <span>{d ? SELLO[d] : ''}</span>
        </div>
        <div className="esc-troll" aria-hidden>
          <span>{carta?.compradorId ? '¡Caíste!' : '¡Se salvaron!'}</span>
        </div>
        <img className="esc-martillo" src="/media/martillo.webp" alt="" draggable={false} aria-hidden />
        {!compacta && !esLite() && <video className="esc-martillo-video" src="/media/martillo.mp4" muted playsInline preload="auto" aria-hidden />}
      </div>

      <div className="esc-aviso" data-on={fase === 'ultima' ? '1' : '0'}>
        <b>Última oportunidad</b>
        <span>¡Alguien se la lleva sí o sí!</span>
      </div>
      <div className="esc-cuenta" data-n={textoCuenta ? tic.cuenta : 0} key={`c${tic.cuenta}-${carta?.vence ?? 0}`}>
        {textoCuenta}
      </div>
      <div className="esc-pausa" data-on={s.pausa ? '1' : '0'} aria-hidden={!s.pausa}>
        <img className="esc-pausa-icono" src="/img/iconos/silbato.webp" alt="" />
        <b>Pausa</b>
        <span>El anfitrión detuvo la subasta</span>
      </div>
    </div>
  );
}
