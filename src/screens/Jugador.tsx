// Vista del celular: entrar, lobby, subasta (un solo botón OFERTAR) y resultados.
import { CSSProperties, FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { Ajustes, EstadoPublico, JugadorSala, MotivoRechazo } from '../../shared/types';
import { MAX_PARTICIPANTES, POS_NOMBRE, rangoTrolls } from '../../shared/types';
import { Avatar, BotonPantalla, Fondo, Numero, Ticker, cuentaEquipo } from '../components/comunes';
import { Escena } from '../components/Escena';
import { Fx, FxApi } from '../components/Fx';
import { Reloj, Tic } from '../components/Reloj';
import { Ruleta } from '../components/Ruleta';
import { irConTelon } from '../lib/ruta';
import { Sala, VistaSala, useSala } from '../lib/sala';
import { activarSonido, desbloquearSonido, sonar, sonidoPreferido } from '../lib/sonido';
import { TEMAS, elegirTemaPropio, temaPropio } from '../lib/temas';
import { guardar, leer, vibrar } from '../lib/util';
import { CanchaMedida, Cargando, SinSala } from './Escenario';
import { useEquipoEnPantalla } from '../lib/vistaFinal';
import { IconoCerrar, IconoLapiz, IconoMenos } from '../components/Iconos';
import { Escaner, hayCamara } from '../components/Escaner';

interface AvatarDato {
  id: string;
  nombre: string;
  foto: string;
}

const RECHAZO: Record<MotivoRechazo, string> = {
  tarde: '¡Llegaste tarde!',
  sin_saldo: 'No te alcanza',
  superado: 'Ya te pasaron: sube la cifra',
  ya_compraste: 'Ya compraste en esta ronda',
  ya_lideras: 'Ya vas ganando, tranquilo',
  pausa: 'Está en pausa',
  no_sobran: 'No sobran cartas: no se puede saltear',
  sin_skips: 'Te quedaste sin skips',
  hay_ofertas: 'Ya hay ofertas: no se puede saltear',
};

export function Jugador({ codigo }: { codigo: string }) {
  const [sala, vista] = useSala(codigo, 'jugador');
  const s = vista.estado;

  useEffect(() => {
    guardar('sala', codigo);
    const toque = () => desbloquearSonido();
    addEventListener('pointerdown', toque, { once: true });
    return () => removeEventListener('pointerdown', toque);
  }, [codigo]);

  if (vista.conexion === 'sin_sala') return <SinSala codigo={codigo} />;
  if (vista.conexion === 'expulsado')
    return (
      <div className="pantalla cargando">
        <Fondo paleta="troll" />
        <div className="cargando-cont">
          <b>Te sacaron de la sala</b>
          <span>Algo habrás hecho.</span>
          <button className="btn btn--acento" onClick={(e) => void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } })}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  if (!s) return <Cargando texto="Entrando a la sala" />;

  const yo = s.jugadores.find((j) => j.id === vista.tu);
  const pantalla = !yo ? 'entrar' : s.fase === 'lobby' ? 'lobby' : s.fase === 'final' ? 'final' : 'juego';

  return (
    <div className="pantalla movil" data-pantalla={pantalla}>
      {/* Cada pantalla es una capa: al cambiar, una sale y la otra entra (sin cortes). */}
      <Capa on={pantalla === 'entrar'}>{pantalla === 'entrar' && <Entrar sala={sala} s={s} vista={vista} />}</Capa>
      <Capa on={pantalla === 'lobby'}>{pantalla === 'lobby' && yo && <Lobby sala={sala} s={s} yo={yo} anfitrion={vista.anfitrion} />}</Capa>
      <Capa on={pantalla === 'juego'}>{pantalla === 'juego' && yo && <Juego sala={sala} s={s} yo={yo} anfitrion={vista.anfitrion} />}</Capa>
      <Capa on={pantalla === 'final'}>{pantalla === 'final' && yo && <Final sala={sala} s={s} yo={yo} anfitrion={vista.anfitrion} />}</Capa>
      {vista.conexion === 'reconectando' && (
        <div className="m-reconecta">
          <i />
          Reconectando… tu lugar está guardado
        </div>
      )}
    </div>
  );
}

function Capa({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div className="m-capa" data-on={on ? '1' : '0'}>
      {children}
    </div>
  );
}

// ───────────── Entrar: nombre + avatar ─────────────

function Entrar({ sala, s, vista }: { sala: Sala; s: EstadoPublico; vista: VistaSala }) {
  const [nombre, setNombre] = useState(leer('nombre', ''));
  const [avatares, setAvatares] = useState<AvatarDato[]>([]);
  const [avatar, setAvatar] = useState(leer('avatar', ''));
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch('/api/datos')
      .then((r) => r.json())
      .then((d: { avatares: AvatarDato[] }) => {
        setAvatares(d.avatares);
        setAvatar((a) => (a && d.avatares.some((x) => x.foto === a) ? a : d.avatares[Math.floor(Math.random() * d.avatares.length)]?.foto ?? ''));
      })
      .catch(() => {});
  }, []);

  // Error del servidor (nombre repetido, sala llena): el formulario se sacude.
  useEffect(() => {
    if (vista.error && form.current) {
      gsap.fromTo(form.current, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.25)' });
      vibrar([30, 40, 30]);
    }
  }, [vista.error?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    guardar('nombre', nombre.trim());
    guardar('avatar', avatar);
    sala.enviar({ t: 'entrar', nombre, avatar });
  };

  const yaEmpezo = s.fase !== 'lobby';
  return (
    <div className="m-entrar">
      <Fondo paleta="misterio" />
      <form ref={form} className="entrar-caja" onSubmit={enviar}>
        <span className="entrar-sala">
          Sala <b>{s.codigo}</b>
        </span>
        {yaEmpezo ? (
          <>
            <h1>Ya arrancó</h1>
            <p className="entrar-nota">La subasta está en marcha. Puedes mirarla o esperar la revancha.</p>
            <button type="button" className="btn btn--acento" onClick={(e) => void irConTelon(`/stage/${s.codigo}`, { origen: { x: e.clientX, y: e.clientY } })}>
              Mirar la subasta
            </button>
          </>
        ) : (
          <>
            <h1>¿Quién eres?</h1>
            <input
              className="entrar-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.slice(0, 14))}
              placeholder="Tu nombre"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="go"
              maxLength={14}
            />
            <span className="entrar-rotulo">Elige tu cara</span>
            <div className="entrar-avatares">
              {avatares.map((a, i) => (
                <button type="button" key={a.id} data-on={avatar === a.foto ? '1' : '0'} style={{ '--i': i } as CSSProperties} onClick={() => (setAvatar(a.foto), vibrar(8))} aria-label={a.nombre}>
                  <Avatar src={a.foto} />
                </button>
              ))}
            </div>
            {vista.error && (
              <p className="entrar-error" key={vista.error.n}>
                {vista.error.texto}
              </p>
            )}
            <button className="btn btn--acento entrar-ir" disabled={nombre.trim().length < 2 || !avatar}>
              Entrar a la sala
            </button>
          </>
        )}
      </form>
    </div>
  );
}

