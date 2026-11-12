// Administración por línea de comandos (la misma API que usa el panel web). Pensado para que Claude la use desde el chat.
//   SUBASTA_PIN=...  [SUBASTA_URL=https://…]  node scripts/admin.mjs <comando> …
//
//   troll:add <foto…> [--nombre "El Cono"] [--desc "frase"] [--precio 8] [--sin-fondo]
//   troll:list                      troll:set <id> [--nombre …] [--desc …] [--precio N] [--activo si|no]
//   troll:borrar <id>               troll:foto <id> <foto>
//   jugador:set <id> [--precio N] [--dato "…"] [--etiqueta "…"] [--foto archivo]
//   jugador:reset <id>              jugador:buscar <texto>
//   ticker "<mensaje>" --sala ABCD [--fijo] [--en SEGUNDOS]
//
// --sin-fondo quita el fondo con rembg si está instalado (pip install rembg onnxruntime); si no, la foto se muestra en óvalo.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const URL_BASE = (process.env.SUBASTA_URL || 'https://subasta-futbolera.antoniofguardia01.workers.dev').replace(/\/$/, '');
const PIN = process.env.SUBASTA_PIN || process.env.ADMIN_PIN;
if (!PIN) throw new Error('Falta SUBASTA_PIN');
const [cmd, ...resto] = process.argv.slice(2);
const pos = [];
const op = {};
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) {
    const k = resto[i].slice(2);
    op[k] = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true;
  } else pos.push(resto[i]);
}

async function api(ruta, metodo = 'GET', cuerpo) {
  const r = await fetch(`${URL_BASE}/api/admin/${ruta}`, { method: metodo, headers: { 'x-admin-pin': PIN, 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (r.status === 401) throw new Error('PIN incorrecto');
  return r.json();
}

async function preparar(archivo, sinFondo) {
  let buf = readFileSync(archivo);
  if (sinFondo) {
    try {
      execFileSync('python3', ['-m', 'rembg', 'i', archivo, '/tmp/sf-sin-fondo.png'], { stdio: 'ignore' });
      buf = readFileSync('/tmp/sf-sin-fondo.png');
    } catch {
      console.log('  (rembg no está disponible: se deja el fondo)');
    }
  }
  const data = await sharp(buf).rotate().resize({ width: 720, withoutEnlargement: true }).ensureAlpha().webp({ quality: 86 }).toBuffer();
  const raw = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => raw.data[(y * raw.info.width + x) * 4 + 3];
  const w = raw.info.width;
  const h = raw.info.height;
  const opaca = [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)].every((a) => a > 245);
  return { imagen: 'data:image/webp;base64,' + data.toString('base64'), opaca };
}
const si = (v) => v === true || v === 'si' || v === 'sí';

switch (cmd) {
  case 'troll:add':
    for (const f of pos) {
      const { imagen, opaca } = await preparar(f, op['sin-fondo']);
      const r = await api('c/troll', 'POST', { imagen, opaca, nombre: op.nombre, descripcion: op.desc, precioMinimo: op.precio });
      console.log(r.ok ? `✓ ${f} → ${r.id}${op.nombre ? '' : ' (sin nombre: queda en Pendientes)'}${opaca ? ' · fondo opaco' : ''}` : `✗ ${f}: ${r.error}`);
    }
    break;
  case 'troll:list': {
    const e = await api('estado');
    console.log(`${e.trolls.length} trolls${e.muestras ? ' (se usan los dibujos de muestra hasta que haya uno propio)' : ''}`);
    for (const t of e.trolls) console.log(`${t.activo ? '●' : '○'} ${t.id}  ${t.nombre || '(sin nombre)'}  — ${t.descripcion || '(sin descripción)'}`);
    break;
  }
  case 'troll:set': {
    const c = {};
    if (op.nombre) c.nombre = op.nombre;
    if (op.desc !== undefined) c.descripcion = op.desc;
    if (op.precio) c.precioMinimo = Number(op.precio);
    if (op.activo !== undefined) c.activo = si(op.activo);
    console.log(await api('c/troll/' + pos[0], 'PUT', c));
    break;
  }
  case 'troll:foto': {
    const { imagen, opaca } = await preparar(pos[1], op['sin-fondo']);
    console.log(await api('c/troll/' + pos[0], 'PUT', { imagen, opaca }));
    break;
  }
  case 'troll:borrar':
    console.log(await api('c/troll/' + pos[0], 'DELETE'));
    break;
  case 'jugador:set': {
    const c = {};
    if (op.precio) c.precioMinimo = Number(op.precio);
    if (op.dato) c.dato = op.dato;
    if (op.etiqueta) c.etiqueta = op.etiqueta;
    if (op.foto) c.imagen = (await preparar(op.foto, op['sin-fondo'])).imagen;
    console.log(await api('c/jugador/' + pos[0], 'PUT', c));
    break;
  }
  case 'jugador:reset':
    console.log(await api('c/jugador/' + pos[0], 'DELETE'));
    break;
  case 'jugador:buscar': {
    const e = await api('estado');
    const q = pos.join(' ').toLowerCase();
    for (const j of e.jugadores.filter((x) => `${x.nombre} ${x.apellido}`.toLowerCase().includes(q))) console.log(`${j.id}  ${j.nombre} ${j.apellido}  ${j.pos}  $${j.precioMinimo}M${j.editado ? '  (editado)' : ''}`);
    break;
  }
  case 'ticker':
    console.log(await api('ticker', 'POST', { sala: op.sala, texto: pos[0], fijo: !!op.fijo, en: op.en ? Number(op.en) : 0 }));
    break;
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 13).join('\n'));
}
