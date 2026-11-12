// Panel de administración (protegido con PIN): trolls con sus fotos, jugadores y precios, mensajes del ticker.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fondo } from '../components/comunes';
import { irConTelon } from '../lib/ruta';
import { Avatar } from '../components/comunes';

type Tab = 'trolls' | 'jugadores' | 'mensajes';
interface TrollA { id: string; nombre: string; descripcion: string; precioMinimo: number; activo: boolean; pendiente: boolean; opaca: boolean; foto: string; rostro?: number[] }
interface JugA { id: string; nombre: string; apellido: string; pos: string; pais: string; rating: number; rareza: string; precioMinimo: number; etiqueta: string; dato: string; fotos: string[]; editado: boolean; propio: boolean }
interface Plant { id: string; disparador: string; intensidad: number; texto: string; activo: boolean }
interface Estado { jugadores: JugA[]; trolls: TrollA[]; muestras: boolean; plantillasBase: Plant[]; plantillas: { custom: Plant[]; apagadas: string[] } }

const POS = ['POR', 'LD', 'DFC', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'DC', 'EI'];
const DISPARADORES = ['vendido', 'vendido_caro', 'robo', 'estrella', 'troll', 'obligado', 'ruleta', 'pasa', 'salteada', 'tarde', 'sin_saldo', 'guerra', 'ultima', 'ronda', 'entra', 'sale', 'inicio', 'final', 'relleno'];

/** Achica la foto (máx. 720 px de ancho) y la guarda en WebP conservando la transparencia. */
async function comprimir(archivo: File): Promise<{ imagen: string; opaca: boolean }> {
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, 720 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const esquinas = [[2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]);
  return { imagen: c.toDataURL('image/webp', 0.86), opaca: esquinas.every((a) => a > 245) };
}

