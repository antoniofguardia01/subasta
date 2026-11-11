export const dinero = (n: number) => `$${Math.round(n)}M`;

export const reducirMovimiento = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function claveDispositivo(): string {
  try {
    let c = localStorage.getItem('remate.clave');
    if (!c) {
      c = crypto.randomUUID() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem('remate.clave', c);
    }
    return c;
  } catch {
    return 'tmp-' + Math.random().toString(36).slice(2);
  }
}

export function guardar(k: string, v: unknown) {
  try {
    localStorage.setItem('remate.' + k, JSON.stringify(v));
  } catch {
    /* almacenamiento bloqueado */
  }
}

export function leer<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem('remate.' + k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}

export function vibrar(patron: number | number[]) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* sin háptica */
  }
}

const UA_TV = ['SmartTV', 'Smart-TV', 'Tizen', 'Web0S', 'WebOS', 'BRAVIA', 'CrKey', 'HbbTV', 'NetCast', 'AppleTV', 'GoogleTV', 'Android TV', 'Roku', 'VIDAA', 'AFTM', 'AFTT', 'AFTS'];

/** ¿Parece una tele? Sin táctil y con navegador de TV (o ya se usó como TV antes). */
export function pareceTV(): boolean {
  const ua = navigator.userAgent;
  const sinTactil = navigator.maxTouchPoints === 0;
  const tele = UA_TV.some((m) => ua.includes(m));
  return sinTactil && (tele || leer('tv.modo', false));
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Navegación con control remoto: las flechas mueven el foco entre los botones visibles del contenedor.
 * Devuelve la función que quita el oyente.
 */
export function usarFlechas(selector: string): () => void {
  const tecla = (e: KeyboardEvent) => {
    const avanzar = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const volver = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if (!avanzar && !volver) return;
    if (document.activeElement instanceof HTMLInputElement) return;
    const caja = document.querySelector(selector);
    if (!caja) return;
    const lista = [...caja.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter((b) => b.offsetParent !== null && b.tabIndex >= 0);
    if (!lista.length) return;
    const i = lista.indexOf(document.activeElement as HTMLElement);
    const sig = lista[(i + (avanzar ? 1 : -1) + lista.length) % lista.length] ?? lista[0];
    sig.focus();
    e.preventDefault();
  };
  addEventListener('keydown', tecla);
  return () => removeEventListener('keydown', tecla);
}
