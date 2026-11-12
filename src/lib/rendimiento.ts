// Modo liviano: en teles lentas se apagan grano, mezclas, rayos y se reducen las partículas.
// - Las Smart TV (Tizen, webOS, Fire TV, Android TV…) arrancan en liviano.
// - En cualquier pantalla se mide el ritmo de cuadros todo el tiempo: si dos tramos seguidos
//   van por debajo de ~40 fps, se pasa a liviano solo (sin recordarlo, por si fue un mal momento).
// - Lo que elija la persona a mano (botón o tecla L en la TV) se recuerda y manda sobre lo automático.
import { guardar, leer } from './util';

const oyentes = new Set<() => void>();

export function ponerLite(on: boolean, recordar = true) {
  if (on) document.documentElement.dataset.lite = '1';
  else delete document.documentElement.dataset.lite;
  if (recordar) guardar('lite', on);
  oyentes.forEach((f) => f());
}

export const esLite = () => document.documentElement.dataset.lite === '1';

export function alCambiarLite(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Navegadores de Smart TV y palitos de streaming conocidos. */
export const esSmartTv = () => /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|Android TV|GoogleTV|CrKey|Roku|VIDAA|Viera|AQUOS/i.test(navigator.userAgent);

export function vigilarRendimiento() {
  const elegido = leer<boolean | null>('lite', null);
  if (elegido !== null) ponerLite(elegido, false);
  else if (esSmartTv()) ponerLite(true, false);

  // Medición continua en tramos de 4 s; solo cuenta cuando hay algo animándose (dt < 250 ms).
  let previo = performance.now();
  let tramo = previo;
  let cuadros = 0;
  let lentos = 0;
  let malos = 0;
  const paso = (t: number) => {
    const dt = t - previo;
    previo = t;
    if (dt < 250) {
      cuadros++;
      if (dt > 25) lentos++;
    }
    if (t - tramo > 4000) {
      const lento = cuadros > 50 && lentos / cuadros > 0.35;
      malos = lento ? malos + 1 : 0;
      tramo = t;
      cuadros = lentos = 0;
      // Lo elegido a mano no se pisa.
      if (malos >= 2 && !esLite() && leer<boolean | null>('lite', null) === null) ponerLite(true, false);
    }
    requestAnimationFrame(paso);
  };
  // El primer segundo es carga: se arranca después.
  setTimeout(() => requestAnimationFrame((t) => ((previo = tramo = t), requestAnimationFrame(paso))), 1200);
}
