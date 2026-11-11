// Enrutador mínimo con "telón": ninguna pantalla cambia con un corte seco.
import { useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { reducirMovimiento } from './util';

const oyentes = new Set<() => void>();
let ruta = location.pathname;

function avisar() {
  ruta = location.pathname;
  oyentes.forEach((f) => f());
}
window.addEventListener('popstate', avisar);

export function useRuta(): string {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => ruta,
  );
}

export function ir(destino: string, reemplazar = false) {
  if (destino === location.pathname) return;
  if (reemplazar) history.replaceState(null, '', destino);
  else history.pushState(null, '', destino);
  avisar();
}

let enCurso = false;

export interface OpcionesTelon {
  /** Punto de la pantalla desde donde nace el telón (por defecto, el centro). */
  origen?: { x: number; y: number };
  /** Texto grande que se ve mientras el telón está cerrado. */
  cartel?: string;
  reemplazar?: boolean;
}

/**
 * Cambia de pantalla con un telón circular: tres discos se expanden desde el origen (cubren),
 * se cambia la ruta por detrás, y se retiran hacia el mismo punto (descubren).
 */
export function irConTelon(destino: string, op: OpcionesTelon = {}): Promise<void> {
  if (enCurso || destino === location.pathname) {
    ir(destino, op.reemplazar);
    return Promise.resolve();
  }
  if (reducirMovimiento()) {
    const velo = document.createElement('div');
    velo.className = 'telon-simple';
    document.body.appendChild(velo);
    return new Promise((ok) => {
      gsap.fromTo(velo, { opacity: 0 }, {
        opacity: 1,
        duration: 0.18,
        onComplete: () => {
          ir(destino, op.reemplazar);
          gsap.to(velo, { opacity: 0, duration: 0.22, delay: 0.05, onComplete: () => (velo.remove(), ok()) });
        },
      });
    });
  }
  enCurso = true;
  const x = op.origen?.x ?? innerWidth / 2;
  const y = op.origen?.y ?? innerHeight / 2;
  const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 40;
  const telon = document.createElement('div');
  telon.className = 'telon';
  telon.innerHTML = `<i class="telon-disco d1"></i><i class="telon-disco d2"></i><i class="telon-disco d3"></i>${op.cartel ? `<b class="telon-cartel">${op.cartel}</b>` : ''}`;
  document.body.appendChild(telon);
  const discos = telon.querySelectorAll<HTMLElement>('.telon-disco');
  const cartel = telon.querySelector<HTMLElement>('.telon-cartel');
  gsap.set(discos, { left: x, top: y, width: radio * 2, height: radio * 2, xPercent: -50, yPercent: -50, scale: 0.001 });

  return new Promise((ok) => {
    const tl = gsap.timeline({
      onComplete: () => {
        telon.remove();
        enCurso = false;
        ok();
      },
    });
    tl.to(discos, { scale: 1, duration: 0.62, ease: 'expo.inOut', stagger: 0.07 });
    if (cartel) tl.fromTo(cartel, { opacity: 0, scale: 1.25, letterSpacing: '0.3em' }, { opacity: 1, scale: 1, letterSpacing: '0.04em', duration: 0.4, ease: 'expo.out' }, 0.3);
    tl.add(() => ir(destino, op.reemplazar), '>-0.02');
    tl.to({}, { duration: cartel ? 0.5 : 0.12 });
    if (cartel) tl.to(cartel, { opacity: 0, scale: 0.9, duration: 0.25, ease: 'power2.in' }, '>-0.2');
    tl.to([...discos].reverse(), { scale: 0.001, duration: 0.6, ease: 'expo.inOut', stagger: 0.07 });
  });
}