// ───────────── Lobby ─────────────

function Lobby({ sala, s, yo, anfitrion }: { sala: Sala; s: EstadoPublico; yo: JugadorSala; anfitrion: boolean }) {
  const [hoja, setHoja] = useState<'reglas' | 'tv' | 'tema' | null>(null);
  const url = `${location.origin}/r/${s.codigo}`;
  const compartir = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Subasta Futbolera', text: `Entra a mi subasta: sala ${s.codigo}`, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelado */
    }
  };
  const pocos = s.jugadores.length < 2;
  return (
    <div className="m-lobby">
      <Fondo paleta="misterio" />
      <header className="lobby-cab">
        <span>Sala</span>
        <div className="lobby-cod">
          {s.codigo.split('').map((l, i) => (
            <b key={i} style={{ '--i': i } as CSSProperties}>
              {l}
            </b>
          ))}
        </div>
        <button className="btn lobby-compartir" onClick={compartir}>
          Invitar
        </button>
      </header>

      <div className="lobby-cuerpo">
        <h2>
          En la sala <b className="num">{s.jugadores.length}</b>
          <i className="num">/{MAX_PARTICIPANTES}</i>
        </h2>
        <div className="lobby-jugs">
          {s.jugadores.map((j, i) => (
            <div className="lobby-j" key={j.id} style={{ '--c': j.color, '--i': i } as CSSProperties} data-off={j.conectado ? undefined : '1'}>
              <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
              <b>{j.nombre}</b>
              {j.id === yo.id && <i className="yo">Tú</i>}
              {j.id === s.anfitrionId && <i>Anfitrión</i>}
              {anfitrion && j.id !== yo.id && (
                <button className="lobby-x" onClick={() => sala.enviar({ t: 'expulsar', pid: j.id })} aria-label={`Sacar a ${j.nombre}`}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="lobby-acciones">
          <button className="btn" onClick={() => setHoja('reglas')}>
            {anfitrion ? 'Reglas' : 'Ver reglas'}
          </button>
          {anfitrion && (
            <button className="btn" onClick={() => setHoja('tv')}>
              Conectar TV
            </button>
          )}
          <button className="btn" onClick={() => setHoja('tema')}>
            Escenario
          </button>
          <button className="btn" onClick={(e) => confirm('¿Salir de la sala?') && (sala.enviar({ t: 'salir' }), void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } }))}>
            Salir de la sala
          </button>
          <BotonPantalla className="btn-pantalla--lobby" />
        </div>
      </div>

      <footer className="lobby-pie">
        {anfitrion ? (
          <>
            <button className="btn btn--acento lobby-empezar" disabled={pocos} onClick={() => (vibrar([20, 30, 60]), sala.enviar({ t: 'empezar' }))}>
              {pocos ? 'Faltan participantes' : 'Empezar'}
            </button>
            <span>{pocos ? 'Hacen falta al menos 2' : `Se sortea un mazo nuevo de ${(s.jugadores.length + s.ajustes.extra) * 11} cartas`}</span>
          </>
        ) : (
          <p className="lobby-esperando">
            Esperando al anfitrión
            <span className="puntos">
              <i />
              <i />
              <i />
            </span>
          </p>
        )}
      </footer>
      <Ticker mensajes={s.ticker} alto={34} />

      <Hoja on={hoja === 'reglas'} titulo="Reglas de la sala" cerrar={() => setHoja(null)}>
        <Reglas sala={sala} s={s} editable={anfitrion} />
      </Hoja>
      <Hoja on={hoja === 'tv'} titulo="Conectar TV" cerrar={() => setHoja(null)}>
        {hoja === 'tv' && <ConectarTV codigo={s.codigo} />}
      </Hoja>
      <Hoja on={hoja === 'tema'} titulo="Escenario" cerrar={() => setHoja(null)}>
        <SelectorTema sala={sala} s={s} anfitrion={anfitrion} />
      </Hoja>
    </div>
  );
}

function Paso({ rotulo, valor, min, max, paso = 1, sufijo = '', cambiar, editable }: { rotulo: string; valor: number; min: number; max: number; paso?: number; sufijo?: string; cambiar: (v: number) => void; editable: boolean }) {
  return (
    <div className="regla">
      <span>{rotulo}</span>
      <div className="regla-ctrl">
        {editable && (
          <button disabled={valor <= min} onClick={() => (vibrar(6), cambiar(Math.max(min, valor - paso)))} aria-label="Menos">
            <IconoMenos />
          </button>
        )}
        <b className="num">
          <Numero valor={valor} sufijo={sufijo} />
        </b>
        {editable && (
          <button disabled={valor >= max} onClick={() => (vibrar(6), cambiar(Math.min(max, valor + paso)))} aria-label="Más">
            +
          </button>
        )}
      </div>
    </div>
  );
}

function Reglas({ sala, s, editable }: { sala: Sala; s: EstadoPublico; editable: boolean }) {
  const a = s.ajustes;
  const poner = (p: Partial<Ajustes>) => sala.enviar({ t: 'ajustes', ajustes: p });
  const auto = rangoTrolls(Math.max(2, s.jugadores.length));
  const necesarios = 11 * (a.trollsAuto ? auto.max : a.trollsMax);
  return (
    <div className="reglas">
      <Paso rotulo="Presupuesto por cabeza" valor={a.presupuesto} min={300} max={3000} paso={100} sufijo="M" cambiar={(v) => poner({ presupuesto: v })} editable={editable} />
      <Paso rotulo="Segundos por oferta" valor={a.segundos} min={5} max={40} paso={5} sufijo="s" cambiar={(v) => poner({ segundos: v })} editable={editable} />
      <Paso rotulo="Cada oferta suma" valor={a.incremento} min={1} max={10} sufijo="M" cambiar={(v) => poner({ incremento: v })} editable={editable} />
      <Paso rotulo="Cartas extra por ronda" valor={a.extra} min={0} max={2} cambiar={(v) => poner({ extra: v })} editable={editable} />
      <Paso rotulo="Skips por participante" valor={a.skips} min={0} max={5} cambiar={(v) => poner({ skips: v })} editable={editable} />
      {/* El rango se puede fijar a mano antes de empezar; tocarlo apaga el ajuste automático. */}
      <Paso rotulo="Trolls por ronda: mínimo" valor={a.trollsMin} min={0} max={5} cambiar={(v) => poner({ trollsMin: v, trollsMax: Math.max(v, a.trollsMax) })} editable={editable} />
      <Paso rotulo="Trolls por ronda: máximo" valor={a.trollsMax} min={a.trollsMin} max={5} cambiar={(v) => poner({ trollsMax: v })} editable={editable} />
      <div className="regla">
        <span>
          Ajustar trolls según los jugadores
          <small>
            {a.trollsAuto ? `Activado: con ${Math.max(2, s.jugadores.length)} en la sala salen de ${auto.min} a ${auto.max}` : `Apagado: usa tu rango. Automático sería de ${auto.min} a ${auto.max}`}
          </small>
        </span>
        <button className="interruptor" data-on={a.trollsAuto ? '1' : '0'} disabled={!editable} onClick={() => (vibrar(8), poner({ trollsAuto: !a.trollsAuto }))} aria-pressed={a.trollsAuto}>
          <i />
        </button>
      </div>
      <div className="regla">
        <span>
          Trolls camuflados
          <small>Salen con precio de futbolista: el que lo compra paga lo que ofertó</small>
        </span>
        <button className="interruptor" data-on={a.trollsCamuflados ? '1' : '0'} disabled={!editable} onClick={() => (vibrar(8), poner({ trollsCamuflados: !a.trollsCamuflados }))} aria-pressed={a.trollsCamuflados}>
          <i />
        </button>
      </div>
      <Paso rotulo="Última oportunidad" valor={a.ultimaOportunidad} min={3} max={30} sufijo="s" cambiar={(v) => poner({ ultimaOportunidad: v })} editable={editable} />
      <Paso rotulo="Picante de las burlas" valor={a.intensidad} min={1} max={3} cambiar={(v) => poner({ intensidad: v as 1 | 2 | 3 })} editable={editable} />
      <div className="regla">
        <span>
          Si nadie oferta, alguien se la lleva
          <small>Última oportunidad y después ruleta</small>
        </span>
        <button className="interruptor" data-on={a.forzar ? '1' : '0'} disabled={!editable} onClick={() => (vibrar(8), poner({ forzar: !a.forzar }))} aria-pressed={a.forzar}>
          <i />
        </button>
      </div>
      {s.trollsDisponibles < necesarios && (
        <p className="reglas-aviso">
          Hay {s.trollsDisponibles} trolls cargados y esta partida puede usar hasta {necesarios}: se van a repetir.
        </p>
      )}
    </div>
  );
}

function SelectorTema({ sala, s, anfitrion }: { sala: Sala; s: EstadoPublico; anfitrion: boolean }) {
  const [propio, setPropio] = useState(temaPropio());
  const elegir = (id: string) => {
    vibrar(10);
    if (anfitrion) {
      // El anfitrión cambia el escenario de toda la sala (TV incluida).
      elegirTemaPropio(null);
      setPropio(null);
      sala.enviar({ t: 'ajustes', ajustes: { tema: id } });
    } else {
      elegirTemaPropio(id);
      setPropio(id);
    }
  };
  const actual = propio ?? s.ajustes.tema;
  return (
    <div className="temas">
      <p className="temas-nota">{anfitrion ? 'Eliges el escenario de toda la sala, TV incluida.' : 'Cambia solo en tu celular. La TV usa el del anfitrión.'}</p>
      {TEMAS.map((t) => (
        <button key={t.id} className="tema" data-on={actual === t.id ? '1' : '0'} onClick={() => elegir(t.id)}>
          <span className="tema-muestra" style={{ background: t.muestra[0] }}>
            <i style={{ background: t.muestra[1] }} />
            <i style={{ background: t.muestra[2] }} />
          </span>
          <span className="tema-texto">
            <b>{t.nombre}</b>
            <small>{t.bajada}</small>
          </span>
          {s.ajustes.tema === t.id && <em>Sala</em>}
        </button>
      ))}
      {!anfitrion && propio && (
        <button
          className="btn btn--linea temas-volver"
          onClick={() => {
            elegirTemaPropio(null);
            setPropio(null);
          }}
        >
          Usar el de la sala
        </button>
      )}
    </div>
  );
}

// ───────────── Conectar TV ─────────────

interface TvGuardada {
  tvId: string;
  nombre: string;
}

function ConectarTV({ codigo }: { codigo: string }) {
  const [tvs, setTvs] = useState<TvGuardada[]>(leer('tvs', []));
  const [enLinea, setEnLinea] = useState<Record<string, boolean>>({});
  const [letras, setLetras] = useState('');
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'mal'>('idle');
  const [mensaje, setMensaje] = useState('');
  const [camara, setCamara] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const guardarTvs = (l: TvGuardada[]) => {
    setTvs(l);
    guardar('tvs', l);
  };

  useEffect(() => {
    if (!tvs.length) return;
    let vivo = true;
    const ver = () =>
      fetch(`/api/tv/estado?ids=${tvs.map((t) => t.tvId).join(',')}`)
        .then((r) => r.json())
        .then((d: { teles: { tvId: string; enLinea: boolean }[] }) => vivo && setEnLinea(Object.fromEntries(d.teles.map((t) => [t.tvId, t.enLinea]))))
        .catch(() => {});
    ver();
    const id = setInterval(ver, 4000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [tvs]);

  const vincular = useCallback(
    async (cod: string) => {
      setEstado('enviando');
      try {
        const r = await fetch('/api/tv/vincular', { method: 'POST', body: JSON.stringify({ codigo: cod, sala: codigo }) });
        const d = (await r.json()) as { ok: boolean; tvId?: string; nombre?: string };
        if (!d.ok || !d.tvId) throw new Error('codigo');
        guardarTvs([{ tvId: d.tvId, nombre: d.nombre || 'TV' }, ...tvs.filter((t) => t.tvId !== d.tvId)]);
        setEstado('ok');
        setMensaje(`¡Listo! ${d.nombre || 'La TV'} ya está entrando a la sala.`);
        vibrar([20, 40, 80]);
        sonar.toque();
      } catch {
        setEstado('mal');
        setMensaje('Ese código no es de ninguna TV encendida.');
        vibrar([30, 40, 30]);
        if (caja.current) gsap.fromTo(caja.current, { x: -12 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.25)' });
        setTimeout(() => (setLetras(''), setEstado('idle')), 900);
      }
    },
    [codigo, tvs], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const escribir = (v: string) => {
    const l = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    setLetras(l);
    setEstado('idle');
    if (l.length === 4) void vincular(l);
  };

  const llamar = async (t: TvGuardada) => {
    vibrar(15);
    const r = await fetch('/api/tv/llamar', { method: 'POST', body: JSON.stringify({ tvId: t.tvId, sala: codigo }) }).catch(() => null);
    if (r?.ok) {
      setEstado('ok');
      setMensaje(`${t.nombre} ya está entrando a la sala.`);
    } else {
      setEstado('mal');
      setMensaje(`${t.nombre} está apagada. Ábrela en la dirección del juego y reintenta.`);
    }
  };

  const renombrar = (t: TvGuardada) => {
    const nombre = prompt('Nombre de la TV', t.nombre)?.trim().slice(0, 24);
    if (!nombre) return;
    guardarTvs(tvs.map((x) => (x.tvId === t.tvId ? { ...x, nombre } : x)));
    void fetch('/api/tv/nombre', { method: 'POST', body: JSON.stringify({ tvId: t.tvId, nombre }) });
  };

  return (
    <div className="conectar-tv">
      {tvs.length > 0 && (
        <>
          <span className="ctv-rotulo">Tus TVs</span>
          {tvs.map((t) => (
            <div className="ctv-tele" key={t.tvId} data-on={enLinea[t.tvId] ? '1' : '0'}>
              <button className="ctv-llamar" onClick={() => void llamar(t)}>
                <i />
                <span>
                  <b>{t.nombre}</b>
                  <small>{enLinea[t.tvId] ? 'Encendida · toca para mandarla a esta sala' : 'Apagada o fuera del juego'}</small>
                </span>
              </button>
              <button className="ctv-mini" onClick={() => renombrar(t)} aria-label="Renombrar">
                <IconoLapiz />
              </button>
              <button className="ctv-mini" onClick={() => guardarTvs(tvs.filter((x) => x.tvId !== t.tvId))} aria-label="Desvincular">
                <IconoCerrar />
              </button>
            </div>
          ))}
        </>
      )}
      <span className="ctv-rotulo">{tvs.length ? 'Vincular otra TV' : 'Vincular una TV'}</span>
      <p className="ctv-ayuda">
        En la tele abre <b>{location.host}/tv</b> y escribe acá el código de 4 letras que aparece, o escanea su QR.
      </p>
      <div className="ctv-codigo" ref={caja} data-estado={estado}>
        {[0, 1, 2, 3].map((i) => (
          <b key={i} data-lleno={letras[i] ? '1' : '0'}>
            {letras[i] ?? ''}
          </b>
        ))}
        <input value={letras} onChange={(e) => escribir(e.target.value)} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={4} aria-label="Código de la TV" />
      </div>
      {hayCamara() &&
        (camara ? (
          <Escaner
            cerrar={() => setCamara(false)}
            alLeer={(texto) => {
              // El QR de la tele apunta a /v/ABCD.
              const m = texto.match(/\/v\/([A-Za-z]{4})\b/) ?? texto.match(/^([A-Za-z]{4})$/);
              if (!m) return false;
              setCamara(false);
              escribir(m[1]);
              return true;
            }}
          />
        ) : (
          <button className="ctv-escanear" onClick={() => (vibrar(10), setCamara(true))}>
            Escanear el QR de la tele
          </button>
        ))}
      {mensaje && (
        <p className="ctv-mensaje" data-estado={estado} key={mensaje}>
          {mensaje}
        </p>
      )}
    </div>
  );
}

// ───────────── Hoja inferior ─────────────

function Hoja({ on, titulo, cerrar, children }: { on: boolean; titulo: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="hoja" data-on={on ? '1' : '0'} aria-hidden={!on}>
      <div className="hoja-velo" onClick={cerrar} />
      <div className="hoja-panel" role="dialog" aria-label={titulo}>
        <header>
          <b>{titulo}</b>
          <button onClick={cerrar} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="hoja-cuerpo">{children}</div>
      </div>
    </div>
  );
}

// ───────────── Juego ─────────────

function Juego({ sala, s, yo, anfitrion }: { sala: Sala; s: EstadoPublico; yo: JugadorSala; anfitrion: boolean }) {
  const fx = useRef<FxApi>(null);
  const ancho = usePantallaAncha();
  const [tic, setTic] = useState<Tic>({ tension: 0, cuenta: 0 });
  const [hoja, setHoja] = useState<'equipo' | 'saldos' | 'historial' | 'menu' | 'tv' | 'tema' | 'monto' | null>(null);
  const [verA, setVerA] = useState(yo.id);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const carta = s.carta;
  const r = s.ronda;
  const enPuja = s.fase === 'puja' || s.fase === 'ultima';
  const pendiente = !!r?.pendientes.includes(yo.id);
  const lidero = carta?.liderId === yo.id;
  const siguiente = (carta?.precio ?? 0) + s.ajustes.incremento;
  const alcanza = siguiente <= yo.tope;
  const puedeOfertar = enPuja && pendiente && !lidero && alcanza && !s.pausa;
  const puedeSaltear = s.fase === 'puja' && pendiente && !carta?.liderId && (r?.sobran ?? 0) > 0 && yo.skips > 0 && !s.pausa;

  useEffect(
    () =>
      sala.alEvento((ev) => {
        if (ev.e === 'rechazo' && ev.pid === yo.id) {
          setAviso((a) => ({ texto: RECHAZO[ev.motivo], n: (a?.n ?? 0) + 1 }));
          vibrar([30, 50, 30]);
          sonar.rechazo();
          if (boton.current) gsap.fromTo(boton.current, { x: -9 }, { x: 0, duration: 0.45, ease: 'elastic.out(1.2, 0.25)' });
        } else if (ev.e === 'oferta') {
          if (ev.pid === yo.id) vibrar(22);
          else if (carta?.liderId === yo.id || ev.pid !== yo.id) vibrar(8);
        }
      }),
    [sala, yo.id, carta?.liderId],
  );

  // Si la carta cambia o se cierra la puja, la hoja de cifra libre se cierra sola.
  useEffect(() => setHoja((h) => (h === 'monto' ? null : h)), [carta?.uid, enPuja]);

  // El anfitrión muestra (u oculta) los equipos y saldos a todos.
  useEffect(() => {
    if (s.panel) setHoja('equipo');
    else setHoja((h) => (h === 'equipo' ? null : h));
  }, [s.panel, anfitrion]);

  // Me la llevé: festejo.
  useEffect(() => {
    if (s.fase === 'martillo' && carta?.compradorId === yo.id) vibrar([60, 40, 60, 40, 160]);
  }, [s.fase, carta?.compradorId, yo.id]);

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 1600);
    return () => clearTimeout(id);
  }, [aviso]);

  const ofertar = () => {
    if (!carta) return;
    vibrar(12);
    sala.enviar({ t: 'ofertar', uid: carta.uid });
  };

  const alTocarRef = useRef<() => void>(() => {});
  const alTocar = () => {
    if (puedeOfertar) return ofertar();
    // Tocó cuando ya había caído el martillo: el servidor lo rechaza por tarde (y el ticker se burla).
    if (carta && s.fase === 'martillo' && carta.compradorId && carta.compradorId !== yo.id && !yo.equipo[r?.hueco ?? -1]) sala.enviar({ t: 'ofertar', uid: carta.uid });
  };

  // En PC o iPad con teclado: la barra espaciadora oferta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || document.activeElement !== document.body) return;
      e.preventDefault();
      alTocarRef.current();
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);

  alTocarRef.current = alTocar;

  const alVolar = useCallback((origen: DOMRect, img: string, pid: string) => {
    const chip = raiz.current?.querySelector<HTMLElement>(pid === yo.id ? '[data-destino="equipo"]' : `[data-chip="${pid}"]`);
    const destino = chip?.getBoundingClientRect();
    if (!chip || !destino) return;
    const el = document.createElement('div');
    el.className = 'ficha-vuela';
    el.style.cssText = `left:${origen.left}px;top:${origen.top}px;width:${origen.width}px;height:${origen.height}px;`;
    el.innerHTML = `<img src="${img}" alt="">`;
    document.body.appendChild(el);
    const lado = Math.min(destino.width, destino.height);
    gsap
      .timeline({ onComplete: () => el.remove() })
      .to(el, { clipPath: 'circle(34% at 50% 42%)', duration: 0.3, ease: 'power2.out' }, 0)
      .to(el, { x: destino.left + destino.width / 2 - (origen.left + origen.width / 2), y: destino.top + destino.height / 2 - (origen.top + origen.height * 0.42), scale: (lado / origen.width) * 2, duration: 0.7, ease: 'power3.inOut' }, 0.08)
      .to(el, { opacity: 0, duration: 0.12 }, 0.7)
      .add(() => void gsap.fromTo(chip.querySelector('.avatar') ?? chip.querySelector('i') ?? chip, { scale: 1.6 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' }), 0.72);
  }, [yo.id]);

  // Texto del botón principal según la situación.
  const comprada = r ? yo.equipo[r.hueco] : null;
  let rotulo = 'Ofertar';
  let bajada = carta ? `$${siguiente}M` : '';
  let modo: 'activo' | 'lider' | 'listo' | 'seco' | 'espera' = 'activo';
  if (s.pausa) (rotulo = 'Pausa'), (bajada = 'El anfitrión detuvo la subasta'), (modo = 'espera');
  else if (!r || s.fase === 'intro') (rotulo = 'Barajando'), (bajada = 'Se viene el remate'), (modo = 'espera');
  else if (s.fase === 'ronda') (rotulo = POS_NOMBRE[r.pos]), (bajada = `Ronda ${r.indice + 1} de ${r.total}`), (modo = 'espera');
  else if (s.fase === 'finronda') (rotulo = 'Ronda cerrada'), (bajada = 'Ya viene la próxima'), (modo = 'espera');
  else if (!pendiente && !(carta?.compradorId === yo.id && s.fase !== 'revela')) (rotulo = 'Ya compraste'), (bajada = comprada ? `${comprada.apellido || comprada.nombre} · $${comprada.pagado}M` : 'Mira cómo se pelean'), (modo = 'listo');
  else if (carta?.compradorId === yo.id) (rotulo = '¡Es tuyo!'), (bajada = `Pagaste $${carta.pagado}M`), (modo = 'lider');
  else if (s.fase === 'presenta') (rotulo = 'Atento'), (bajada = `Sale en $${carta?.precioMinimo}M`), (modo = 'espera');
  else if (s.fase === 'ruleta') (rotulo = 'Ruleta'), (bajada = 'Que no te toque… o sí'), (modo = 'espera');
  else if (s.fase === 'martillo' || s.fase === 'revela') (rotulo = carta?.desenlace === 'pasa' ? 'Pasó' : carta?.desenlace === 'salteada' ? 'Salteada' : 'Vendido'), (bajada = 'A ver quién era…'), (modo = 'espera');
  else if (lidero) (rotulo = 'Vas ganando'), (bajada = `$${carta?.precio}M · aguanta`), (modo = 'lider');
  else if (!alcanza) (rotulo = 'No te alcanza'), (bajada = `Tu tope es $${yo.tope}M`), (modo = 'seco');

  const quedan = r ? r.cartas.filter((c) => c.estado === 'espera' || c.estado === 'actual').length : 0;
  const visto = s.jugadores.find((j) => j.id === verA) ?? yo;

  return (
    <div className="m-juego" ref={raiz} data-modo={modo} style={{ '--yo': yo.color } as CSSProperties}>
      <header className="j-cab">
        <div className="j-ronda" key={r?.indice ?? -1}>
          {r ? (
            <>
              <span>
                Ronda <b className="num">{r.indice + 1}</b>
                <i className="num">/{r.total}</i>
              </span>
              <em>{POS_NOMBRE[r.pos]}</em>
            </>
          ) : (
            <em>Preparando la subasta</em>
          )}
        </div>
        {anfitrion && (
          <>
            <button className="j-host" data-on={s.pausa ? '1' : '0'} onClick={() => (vibrar(12), sala.enviar({ t: 'pausa', on: !s.pausa }))}>
              {s.pausa ? 'Seguir' : 'Pausa'}
            </button>
            <button className="j-host" data-on={s.panel ? '1' : '0'} onClick={() => (vibrar(12), sala.enviar({ t: 'panel', on: !s.panel }))}>
              {s.panel ? 'Ocultar' : 'Equipos'}
            </button>
          </>
        )}
        <BotonPantalla corto className="j-pantalla" />
        <button className="j-menu" onClick={() => setHoja('menu')} aria-label="Menú">
          <i />
          <i />
          <i />
        </button>
      </header>

      <div className="j-rivales">
        {s.jugadores.map((j) => {
          const lider = carta?.liderId === j.id && enPuja;
          return (
            <button
              className="rival"
              key={j.id}
              data-chip={j.id}
              data-lider={lider ? '1' : '0'}
              data-pendiente={r?.pendientes.includes(j.id) ? '1' : '0'}
              data-yo={j.id === yo.id ? '1' : undefined}
              style={{ '--c': j.color } as CSSProperties}
              onClick={() => (setVerA(j.id), setHoja('equipo'))}
            >
              <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
              <span className="rival-n">{j.id === yo.id ? 'Tú' : j.nombre}</span>
              <span className="rival-s num">
                <Numero valor={j.saldo} prefijo="$" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="j-escena">
        <Escena sala={sala} s={s} tic={tic} fx={fx} compacta={!ancho} alVolar={alVolar} />
        {s.fase === 'ruleta' && <Ruleta sala={sala} s={s} compacta />}
        <div className="j-cartel" data-on={s.fase === 'ronda' || s.fase === 'intro' || s.fase === 'finronda' ? '1' : '0'}>
          <Fondo paleta="oscuro" vel={1.6} />
          <div key={`${s.fase}-${r?.indice}`}>
            {s.fase === 'intro' && (
              <>
                <span>Barajando el mazo</span>
                <b>Se viene el remate</b>
                <small>Mira la tele… o no parpadees</small>
              </>
            )}
            {s.fase === 'ronda' && r && (
              <>
                <span>
                  Ronda {r.indice + 1}/{r.total}
                </span>
                <b>{POS_NOMBRE[r.pos]}</b>
                <small>
                  {r.cartas.length} cartas · {s.jugadores.length} compradores
                </small>
              </>
            )}
            {s.fase === 'finronda' && r && (
              <>
                <span>Ronda cerrada</span>
                <b>{yo.equipo[r.hueco] ? yo.equipo[r.hueco]!.apellido || yo.equipo[r.hueco]!.nombre : POS_NOMBRE[r.pos]}</b>
                <small>{yo.equipo[r.hueco] ? `Tu ${POS_NOMBRE[r.pos].toLowerCase()} por $${yo.equipo[r.hueco]!.pagado}M` : ''}</small>
              </>
            )}
          </div>
        </div>
        <Fx ref={fx} />
      </div>

      <div className="j-progreso">
        <div className="j-cartas">
          {r?.cartas.map((c, i) => {
            const comprador = s.jugadores.find((j) => j.id === c.compradorId);
            return <i key={i} data-estado={c.estado} style={{ '--c': comprador?.color } as CSSProperties} />;
          })}
        </div>
        <span>
          Quedan <b className="num">{quedan}</b> de <b className="num">{r?.cartas.length ?? 0}</b>
        </span>
        <span>
          Faltan <b className="num">{r?.pendientes.length ?? 0}</b>
        </span>
        <span data-cero={r?.sobran === 0 ? '1' : '0'}>
          Descartes <b className="num">{r?.sobran ?? 0}</b>
        </span>
      </div>

      <div className="j-accion">
        <div className="j-reloj">
          <Reloj sala={sala} activo={enPuja} vence={carta?.vence ?? 0} duracion={enPuja ? (carta?.duracion ?? 1) : s.ajustes.segundos * 1000} pausaResto={s.pausa ? s.pausaResto : undefined} alTic={setTic} sonido={sonidoPreferido()} />
        </div>
        <button ref={boton} className="ofertar" data-modo={modo} aria-disabled={!puedeOfertar} onPointerDown={alTocar}>
          <span className="ofertar-cara">
            <b>{rotulo}</b>
            <small className={modo === 'activo' || modo === 'lider' ? 'num' : ''}>{bajada}</small>
          </span>
        </button>
        <button className="j-monto" aria-disabled={!puedeOfertar} onClick={() => puedeOfertar && (vibrar(10), setHoja('monto'))}>
          <b>$?</b>
          <small>Otra cifra</small>
        </button>
        {aviso && (
          <div className="j-aviso" key={aviso.n}>
            {aviso.texto}
          </div>
        )}
      </div>

      <div className="j-pie">
        <div className="j-saldo">
          <span>Tu saldo</span>
          <b className="num">
            <Numero valor={yo.saldo} prefijo="$" sufijo="M" />
          </b>
          <small>
            tope <i className="num">${yo.tope}M</i>
          </small>
        </div>
        <button className="j-skip" disabled={!puedeSaltear} onClick={() => carta && (vibrar(18), sala.enviar({ t: 'saltear', uid: carta.uid }))}>
          Saltear
          <i className="num">{yo.skips}</i>
        </button>
        <button className="j-tab" data-destino="equipo" onClick={() => (setVerA(yo.id), setHoja('equipo'))}>
          Equipo
          <i className="num">{cuentaEquipo(yo)}/11</i>
        </button>
        <button className="j-tab" onClick={() => setHoja('historial')}>
          Compras
        </button>
      </div>
      <Ticker mensajes={s.ticker} pausa={s.fase === 'martillo' || s.fase === 'revela'} alto={32} />

      <Hoja on={hoja === 'equipo'} titulo={visto.id === yo.id ? 'Tu equipo' : `Equipo de ${visto.nombre}`} cerrar={() => setHoja(null)}>
        <div className="hoja-equipo">
          <div className="equipo-quien">
            {s.jugadores.map((j) => (
              <button key={j.id} data-on={j.id === visto.id ? '1' : '0'} style={{ '--c': j.color } as CSSProperties} onClick={() => setVerA(j.id)}>
                <Avatar src={j.avatar} color={j.color} />
              </button>
            ))}
          </div>
          <div className="equipo-datos" style={{ '--c': visto.color } as CSSProperties}>
            <span>
              Saldo <b className="num">${visto.saldo}M</b>
            </span>
            <span>
              Equipo <b className="num">{cuentaEquipo(visto)}/11</b>
            </span>
            <span>
              Skips <b className="num">{visto.skips}</b>
            </span>
          </div>
          {hoja === 'equipo' && <CanchaMedida equipo={visto.equipo} color={visto.color} huecoActivo={r?.pendientes.includes(visto.id) ? r.hueco : undefined} />}
        </div>
      </Hoja>

      <Hoja on={hoja === 'monto'} titulo="Ofertar otra cifra" cerrar={() => setHoja(null)}>
        {hoja === 'monto' && carta && <OfertaLibre precio={carta.precio} incremento={s.ajustes.incremento} tope={yo.tope} enviar={(monto) => (vibrar(25), sala.enviar({ t: 'ofertar', uid: carta.uid, monto }), setHoja(null))} />}
      </Hoja>
      <Hoja on={hoja === 'historial'} titulo="Compras" cerrar={() => setHoja(null)}>
        <div className="hoja-historial">
          {[...s.historial].reverse().map((h) => {
            const j = s.jugadores.find((x) => x.id === h.compradorId);
            return (
              <div className="hh-fila" key={h.carta.uid} data-sin={j ? undefined : '1'} style={{ '--c': j?.color } as CSSProperties}>
                <span className="historial-foto">
                  <img src={h.carta.img} alt="" />
                </span>
                <span className="historial-nombre">
                  <b>{h.carta.apellido || h.carta.nombre}</b>
                  <i>
                    {h.carta.pos} · {j ? j.nombre : h.desenlace === 'salteada' ? 'salteada' : 'nadie la quiso'}
                    {h.desenlace === 'obligado' ? ' · obligado' : h.desenlace === 'ruleta' ? ' · ruleta' : ''}
                  </i>
                </span>
                {h.precio != null && <em className="num">${h.precio}M</em>}
              </div>
            );
          })}
          {s.historial.length === 0 && <p className="hoja-vacio">Todavía no salió ninguna carta.</p>}
        </div>
      </Hoja>

      <Hoja on={hoja === 'menu'} titulo={`Sala ${s.codigo}`} cerrar={() => setHoja(null)}>
        <div className="hoja-menu">
          {anfitrion && (
            <button className="btn btn--acento" onClick={() => (sala.enviar({ t: 'pausa', on: !s.pausa }), setHoja(null))}>
              {s.pausa ? 'Reanudar la subasta' : 'Pausar la subasta'}
            </button>
          )}
          {anfitrion && (
            <button className="btn" onClick={() => setHoja('tv')}>
              Conectar TV
            </button>
          )}
          <button className="btn" onClick={() => setHoja('tema')}>
            Cambiar escenario
          </button>
          {anfitrion && (
            <button className="btn btn-peligro" onClick={() => confirm('¿Terminar la partida ahora? Se muestran los resultados con lo que cada uno tiene.') && (sala.enviar({ t: 'terminar' }), setHoja(null))}>
              Terminar partida
            </button>
          )}
          <button className="btn" onClick={(e) => confirm('¿Salir de la sala? Tu equipo se pierde.') && (sala.enviar({ t: 'salir' }), void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } }))}>
            Salir de la sala
          </button>
          <BotonPantalla className="btn-pantalla--menu" />
          <BotonSonido />
          {anfitrion && (
            <div className="menu-expulsar">
              <span>Sacar a alguien de la sala</span>
              {s.jugadores
                .filter((j) => j.id !== yo.id)
                .map((j) => (
                  <button key={j.id} style={{ '--c': j.color } as CSSProperties} onClick={() => confirm(`¿Sacar a ${j.nombre}?`) && sala.enviar({ t: 'expulsar', pid: j.id })}>
                    <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
                    {j.nombre}
                    <i>{j.conectado ? 'sacar' : 'sin señal · sacar'}</i>
                  </button>
                ))}
            </div>
          )}
        </div>
      </Hoja>
      <Hoja on={hoja === 'tv'} titulo="Conectar TV" cerrar={() => setHoja(null)}>
        {hoja === 'tv' && <ConectarTV codigo={s.codigo} />}
      </Hoja>
      <Hoja on={hoja === 'tema'} titulo="Escenario" cerrar={() => setHoja(null)}>
        <SelectorTema sala={sala} s={s} anfitrion={anfitrion} />
      </Hoja>
    </div>
  );
}

function BotonSonido() {
  const [on, setOn] = useState(sonidoPreferido());
  return (
    <button className="btn" onClick={() => (setOn(!on), void activarSonido(!on))}>
      {on ? 'Sonido: activado' : 'Sonido: silencio'}
    </button>
  );
}

// ───────────── Final ─────────────

function Final({ sala, s, yo, anfitrion }: { sala: Sala; s: EstadoPublico; yo: JugadorSala; anfitrion: boolean }) {
  const fx = useRef<FxApi>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const f = s.final;
  const puestos = f ? f.puestos.map((p) => ({ ...p, j: s.jugadores.find((j) => j.id === p.pid)! })).filter((p) => p.j) : [];
  const miPuesto = puestos.findIndex((p) => p.pid === yo.id) + 1;
  const vista = useEquipoEnPantalla(sala, s);
  // Lo que se muestra en la TV manda; quien no es anfitrión puede mirar otro equipo tocándolo (solo en su pantalla).
  const [propio, setPropio] = useState<string | null>(null);
  useEffect(() => setPropio(null), [vista.pid]);
  const verA = (anfitrion ? vista.pid : (propio ?? vista.pid)) ?? yo.id;
  const setVerA = (pid: string) => {
    if (anfitrion) sala.enviar({ t: 'verEquipo', pid: s.finalVista === pid ? null : pid });
    else setPropio(pid);
  };
  const visto = s.jugadores.find((j) => j.id === verA) ?? yo;

  useLayoutEffect(() => {
    if (!raiz.current) return;
    const q = gsap.utils.selector(raiz.current);
    const t = gsap.timeline();
    t.from(q('.f-titulo > *'), { yPercent: 120, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0.15)
      .from([...q('.f-fila')].reverse(), { xPercent: -40, opacity: 0, duration: 0.45, ease: 'expo.out', stagger: 0.28 }, 0.6)
      .add(() => {
        if (miPuesto === 1) {
          fx.current?.confeti([yo.color, '#fff', '#ffe27a'], 160);
          vibrar([80, 60, 80, 60, 240]);
          sonar.fanfarria();
        }
      })
      .from(q('.f-resto > *'), { y: 30, opacity: 0, duration: 0.5, ease: 'expo.out', stagger: 0.08 }, '>-0.1');
    return () => void t.kill();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) return null;
  return (
    <div className="m-final" ref={raiz}>
      <Fondo paleta={miPuesto === 1 ? 'oro' : 'oscuro'} />
      <div className="f-scroll">
        <div className="f-titulo" data-campeon={miPuesto === 1 ? "1" : "0"}>
          <span>Se bajó el martillo</span>
          <h1 data-largo={miPuesto === puestos.length && miPuesto !== 1 ? '1' : undefined}>{miPuesto === 1 ? '¡Campeón!' : miPuesto === puestos.length ? 'Descendiste' : `Puesto ${miPuesto}`}</h1>
        </div>
        <div className="f-tabla">
          {puestos.map((p, i) => (
            <button className="f-fila" key={p.pid} data-puesto={i + 1} data-on={verA === p.pid ? '1' : '0'} style={{ '--c': p.j.color } as CSSProperties} onClick={() => setVerA(p.pid)}>
              <b className="num">{i + 1}</b>
              <Avatar src={p.j.avatar} color={p.j.color} />
              <span>{p.j.nombre}</span>
              <em className="num">{p.puntos}</em>
            </button>
          ))}
        </div>
        <div className="f-resto">
          <h3 style={{ '--c': visto.color } as CSSProperties}>
            Equipo de <b>{visto.id === yo.id ? 'ti' : visto.nombre}</b>
          </h3>
          <CanchaMedida equipo={visto.equipo} color={visto.color} />
          <p className="f-nota f-rota">
            {anfitrion
              ? s.finalVista
                ? 'Lo elegiste tú: tócalo de nuevo para volver a la rotación automática.'
                : 'Toca un jugador para mostrar su equipo en la TV y en todos los celulares. Si no, cambia solo cada 15 s.'
              : vista.auto
                ? 'Los equipos van cambiando cada 15 s. Toca uno para verlo tú.'
                : 'El anfitrión está mostrando este equipo.'}
          </p>
          <h3>Premios de la noche</h3>
          {f.premios.map((pr) => {
            const j = s.jugadores.find((x) => x.id === pr.pid);
            return (
              <div className="f-premio" key={pr.clave} style={{ '--c': j?.color } as CSSProperties}>
                <b>{pr.titulo}</b>
                <p>{pr.detalle}</p>
              </div>
            );
          })}
          {anfitrion ? (
            <button className="btn btn--acento f-revancha" onClick={() => sala.enviar({ t: 'revancha' })}>
              Jugar la revancha
            </button>
          ) : (
            <p className="f-nota">El anfitrión puede armar la revancha.</p>
          )}
        </div>
      </div>
      <Ticker mensajes={s.ticker} alto={32} />
      <Fx ref={fx} />
    </div>
  );
}

// ───────────── Oferta con cifra elegida ─────────────

function OfertaLibre({ precio, incremento, tope, enviar }: { precio: number; incremento: number; tope: number; enviar: (monto: number) => void }) {
  const minimo = precio + incremento;
  const [monto, setMonto] = useState(Math.min(tope, precio + 10));
  const valido = monto >= minimo && monto <= tope;
  return (
    <div className="oferta-libre">
      <p>
        Va en <b className="num">${precio}M</b>. Tu tope es <b className="num">${tope}M</b>.
      </p>
      <div className="ol-cifra">
        <button onClick={() => setMonto((m) => Math.max(minimo, m - 5))} aria-label="Restar 5">
          -5
        </button>
        <label>
          <span>$</span>
          <input className="num" type="number" inputMode="numeric" value={monto} min={minimo} max={tope} onChange={(e) => setMonto(Math.round(Number(e.target.value) || 0))} />
          <span>M</span>
        </label>
        <button onClick={() => setMonto((m) => Math.min(tope, m + 5))} aria-label="Sumar 5">
          +5
        </button>
      </div>
      <div className="ol-saltos">
        {[10, 25, 50, 100].map((n) => (
          <button key={n} disabled={precio + n > tope} onClick={() => setMonto(Math.min(tope, precio + n))}>
            +{n}
          </button>
        ))}
      </div>
      <button className="btn btn--acento ol-enviar" disabled={!valido} onClick={() => enviar(monto)}>
        {monto < minimo ? `Mínimo $${minimo}M` : monto > tope ? 'No te alcanza' : `Ofertar $${monto}M`}
      </button>
    </div>
  );
}

/** PC o iPad en horizontal: se usa el diseño a dos columnas (escena grande + controles). */
export const CONSULTA_ANCHA = '(min-width: 900px) and (min-aspect-ratio: 4/3)';
function usePantallaAncha() {
  const [ancho, setAncho] = useState(() => matchMedia(CONSULTA_ANCHA).matches);
  useEffect(() => {
    const m = matchMedia(CONSULTA_ANCHA);
    const f = () => setAncho(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return ancho;
}
