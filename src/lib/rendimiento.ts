// Modo lite automático: si el dispositivo no llega a ~40 fps (teles lentas), se apagan grano, mezclas y partículas.
import { guardar, leer } from './util';

export function ponerLite(on: boolean, recordar = true) {
  if (on) document.documentElement.dataset.lite = '1';
  else delete document.documentElement.dataset.lite;
  if (recordar) guardar('lite', on);
}

export const esLite = () => document.documentElement.dataset.lite === '1';

export function vigilarRendimiento() {
  const elegido = leer<boolean | null>('lite', null);
  if (elegido !== null) return ponerLite(elegido, false);
  let cuadros = 0;
  let lentos = 0;
  let previo = performance.now();
  const inicio = previo;
  const paso = (t: number) => {
    const dt = t - previo;
    previo = t;
    // Se ignora el primer segundo (carga) y las pausas largas (pestaña en segundo plano).
    if (t - inicio > 1200 && dt < 250) {
      cuadros++;
      if (dt > 25) lentos++;
    }
    if (t - inicio < 6000) requestAnimationFrame(paso);
    else if (cuadros > 60 && lentos / cuadros > 0.35) ponerLite(true, false);
  };
  requestAnimationFrame(paso);
}
