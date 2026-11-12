// Publica el juego: sube dist/ al KV "subasta-futbolera-archivos" y despliega el Worker.
// (Los "assets" normales de Workers no se pueden subir desde las sesiones en la nube de Claude.)
// Uso: npm run build && CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/publicar.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const API = `https://api.cloudflare.com/client/v4/accounts/${cuenta}`;
const TITULO = 'subasta-futbolera-archivos';

async function cf(ruta, op = {}) {
  const r = await fetch(API + ruta, { ...op, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  const d = await r.json();
  if (!d.success) throw new Error(`${ruta}: ${JSON.stringify(d.errors)}`);
  return d.result;
}

const lista = await cf('/storage/kv/namespaces?per_page=100');
const ns = lista.find((n) => n.title === TITULO) ?? (await cf('/storage/kv/namespaces', { method: 'POST', body: JSON.stringify({ title: TITULO }) }));

const archivos = [];
const andar = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) andar(p);
    else archivos.push(p);
  }
};
andar('dist');

// Solo se suben los archivos que cambiaron (el plan gratuito de KV permite ~1000 escrituras por día).
// La lista de lo ya subido (ruta → huella) vive en la clave __manifiesto.
const { createHash } = await import('node:crypto');
const huella = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');
let previo = {};
try {
  const r = await fetch(`${API}/storage/kv/namespaces/${ns.id}/values/__manifiesto`, { headers: { authorization: `Bearer ${token}` } });
  if (r.ok) previo = await r.json();
} catch {
  /* primera vez */
}
const manifiesto = {};
const cambiados = [];
for (const p of archivos) {
  const k = path.relative('dist', p).split(path.sep).join('/');
  manifiesto[k] = huella(p);
  if (previo[k] !== manifiesto[k]) cambiados.push(p);
}

// Protecciones contra el límite diario de escrituras del plan gratuito de KV (~1000 por día).
const LIMITE_SEGURO = 800;
console.log(`${cambiados.length} de ${archivos.length} archivos cambiaron desde la última publicación.`);
if (process.argv.includes('--ver')) {
  console.log('(solo mirar: no se subió nada)');
  process.exit(0);
}
if (cambiados.length > LIMITE_SEGURO && !process.argv.includes('--forzar')) {
  console.error(`Son más de ${LIMITE_SEGURO} archivos: casi todo el límite diario del plan gratuito. Si de verdad quieres seguir: npm run deploy -- --forzar`);
  process.exit(1);
}

// El manifiesto se guarda después de cada lote que sale bien: si se corta a la mitad, lo ya subido no se vuelve a escribir.
const hecho = { ...previo };
let lote = [];
let claves = [];
let peso = 0;
const enviar = async () => {
  if (!lote.length) return;
  await cf(`/storage/kv/namespaces/${ns.id}/bulk`, { method: 'PUT', body: JSON.stringify(lote) });
  for (const k of claves) hecho[k] = manifiesto[k];
  await cf(`/storage/kv/namespaces/${ns.id}/bulk`, { method: 'PUT', body: JSON.stringify([{ key: '__manifiesto', value: JSON.stringify(hecho) }]) });
  lote = [];
  claves = [];
  peso = 0;
};
for (const p of cambiados) {
  const v = readFileSync(p).toString('base64');
  if (peso + v.length > 20e6) await enviar();
  const k = path.relative('dist', p).split(path.sep).join('/');
  lote.push({ key: k, value: v, base64: true });
  claves.push(k);
  peso += v.length;
}
await enviar();
console.log(`${cambiados.length} de ${archivos.length} archivos subidos al KV ${TITULO} (los demás no cambiaron)`);

// Configuración de producción: igual a wrangler.jsonc pero con KV en lugar de assets.
const cfg = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
delete cfg.assets;
cfg.kv_namespaces = [{ binding: 'ARCHIVOS', id: ns.id }];
writeFileSync('wrangler.kv.json', JSON.stringify(cfg, null, 2) + '\n');
execSync('npx wrangler deploy -c wrangler.kv.json', { stdio: 'inherit' });