export function Admin() {
  const [pin, setPin] = useState(() => sessionStorage.getItem('sf.pin') ?? '');
  const [entrada, setEntrada] = useState('');
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('trolls');
  const [est, setEst] = useState<Estado | null>(null);
  const [aviso, setAviso] = useState('');

  const api = useCallback(
    async (ruta: string, metodo = 'GET', cuerpo?: unknown, pinUsado = pin) => {
      const r = await fetch('/api/admin/' + ruta, { method: metodo, headers: { 'x-admin-pin': pinUsado, 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
      if (r.status === 401) throw new Error('pin');
      return r.json();
    },
    [pin],
  );
  const cargar = useCallback(async () => setEst(await api('estado')), [api]);
  const avisar = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(''), 2200);
  };

  useEffect(() => {
    if (!pin) return;
    api('estado', 'GET', undefined, pin)
      .then((e) => (setEst(e), setOk(true)))
      .catch(() => (setOk(false), sessionStorage.removeItem('sf.pin')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const e2 = await api('estado', 'GET', undefined, entrada.trim());
      sessionStorage.setItem('sf.pin', entrada.trim());
      setPin(entrada.trim());
      setEst(e2);
      setOk(true);
    } catch {
      setError('PIN incorrecto');
    }
  };

  if (!ok)
    return (
      <div className="pantalla admin-pin">
        <Fondo paleta="oscuro" />
        <form onSubmit={entrar}>
          <h1>Panel</h1>
          <input type="password" value={entrada} onChange={(e) => (setEntrada(e.target.value), setError(''))} placeholder="PIN" autoFocus autoComplete="current-password" />
          {error && <p className="admin-error">{error}</p>}
          <button className="btn btn--acento">Entrar</button>
        </form>
      </div>
    );

  return (
    <div className="pantalla admin">
      <header>
        <b>Panel · Subasta Futbolera</b>
        <nav>
          {(['trolls', 'jugadores', 'mensajes'] as Tab[]).map((t) => (
            <button key={t} data-on={tab === t ? '1' : '0'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <button className="admin-salir" onClick={(e) => (sessionStorage.removeItem('sf.pin'), void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } }))}>
          Salir
        </button>
      </header>
      <main>
        {!est ? <p>Cargando…</p> : tab === 'trolls' ? <Trolls est={est} api={api} recargar={cargar} avisar={avisar} /> : tab === 'jugadores' ? <Jugadores est={est} api={api} recargar={cargar} avisar={avisar} /> : <Mensajes est={est} api={api} recargar={cargar} avisar={avisar} />}
      </main>
      {aviso && <div className="admin-aviso">{aviso}</div>}
    </div>
  );
}

type Props = { est: Estado; api: (r: string, m?: string, c?: unknown) => Promise<any>; recargar: () => Promise<void>; avisar: (t: string) => void };

// ───────────── Trolls ─────────────

function Trolls({ est, api, recargar, avisar }: Props) {
  const [subiendo, setSubiendo] = useState(0);
  const [arrastra, setArrastra] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const activos = est.trolls.filter((t) => t.activo).length;
  // Cada troll queda en la sección donde apareció por primera vez en esta visita: así, al ponerle nombre,
  // su tarjeta no salta de "Sin nombre" a la galería mientras todavía estás escribiendo lo demás.
  const seccion = useRef(new Map<string, boolean>());
  for (const t of est.trolls) if (!seccion.current.has(t.id)) seccion.current.set(t.id, !!t.pendiente);
  const pendientes = est.trolls.filter((t) => seccion.current.get(t.id));
  const listos = est.trolls.filter((t) => !seccion.current.get(t.id));

  const subir = async (archivos: FileList | File[]) => {
    const lista = [...archivos].filter((f) => f.type.startsWith('image/'));
    setSubiendo(lista.length);
    for (const f of lista) {
      try {
        const { imagen, opaca } = await comprimir(f);
        await api('c/troll', 'POST', { imagen, opaca });
      } catch {
        avisar('No pude subir ' + f.name);
      }
      setSubiendo((n) => n - 1);
    }
    await recargar();
    avisar('Fotos subidas: quedaron en "Sin nombre"');
  };

  return (
    <section>
      <div className="admin-resumen">
        <b>{activos}</b> trolls activos {activos < 30 && <span className="admin-pocos">· recomendado 30 o más (una partida de 10 puede usar hasta 55 sin repetir)</span>}
        {est.muestras && <span className="admin-pocos"> · ahora se usan los dibujos de muestra; en cuanto subas una foto se usan solo las tuyas</span>}
      </div>
      <div className="admin-drop" data-on={arrastra ? '1' : '0'} onDragOver={(e) => (e.preventDefault(), setArrastra(true))} onDragLeave={() => setArrastra(false)} onDrop={(e) => (e.preventDefault(), setArrastra(false), void subir(e.dataTransfer.files))} onClick={() => entrada.current?.click()}>
        {subiendo ? `Subiendo… quedan ${subiendo}` : 'Arrastra fotos acá o toca para elegirlas (varias a la vez)'}
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void subir(e.target.files)} />
      </div>
      {pendientes.length > 0 && (
        <>
          <h2>Sin nombre / pendientes ({pendientes.length})</h2>
          <div className="admin-grilla">{pendientes.map((t) => <TrollCard key={t.id + t.foto} t={t} api={api} recargar={recargar} avisar={avisar} />)}</div>
        </>
      )}
      <h2>Galería ({listos.length})</h2>
      <div className="admin-grilla">{listos.map((t) => <TrollCard key={t.id + t.foto} t={t} api={api} recargar={recargar} avisar={avisar} />)}</div>
    </section>
  );
}

function TrollCard({ t, api, recargar, avisar }: { t: TrollA } & Omit<Props, 'est'>) {
  const [nombre, setNombre] = useState(t.nombre);
  const [desc, setDesc] = useState(t.descripcion);
  const [precio, setPrecio] = useState(t.precioMinimo);
  const foto = useRef<HTMLInputElement>(null);
  const [ros, setRos] = useState<number[] | undefined>(t.rostro);
  const [ar, setAr] = useState(1);
  const baseFoto = t.foto.replace(/&r=[^&]*/, '');
  const guardar = async (extra: object = {}) => {
    await api('c/troll/' + t.id, 'PUT', { nombre, descripcion: desc, precioMinimo: precio, ...extra });
    avisar('Guardado');
    await recargar();
  };
  const cambiarFoto = async (f: File) => {
    const { imagen, opaca } = await comprimir(f);
    await api('c/troll/' + t.id, 'PUT', { imagen, opaca });
    await recargar();
    avisar('Foto reemplazada');
  };
  return (
    <div className="admin-card" data-off={t.activo ? '0' : '1'} data-pendiente={t.pendiente ? '1' : '0'}>
      <img src={t.foto} alt="" data-opaca={t.opaca ? '1' : undefined} />
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => nombre !== t.nombre && void guardar()} placeholder="Nombre (cómo se anuncia)" maxLength={30} />
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== t.descripcion && void guardar()} placeholder='Descripción (ej. "el que siempre llega tarde")' maxLength={140} rows={2} />
      <label>
        Precio de salida suelto
        <input type="number" min={1} max={100} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} onBlur={() => precio !== t.precioMinimo && void guardar()} />
      </label>
      <details className="admin-enc">
        <summary>Encuadre del avatar{ros ? '' : ' (sin ajustar)'}</summary>
        <p>Toca la cara en la foto y ajusta el tamaño. Así se ve en el círculo:</p>
        <div className="admin-enc-fila">
          <Avatar src={ros ? `${baseFoto}&r=${ros.join(',')}` : baseFoto} className="admin-enc-prev" />
          <input
            type="range"
            min={10}
            max={90}
            value={Math.round((ros?.[2] ?? 0.4) * 100)}
            onChange={(e) => setRos([ros?.[0] ?? 0.5, ros?.[1] ?? 0.35, Number(e.target.value) / 100, ar])}
            onPointerUp={() => ros && void guardar({ rostro: ros })}
            onKeyUp={() => ros && void guardar({ rostro: ros })}
            aria-label="Tamaño de la cara"
          />
        </div>
        <div className="admin-enc-foto">
          <img
            src={baseFoto}
            alt=""
            onLoad={(e) => setAr(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const n = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, ros?.[2] ?? 0.4, ar];
              setRos(n);
              void guardar({ rostro: n });
            }}
          />
          {ros && <i style={{ left: `${ros[0] * 100}%`, top: `${ros[1] * 100}%`, width: `${ros[2] * 100}%` }} />}
        </div>
      </details>
      <div className="admin-fila">
        <button onClick={() => void guardar({ activo: !t.activo })}>{t.activo ? 'Desactivar' : 'Activar'}</button>
        <button onClick={() => foto.current?.click()}>Cambiar foto</button>
        <button className="admin-peligro" onClick={async () => confirm('¿Borrar este troll?') && (await api('c/troll/' + t.id, 'DELETE'), await recargar())}>
          Borrar
        </button>
        <input ref={foto} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void cambiarFoto(e.target.files[0])} />
      </div>
    </div>
  );
}

