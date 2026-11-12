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

let lote = [];
let peso = 0;
const enviar = async () => {
  if (lote.length) await cf(`/storage/kv/namespaces/${ns.id}/bulk`, { method: 'PUT', body: JSON.stringify(lote) });
  lote = [];
  peso = 0;
};
for (const p of archivos) {
  const v = readFileSync(p).toString('base64');
  if (peso + v.length > 20e6) await enviar();
  lote.push({ key: path.relative('dist', p).split(path.sep).join('/'), value: v, base64: true });
  peso += v.length;
}
await enviar();
console.log(`${archivos.length} archivos subidos al KV ${TITULO}`);

// Configuración de producción: igual a wrangler.jsonc pero con KV en lugar de assets.
const cfg = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
delete cfg.assets;
cfg.kv_namespaces = [{ binding: 'ARCHIVOS', id: ns.id }];
writeFileSync('wrangler.kv.json', JSON.stringify(cfg, null, 2) + '\n');
execSync('npx wrangler deploy -c wrangler.kv.json', { stdio: 'inherit' });
