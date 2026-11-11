// Importador de fotos: por cada jugador sin foto busca un retrato ya recortado (busto frontal, fondo transparente),
// lo valida, lo optimiza a WebP y actualiza data/players.json. Genera data/photos-report.json con los que fallaron.
//
//   npm run photos:import              → importa los que no tienen foto
//   npm run photos:import -- --todos   → vuelve a importar todos
//   npm run photos:import -- messi     → solo los ids indicados
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DATOS = path.join(RAIZ, 'data/players.json');
const SALIDA = path.join(RAIZ, 'public/img/players');
const CACHE = path.join(RAIZ, 'scripts/.cache');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** Lienzo final: todas las fotos quedan con el mismo encuadre (busto apoyado abajo, centrado). */
const ANCHO = 720;
const ALTO = 640;

interface Entrada {
  id: string;
  nombre: string;
  apellido: string;
  fotos: string[];
  buscar?: string;
  espn?: string;
  /** Id en el buscador de retratos. Ponerlo a mano corrige una búsqueda equivocada. */
  ea?: number;
  [k: string]: unknown;
}

interface Resultado {
  id: string;
  ok: boolean;
  fuente?: string;
  motivo?: string;
  avisos?: string[];
}

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function bajar(url: string, archivo: string): Promise<Buffer | null> {
  if (existsSync(archivo)) return readFile(archivo);
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      await writeFile(archivo, buf);
      return buf;
    } catch {
      await new Promise((ok) => setTimeout(ok, 800 * (intento + 1)));
    }
  }
  return null;
}

interface FichaEA {
  id: number;
  firstName?: string;
  lastName?: string;
  commonName?: string | null;
  overallRating?: number;
}

/** Busca el id del jugador en el buscador público de ratings (devuelve retratos de 512 px, frontales y recortados). */
async function buscarId(j: Entrada): Promise<string | null> {
  if (j.ea) return String(j.ea);
  const consultas = [j.buscar, `${j.nombre} ${j.apellido}`.trim(), j.apellido, j.nombre].filter((c): c is string => !!c);
  const objetivo = norm(`${j.nombre} ${j.apellido}`).split(' ').filter(Boolean);
  for (const consulta of [...new Set(consultas)]) {
    try {
      const url = `https://drop-api.ea.com/rating/ea-sports-fc?locale=en&limit=12&search=${encodeURIComponent(consulta)}`;
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (!r.ok) continue;
      const d = (await r.json()) as { items?: FichaEA[] };
      const items = d.items ?? [];
      const q = norm(consulta).split(' ');
      const puntaje = (i: FichaEA) => {
        const n = norm(`${i.firstName ?? ''} ${i.lastName ?? ''} ${i.commonName ?? ''}`);
        const aciertos = objetivo.filter((p) => n.includes(p)).length + q.filter((p) => n.includes(p)).length;
        return aciertos * 100 + (i.overallRating ?? 0);
      };
      const mejor = items.slice().sort((a, b) => puntaje(b) - puntaje(a))[0];
      if (mejor && puntaje(mejor) >= 100) return String(mejor.id);
    } catch {
      /* se prueba la siguiente consulta */
    }
  }
  return null;
}

/** Fuentes del retrato para un id, de mejor a peor. */
const fuentes = (id: string) => [
  { nombre: 'ea25', url: `https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits/p${id}.png` },
  { nombre: 'fb25', url: `https://cdn.futbin.com/content/fifa25/img/players/${id}.png` },
  { nombre: 'fb24', url: `https://cdn.futbin.com/content/fifa24/img/players/${id}.png` },
  { nombre: 'fb23', url: `https://cdn.futbin.com/content/fifa23/img/players/${id}.png` },
];