// ───────────── Jugadores ─────────────

function Jugadores({ est, api, recargar, avisar }: Props) {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const lista = useMemo(() => {
    const n = q.trim().toLowerCase();
    return est.jugadores.filter((j) => (!pos || j.pos === pos) && (!n || `${j.nombre} ${j.apellido}`.toLowerCase().includes(n))).sort((a, b) => b.precioMinimo - a.precioMinimo);
  }, [est.jugadores, q, pos]);
  return (
    <section>
      <div className="admin-barra">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador…" />
        <select value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">Todas las posiciones</option>
          {POS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="btn btn--acento" onClick={() => setNuevo(!nuevo)}>{nuevo ? 'Cerrar' : 'Agregar jugador'}</button>
      </div>
      {nuevo && <NuevoJugador api={api} recargar={async () => (await recargar(), setNuevo(false))} avisar={avisar} />}
      <p className="admin-resumen">{lista.length} jugadores · el precio es el mínimo con el que sale a subasta</p>
      <div className="admin-tabla">{lista.slice(0, 80).map((j) => <FilaJugador key={j.id + j.precioMinimo + j.fotos[0]} j={j} api={api} recargar={recargar} avisar={avisar} />)}</div>
      {lista.length > 80 && <p className="admin-resumen">Mostrando 80 de {lista.length}: afina la búsqueda.</p>}
    </section>
  );
}

function FilaJugador({ j, api, recargar, avisar }: { j: JugA } & Omit<Props, 'est'>) {
  const [precio, setPrecio] = useState(j.precioMinimo);
  const [dato, setDato] = useState(j.dato);
  const foto = useRef<HTMLInputElement>(null);
  const guardar = async (c: object) => {
    await api('c/jugador/' + j.id, 'PUT', c);
    avisar('Guardado');
    await recargar();
  };
  return (
    <div className="admin-fila-j" data-editado={j.editado || j.propio ? '1' : '0'}>
      <img src={j.fotos[0]} alt="" onClick={() => foto.current?.click()} title="Cambiar foto" />
      <b>
        {j.nombre} {j.apellido}
        <small>
          {j.pos} · {j.pais} · {j.rareza}
        </small>
      </b>
      <label>
        $M
        <input type="number" min={1} max={300} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} onBlur={() => precio !== j.precioMinimo && void guardar({ precioMinimo: precio })} />
      </label>
      <input className="admin-dato" value={dato} onChange={(e) => setDato(e.target.value)} onBlur={() => dato !== j.dato && void guardar({ dato })} />
      {(j.editado || j.propio) && (
        <button onClick={async () => confirm(j.propio ? '¿Borrar este jugador?' : '¿Volver a los valores originales?') && (await api('c/jugador/' + j.id, 'DELETE'), await recargar())}>{j.propio ? 'Borrar' : 'Restaurar'}</button>
      )}
      <input ref={foto} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && (await guardar({ imagen: (await comprimir(e.target.files[0])).imagen }))} />
    </div>
  );
}

