// Prepara las tipografías del juego: copia los .woff2 a src/fonts y genera src/styles/fuentes.css.
//
// Cada escenario tiene su propia familia "compuesta" (SF-estadio, SF-copa…) con tres voces, elegidas por ancho:
//   font-stretch 50–70 %   → TITULAR (condensada de impacto: logo, carteles, sellos)
//   font-stretch 71–110 %  → TEXTO   (interfaz y párrafos)
//   font-stretch 111–150 % → PLACA   (ancha y pesada: PRECIO, nombres de jugadores)
// Así el CSS solo dice "font-stretch: 62%" o "125%" y el navegador elige la tipografía correcta del escenario.
//
// Uso (solo si se quieren cambiar las fuentes):
//   npm i -D @fontsource/<paquete>…   y luego   node scripts/fuentes.mjs
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DESTINO = path.join(RAIZ, 'src/fonts');
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

/** [paquete, peso, estilo] */
const TEXTO = [
  ['bricolage-grotesque', 500, 'normal', '100 599'],
  ['bricolage-grotesque', 700, 'normal', '600 749'],
  ['bricolage-grotesque', 800, 'normal', '750 1000'],
];
const ESCENARIOS = {
  estadio: { titular: ['alumni-sans', 900, 'italic'], placa: ['dela-gothic-one', 400, 'normal'] },
  copa: { titular: ['league-gothic', 400, 'normal'], placa: ['abril-fatface', 400, 'normal'] },
  album: { titular: ['staatliches', 400, 'normal'], placa: ['alfa-slab-one', 400, 'normal'] },
  pizarra: { titular: ['londrina-solid', 900, 'normal'], placa: ['permanent-marker', 400, 'normal'] },
  miami: { titular: ['barlow-condensed', 900, 'italic'], placa: ['righteous', 400, 'normal'] },
};
const CIFRAS = [
  ['oxanium', 700, 'normal', '100 749'],
  ['oxanium', 800, 'normal', '750 1000'],
];

mkdirSync(DESTINO, { recursive: true });
const copiados = new Set();
function archivo(paquete, peso, estilo, subconjunto) {
  const nombre = `${paquete}-${subconjunto}-${peso}-${estilo}.woff2`;
  const origen = path.join(RAIZ, 'node_modules/@fontsource', paquete, 'files', nombre);
  if (!existsSync(origen)) return null;
  if (!copiados.has(nombre)) {
    copyFileSync(origen, path.join(DESTINO, nombre));
    copiados.add(nombre);
  }
  return nombre;
}

let css = '/* Generado por scripts/fuentes.mjs — no editar a mano. Tipografías con licencia abierta (SIL OFL). */\n';
function cara(familia, [paquete, peso, estilo], ancho, pesos) {
  for (const [sub, rango] of [['latin', LATIN], ['latin-ext', LATIN_EXT]]) {
    const f = archivo(paquete, peso, estilo, sub);
    if (!f) continue;
    css += `@font-face{font-family:'${familia}';font-style:normal;font-weight:${pesos};font-stretch:${ancho};font-display:swap;src:url('../fonts/${f}') format('woff2');unicode-range:${rango};}\n`;
  }
}

for (const [id, e] of Object.entries(ESCENARIOS)) {
  css += `\n/* ── ${id} ── */\n`;
  cara(`SF-${id}`, e.titular, '50% 70%', '1 1000');
  cara(`SF-${id}`, e.placa, '111% 150%', '1 1000');
  for (const [p, w, s, pesos] of TEXTO) cara(`SF-${id}`, [p, w, s], '71% 110%', pesos);
}
css += '\n/* ── cifras ── */\n';
for (const [p, w, s, pesos] of CIFRAS) cara('SF-cifras', [p, w, s], '50% 150%', pesos);

writeFileSync(path.join(RAIZ, 'src/styles/fuentes.css'), css);
console.log(`${copiados.size} archivos en src/fonts · src/styles/fuentes.css generado`);
