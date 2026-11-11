// Partículas en canvas 2D: chispas, confeti y ondas expansivas. El bucle solo corre mientras hay algo vivo.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { reducirMovimiento } from '../lib/util';

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  max: number;
  tam: number;
  color: string;
  giro: number;
  vg: number;
  tipo: 'chispa' | 'papel' | 'onda';
  g: number;
}

export interface FxApi {
  /** Estallido de chispas desde un punto (coordenadas relativas al lienzo, 0–1). */
  estallar(x: number, y: number, colores: string[], cantidad?: number, fuerza?: number): void;
  /** Lluvia de confeti desde arriba. */
  confeti(colores: string[], cantidad?: number): void;
  /** Onda expansiva. */
  onda(x: number, y: number, color: string, tam?: number): void;
}

const lite = () => document.documentElement.dataset.lite === '1';

export const Fx = forwardRef<FxApi, { className?: string }>(function Fx({ className = '' }, ref) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const ps = useRef<Particula[]>([]);
  const raf = useRef(0);
  const ultimo = useRef(0);

  const bucle = (t: number) => {
    const c = lienzo.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dt = Math.min(0.04, (t - ultimo.current) / 1000 || 0.016);
    ultimo.current = t;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    const vivas: Particula[] = [];
    for (const p of ps.current) {
      p.vida -= dt;
      if (p.vida <= 0) continue;
      const k = p.vida / p.max;
      if (p.tipo === 'onda') {
        const r = p.tam * (1 - k * k * k);
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.tam * 0.06 * k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        p.vy += p.g * dt;
        p.vx *= 1 - 1.4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.giro += p.vg * dt;
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        if (p.tipo === 'papel') ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2 * Math.abs(Math.cos(p.giro * 1.7)) + 1);
        else ctx.fillRect(-p.tam / 2, -p.tam / 2, p.tam, p.tam);
        ctx.restore();
      }
      vivas.push(p);
    }
    ctx.globalAlpha = 1;
    ps.current = vivas;
    if (vivas.length) raf.current = requestAnimationFrame(bucle);
    else raf.current = 0;
  };

  const arrancar = () => {
    if (!raf.current) {
      ultimo.current = performance.now();
      raf.current = requestAnimationFrame(bucle);
    }
  };

  useEffect(() => {
    const c = lienzo.current!;
    const ajustar = () => {
      const dpr = Math.min(lite() ? 1 : 1.5, devicePixelRatio || 1);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(c);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    estallar(x, y, colores, cantidad = 60, fuerza = 1) {
      const c = lienzo.current;
      if (!c || reducirMovimiento()) return;
      const n = lite() ? Math.round(cantidad / 3) : cantidad;
      const u = c.width / 100;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (20 + Math.random() * 70) * u * fuerza;
        const vida = 0.5 + Math.random() * 0.8;
        ps.current.push({
          x: x * c.width, y: y * c.height, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14 * u,
          vida, max: vida, tam: (0.35 + Math.random() * 0.9) * u, color: colores[i % colores.length],
          giro: Math.random() * 6, vg: (Math.random() - 0.5) * 14, tipo: 'chispa', g: 90 * u,
        });
      }
      arrancar();
    },
    confeti(colores, cantidad = 140) {
      const c = lienzo.current;
      if (!c || reducirMovimiento()) return;
      const n = lite() ? Math.round(cantidad / 3) : cantidad;
      const u = c.width / 100;
      for (let i = 0; i < n; i++) {
        const vida = 2 + Math.random() * 2;
        ps.current.push({
          x: Math.random() * c.width, y: -Math.random() * c.height * 0.4, vx: (Math.random() - 0.5) * 30 * u, vy: (10 + Math.random() * 30) * u,
          vida, max: vida, tam: (0.9 + Math.random() * 1.1) * u, color: colores[i % colores.length],
          giro: Math.random() * 6, vg: (Math.random() - 0.5) * 10, tipo: 'papel', g: 16 * u,
        });
      }
      arrancar();
    },
    onda(x, y, color, tam = 0.6) {
      const c = lienzo.current;
      if (!c || reducirMovimiento()) return;
      ps.current.push({ x: x * c.width, y: y * c.height, vx: 0, vy: 0, vida: 0.8, max: 0.8, tam: tam * c.width, color, giro: 0, vg: 0, tipo: 'onda', g: 0 });
      arrancar();
    },
  }));

  return <canvas ref={lienzo} className={`fx-lienzo ${className}`} />;
});