function NuevoJugador({ api, recargar, avisar }: Omit<Props, 'est'>) {
  const [f, setF] = useState({ nombre: '', apellido: '', pos: 'DC', pais: '', rating: 80, precioMinimo: 40, etiqueta: '', dato: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const poner = (k: string, v: string | number) => setF((x) => ({ ...x, [k]: v }));
  const crear = async () => {
    if (!archivo) return avisar('Falta la foto (recortada y de frente)');
    const r = await api('c/jugador', 'POST', { ...f, imagen: (await comprimir(archivo)).imagen });
    if (r.ok) (avisar('Jugador agregado'), await recargar());
    else avisar(r.error ?? 'No se pudo');
  };
  return (
    <div className="admin-nuevo">
      <input placeholder="Nombre" value={f.nombre} onChange={(e) => poner('nombre', e.target.value)} />
      <input placeholder="Apellido" value={f.apellido} onChange={(e) => poner('apellido', e.target.value)} />
      <select value={f.pos} onChange={(e) => poner('pos', e.target.value)}>{POS.map((p) => <option key={p}>{p}</option>)}</select>
      <input placeholder="País" value={f.pais} onChange={(e) => poner('pais', e.target.value)} />
      <label>Rating<input type="number" value={f.rating} onChange={(e) => poner('rating', Number(e.target.value))} /></label>
      <label>Precio $M<input type="number" value={f.precioMinimo} onChange={(e) => poner('precioMinimo', Number(e.target.value))} /></label>
      <input placeholder="Etiqueta (ej. ORO · EL 10)" value={f.etiqueta} onChange={(e) => poner('etiqueta', e.target.value)} />
      <input placeholder="Dato curioso" value={f.dato} onChange={(e) => poner('dato', e.target.value)} />
      <input type="file" accept="image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      <button className="btn btn--acento" onClick={() => void crear()}>Crear</button>
    </div>
  );
}

// ───────────── Mensajes ─────────────

function Mensajes({ est, api, recargar, avisar }: Props) {
  const [sala, setSala] = useState('');
  const [texto, setTexto] = useState('');
  const [fijo, setFijo] = useState(false);
  const [en, setEn] = useState(0);
  const [nueva, setNueva] = useState<Plant>({ id: '', disparador: 'vendido', intensidad: 2, texto: '', activo: true });
  const apagadas = new Set(est.plantillas.apagadas);

  const enviar = async () => {
    const r = await api('ticker', 'POST', { sala: sala.toUpperCase(), texto, fijo, en });
    if (r.ok) (avisar(en ? `Programado para dentro de ${en} s` : 'Enviado'), setTexto(''));
    else avisar(r.error ?? 'Revisa el código de la sala');
  };
  const guardar = async (custom: Plant[], off: string[]) => {
    await api('c/plantillas', 'PUT', { custom, apagadas: off });
    await recargar();
  };
  return (
    <section>
      <h2>Mensaje en vivo</h2>
      <div className="admin-nuevo">
        <input placeholder="Código de la sala (4 letras)" value={sala} onChange={(e) => setSala(e.target.value.toUpperCase().slice(0, 4))} />
        <textarea placeholder="Escribe el mensaje (puedes nombrar a un participante)" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={180} />
        <label><input type="checkbox" checked={fijo} onChange={(e) => setFijo(e.target.checked)} /> Fijarlo en la barra</label>
        <label>Enviar en (segundos)<input type="number" min={0} max={3600} value={en} onChange={(e) => setEn(Number(e.target.value))} /></label>
        <button className="btn btn--acento" disabled={sala.length !== 4 || !texto.trim()} onClick={() => void enviar()}>Enviar</button>
      </div>
      <h2>Mis plantillas ({est.plantillas.custom.length})</h2>
      <div className="admin-nuevo">
        <select value={nueva.disparador} onChange={(e) => setNueva({ ...nueva, disparador: e.target.value })}>{DISPARADORES.map((d) => <option key={d}>{d}</option>)}</select>
        <label>Picante<input type="number" min={1} max={3} value={nueva.intensidad} onChange={(e) => setNueva({ ...nueva, intensidad: Number(e.target.value) })} /></label>
        <input placeholder="Texto con {jugador} {monto} {carta} {rival} {posicion}" value={nueva.texto} onChange={(e) => setNueva({ ...nueva, texto: e.target.value })} />
        <button className="btn btn--acento" disabled={!nueva.texto.trim()} onClick={async () => (await guardar([...est.plantillas.custom, nueva], est.plantillas.apagadas), setNueva({ ...nueva, texto: '' }))}>Guardar plantilla</button>
      </div>
      {est.plantillas.custom.map((p) => (
        <div className="admin-plant" key={p.id}>
          <i>{p.disparador}·{p.intensidad}</i>
          <span>{p.texto}</span>
          <button onClick={() => void guardar(est.plantillas.custom.filter((x) => x.id !== p.id), est.plantillas.apagadas)}>Borrar</button>
        </div>
      ))}
      <h2>Plantillas del juego ({est.plantillasBase.length}) — apaga las que no te gusten</h2>
      {est.plantillasBase.map((p) => (
        <div className="admin-plant" key={p.id} data-off={apagadas.has(p.id) ? '1' : '0'}>
          <i>{p.disparador}·{p.intensidad}</i>
          <span>{p.texto}</span>
          <button onClick={() => void guardar(est.plantillas.custom, apagadas.has(p.id) ? est.plantillas.apagadas.filter((x) => x !== p.id) : [...est.plantillas.apagadas, p.id])}>{apagadas.has(p.id) ? 'Activar' : 'Apagar'}</button>
        </div>
      ))}
    </section>
  );
}