/** Valida y normaliza un retrato con transparencia. Devuelve el WebP final o el motivo del rechazo. */
async function procesar(buf: Buffer): Promise<{ webp: Buffer; avisos: string[] } | { error: string }> {
  const img = sharp(buf).ensureAlpha();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return { error: 'imagen ilegible' };
  if (meta.width < 300) return { error: `muy chica (${meta.width}px)` };

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let opacos = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let sumaX = 0, cabeza = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        opacos++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (y < h * 0.45) {
          sumaX += x;
          cabeza++;
        }
      }
    }
  const cobertura = opacos / (w * h);
  if (cobertura < 0.12) return { error: 'casi vacía (sin sujeto)' };
  if (cobertura > 0.9) return { error: 'sin fondo transparente' };

  const avisos: string[] = [];
  const anchoSujeto = maxX - minX + 1;
  const altoSujeto = maxY - minY + 1;
  if (maxY < h - 3) avisos.push('el busto no llega al borde inferior');
  // Pose frontal: la cabeza debe estar centrada sobre los hombros.
  const centroCabeza = cabeza ? sumaX / cabeza : w / 2;
  const centroCuerpo = (minX + maxX) / 2;
  if (Math.abs(centroCabeza - centroCuerpo) > anchoSujeto * 0.12) avisos.push('cabeza descentrada (¿pose de perfil?)');
  if (altoSujeto / anchoSujeto > 1.9) avisos.push('encuadre de cuerpo entero, no de busto');
  if (meta.width < 500) avisos.push(`resolución baja (${meta.width}px)`);

  // Mismo encuadre para todos: se recorta al sujeto y se apoya abajo, ocupando ~92% del alto.
  const recorte = await sharp(buf)
    .ensureAlpha()
    .extract({ left: minX, top: minY, width: anchoSujeto, height: altoSujeto })
    .resize({ width: Math.round(ANCHO * 0.96), height: Math.round(ALTO * 0.92), fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const webp = await sharp({ create: { width: ANCHO, height: ALTO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: recorte, gravity: 'south' }])
    .webp({ quality: 84, alphaQuality: 90, effort: 5 })
    .toBuffer();
  return { webp, avisos };
}

async function main() {
  const args = process.argv.slice(2);
  const todos = args.includes('--todos');
  const filtro = args.filter((a) => !a.startsWith('--'));
  await mkdir(SALIDA, { recursive: true });
  await mkdir(CACHE, { recursive: true });
  const jugadores = JSON.parse(await readFile(DATOS, 'utf8')) as Entrada[];
  const pendientes = jugadores.filter((j) => (filtro.length ? filtro.includes(j.id) : todos || !j.fotos.length));
  console.log(`Importando ${pendientes.length} de ${jugadores.length} jugadores…`);

  const informe: Resultado[] = [];
  let i = 0;
  const trabajar = async () => {
    while (i < pendientes.length) {
      const j = pendientes[i++];
      const res: Resultado = { id: j.id, ok: false };
      const id = await buscarId(j);
      if (!id) res.motivo = 'no encontrado en el buscador';
      else {
        res.motivo = `sin retrato (id ${id})`;
        for (const f of fuentes(id)) {
          const buf = await bajar(f.url, path.join(CACHE, `${f.nombre}-${id}.png`));
          if (!buf || buf.length < 20000) continue; // los marcadores de posición pesan muy poco
          const p = await procesar(buf);
          if ('error' in p) {
            res.motivo = p.error;
            continue;
          }
          await writeFile(path.join(SALIDA, `${j.id}.webp`), p.webp);
          j.fotos = [`/img/players/${j.id}.webp`];
          j.ea = Number(id);
          delete j.espn;
          res.ok = true;
          res.fuente = `${f.nombre}:${id}`;
          delete res.motivo;
          if (p.avisos.length) res.avisos = p.avisos;
          break;
        }
      }
      informe.push(res);
      console.log(`${res.ok ? (res.avisos ? '~' : '✓') : '✗'} ${j.id}${res.motivo ? ' — ' + res.motivo : ''}${res.avisos ? ' — ' + res.avisos.join('; ') : ''}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajar));

  await writeFile(DATOS, JSON.stringify(jugadores, null, 1) + '\n');
  const fallaron = informe.filter((r) => !r.ok);
  const flojos = informe.filter((r) => r.ok && r.avisos);
  await writeFile(
    path.join(RAIZ, 'data/photos-report.json'),
    JSON.stringify({ fecha: new Date().toISOString(), total: jugadores.length, conFoto: jugadores.filter((j) => j.fotos.length).length, fallaron, flojos }, null, 1) + '\n',
  );
  console.log(`\nListo: ${informe.length - fallaron.length} ok, ${flojos.length} flojos, ${fallaron.length} fallaron. Informe en data/photos-report.json`);
}

main();
