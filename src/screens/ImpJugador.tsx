// Celular del Impostor: entrar, lobby con la configuración, la carta secreta, la votación, la adivinanza y la tabla.
import { CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { AjustesImp, EstadoImp, JugadorImpVista, MsgClienteImp } from '../../shared/impostor';
import { LIMITES_IMP, MAX_IMP, MIN_DOS_IMPOSTORES, MIN_IMP, PUNTOS_IMP } from '../../shared/impostor';
import { Avatar, BotonPantalla, Fondo } from '../components/comunes';
import { CartaSecreto, Cuenta, DIFICULTAD_TEXTO, ImagenSecreto, MOTIVO_TEXTO, Tabla, ordenTabla } from '../components/impostor';
import { Fx, FxApi } from '../components/Fx';
import { irConTelon } from '../lib/ruta';
import { Sala, VistaSala, useSala } from '../lib/sala';
import { desbloquearSonido, sonar } from '../lib/sonido';
import { guardar, leer, vibrar } from '../lib/util';
import { Cargando, SinSala } from './Escenario';
import { AvatarDato, BotonConfirmar, Capa, ConectarTV, Hoja, Paso, QrGrande, QrSala, SelectorTema } from './Jugador';

type SalaImp = Sala<EstadoImp, MsgClienteImp>;

export function ImpJugador({ codigo }: { codigo: string }) {
  const [sala, vista] = useSala<EstadoImp, MsgClienteImp>(codigo, 'jugador');
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
          <span>Sospechoso hasta el final.</span>
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
    <div className="pantalla movil imp" data-pantalla={pantalla}>
      <Capa on={pantalla === 'entrar'}>{pantalla === 'entrar' && <Entrar sala={sala} s={s} vista={vista} />}</Capa>
      <Capa on={pantalla === 'lobby'}>{pantalla === 'lobby' && yo && <Lobby sala={sala} s={s} yo={yo} anfitrion={vista.anfitrion} />}</Capa>
      <Capa on={pantalla === 'juego'}>{pantalla === 'juego' && yo && <Juego sala={sala} s={s} yo={yo} anfitrion={vista.anfitrion} />}</Capa>
      <Capa on={pantalla === 'final'}>{pantalla === 'final' && yo && <Final sala={sala} s={s} yo={yo} anfitrion={vista.anfitrion} />}</Capa>
      <div className="m-reconecta" data-on={vista.conexion === 'reconectando' ? '1' : '0'} aria-hidden={vista.conexion !== 'reconectando'}>
        <i />
        Reconectando… tu lugar está guardado
      </div>
    </div>
  );
}

// ───────────── Entrar ─────────────

function Entrar({ sala, s, vista }: { sala: SalaImp; s: EstadoImp; vista: VistaSala<EstadoImp> }) {
  const [nombre, setNombre] = useState(leer('nombre', ''));
  const [avatares, setAvatares] = useState<AvatarDato[]>([]);
  const [avatar, setAvatar] = useState(leer('avatar', ''));
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch('/api/datos')
      .then((r) => r.json())
      .then((d: { avatares: AvatarDato[] }) => {
        setAvatares(d.avatares);
        setAvatar((a) => (a && d.avatares.some((x) => x.foto === a) ? a : (d.avatares[Math.floor(Math.random() * d.avatares.length)]?.foto ?? '')));
      })
      .catch(() => {});
  }, []);

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
      <Fondo paleta="troll" />
      <form ref={form} className="entrar-caja" onSubmit={enviar}>
        <span className="entrar-sala">
          El Impostor · Sala <b>{s.codigo}</b>
        </span>
        {yaEmpezo ? (
          <>
            <h1>Ya arrancó</h1>
            <p className="entrar-nota">La partida está en marcha. Puedes mirarla o esperar la revancha.</p>
            <button type="button" className="btn btn--acento" onClick={(e) => void irConTelon(`/stage/${s.codigo}`, { origen: { x: e.clientX, y: e.clientY } })}>
              Mirar la partida
            </button>
          </>
        ) : (
          <>
            <h1>¿Quién eres?</h1>
            <input className="entrar-nombre" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 14))} placeholder="Tu nombre" autoComplete="off" autoCapitalize="words" enterKeyHint="go" maxLength={14} />
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

function Lobby({ sala, s, yo, anfitrion }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista; anfitrion: boolean }) {
  const [hoja, setHoja] = useState<'config' | 'tv' | 'tema' | 'como' | 'qr' | null>(null);
  const url = `${location.origin}/r/${s.codigo}`;
  const compartir = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'El Impostor', text: `Entra a mi partida del Impostor: sala ${s.codigo}`, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelado */
    }
  };
  const pocos = s.jugadores.length < MIN_IMP;
  const a = s.ajustes;
  return (
    <div className="m-lobby">
      <Fondo paleta="troll" />
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
        <div className="imp-lobby-titulo">
          <b>El Impostor</b>
          <span>{a.modo === 'clubes' ? 'Versión clubes' : 'Versión futbolistas'}</span>
        </div>
        <button className="imp-resumen" onClick={() => setHoja('config')}>
          <span>
            <b className="num">{a.rondas}</b> {a.rondas === 1 ? 'ronda' : 'rondas'}
          </span>
          <span>{DIFICULTAD_TEXTO[a.dificultad]}</span>
          <span>
            <b className="num">{a.impostores === 2 && s.jugadores.length >= MIN_DOS_IMPOSTORES ? 2 : 1}</b> impostor{a.impostores === 2 && s.jugadores.length >= MIN_DOS_IMPOSTORES ? 'es' : ''}
          </span>
          <span>
            <b className="num">{a.debate}</b> s para hablar
          </span>
          {a.tragos && (
            <span className="imp-resumen-trago">
              <img src="/img/iconos/trago.webp" alt="" /> Tragos
            </span>
          )}
        </button>
        <QrSala codigo={s.codigo} agrandar={() => setHoja('qr')} />
        <h2>
          En la sala <b className="num">{s.jugadores.length}</b>
          <i className="num">/{MAX_IMP}</i>
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
          <button className="btn" onClick={() => setHoja('config')}>
            {anfitrion ? 'Configurar partida' : 'Ver configuración'}
          </button>
          <button className="btn" onClick={() => setHoja('como')}>
            Cómo se juega
          </button>
          {anfitrion && (
            <button className="btn" onClick={() => setHoja('tv')}>
              Conectar TV
            </button>
          )}
          <button className="btn" onClick={() => setHoja('tema')}>
            Escenario
          </button>
          <BotonConfirmar className="btn" etiqueta="Salir de la sala" aviso="¿Seguro? Toca otra vez para salir" alConfirmar={(e) => (sala.enviar({ t: 'salir' }), void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } }))} />
          <BotonPantalla className="btn-pantalla--lobby" />
        </div>
      </div>

      <footer className="lobby-pie">
        {anfitrion ? (
          <>
            <button className="btn btn--acento lobby-empezar" disabled={pocos} onClick={() => (vibrar([20, 30, 60]), sala.enviar({ t: 'empezar' }))}>
              {pocos ? 'Faltan participantes' : 'Empezar'}
            </button>
            <span>{pocos ? `Hacen falta al menos ${MIN_IMP}` : `${s.disponibles} ${a.modo === 'clubes' ? 'clubes' : 'futbolistas'} posibles`}</span>
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

      <Hoja on={hoja === 'config'} titulo="Configurar partida" cerrar={() => setHoja(null)}>
        <Configurar sala={sala} s={s} editable={anfitrion} />
      </Hoja>
      <Hoja on={hoja === 'como'} titulo="Cómo se juega" cerrar={() => setHoja(null)}>
        <ComoSeJuega a={a} />
      </Hoja>
      <Hoja on={hoja === 'tv'} titulo="Conectar TV" cerrar={() => setHoja(null)}>
        {hoja === 'tv' && <ConectarTV codigo={s.codigo} />}
      </Hoja>
      <Hoja on={hoja === 'qr'} titulo="Invitar a la sala" cerrar={() => setHoja(null)}>
        <QrGrande codigo={s.codigo} />
      </Hoja>
      <Hoja on={hoja === 'tema'} titulo="Escenario" cerrar={() => setHoja(null)}>
        <SelectorTema sala={sala} s={s} anfitrion={anfitrion} />
      </Hoja>
    </div>
  );
}

function Opciones<T extends string | number>({ valor, opciones, cambiar, editable }: { valor: T; opciones: [T, string][]; cambiar: (v: T) => void; editable: boolean }) {
  return (
    <div className="imp-seg" role="radiogroup">
      {opciones.map(([v, t]) => (
        <button key={String(v)} role="radio" aria-checked={valor === v} data-on={valor === v ? '1' : '0'} disabled={!editable} onClick={() => (vibrar(8), cambiar(v))}>
          {t}
        </button>
      ))}
    </div>
  );
}

function Configurar({ sala, s, editable }: { sala: SalaImp; s: EstadoImp; editable: boolean }) {
  const a = s.ajustes;
  const poner = (p: Partial<AjustesImp>) => sala.enviar({ t: 'ajustes', ajustes: p });
  return (
    <div className="reglas imp-config">
      <div className="regla regla--bloque">
        <span>
          Qué se esconde
          <small>Un futbolista con su foto o un club con su escudo</small>
        </span>
        <Opciones valor={a.modo} opciones={[['jugadores', 'Futbolistas'], ['clubes', 'Clubes']]} cambiar={(modo) => poner({ modo })} editable={editable} />
      </div>
      <div className="regla regla--bloque">
        <span>
          Dificultad
          <small>{a.dificultad === 1 ? 'Solo los que conoce hasta tu abuela' : a.dificultad === 2 ? 'Conocidos para cualquier futbolero' : 'Cualquiera de la base: para los que saben'}</small>
        </span>
        <Opciones valor={a.dificultad} opciones={[[1, 'Cracks'], [2, 'Conocidos'], [3, 'Todos']]} cambiar={(d) => poner({ dificultad: d })} editable={editable} />
      </div>
      <Paso rotulo="Rondas" valor={a.rondas} min={LIMITES_IMP.rondasMin} max={LIMITES_IMP.rondasMax} cambiar={(rondas) => poner({ rondas })} editable={editable} />
      <div className="regla regla--bloque">
        <span>
          Impostores
          <small>Con 2 se conocen entre ellos. Solo desde {MIN_DOS_IMPOSTORES} jugadores</small>
        </span>
        <Opciones valor={a.impostores} opciones={[[1, 'Uno'], [2, 'Dos']]} cambiar={(impostores) => poner({ impostores })} editable={editable} />
      </div>
      <Paso rotulo="Tiempo para hablar" valor={a.debate} min={LIMITES_IMP.debateMin} max={LIMITES_IMP.debateMax} paso={15} sufijo="s" cambiar={(debate) => poner({ debate })} editable={editable} />
      <div className="regla">
        <span>
          Última chance del impostor
          <small>Si lo descubren, puede salvarse adivinando quién era</small>
        </span>
        <button className="interruptor" data-on={a.adivinar ? '1' : '0'} disabled={!editable} onClick={() => (vibrar(8), poner({ adivinar: !a.adivinar }))} aria-pressed={a.adivinar}>
          <i />
        </button>
      </div>
      <div className="regla regla-tragos" data-on={a.tragos ? '1' : '0'}>
        <img className="regla-trago-img" src="/img/iconos/trago.webp" alt="" />
        <span>
          Modo tragos
          <small>Cada vez que te eliminan, tomas</small>
        </span>
        <button className="interruptor" data-on={a.tragos ? '1' : '0'} disabled={!editable} onClick={() => (vibrar(8), poner({ tragos: !a.tragos }))} aria-pressed={a.tragos}>
          <i />
        </button>
      </div>
      {!editable && <p className="reglas-aviso">Solo el anfitrión cambia la configuración.</p>}
    </div>
  );
}

function ComoSeJuega({ a }: { a: AjustesImp }) {
  const cosa = a.modo === 'clubes' ? 'club' : 'futbolista';
  return (
    <div className="imp-como">
      <ol>
        <li>
          Todos reciben el mismo <b>{cosa}</b> en el celular. Menos el <b>impostor</b>: a él le sale que es el impostor.
        </li>
        <li>
          Por turnos, cada uno dice <b>una palabra</b> en voz alta sobre el {cosa}. Sin decir el nombre, y sin regalarle la respuesta al impostor.
        </li>
        <li>
          Cuando se acaba el tiempo se <b>vota en el celular</b>. El más votado queda eliminado{a.tragos ? ' y toma' : ''}.
        </li>
        <li>Si eliminan a un inocente, se sigue hablando y se vuelve a votar. El impostor gana si quedan tantos impostores como inocentes, o si hay dos empates.</li>
        {a.adivinar && <li>Si atrapan al impostor, tiene una última chance: adivinar el {cosa} entre 8 opciones.</li>}
      </ol>
      <h3>Puntos</h3>
      <ul>
        <li>
          Impostor que no descubren: <b>+{PUNTOS_IMP.impostorGana}</b>
        </li>
        {a.adivinar && (
          <li>
            Impostor descubierto que adivina: <b>+{PUNTOS_IMP.impostorAdivina}</b>
          </li>
        )}
        <li>
          Cada inocente si gana el grupo: <b>+{PUNTOS_IMP.grupoGana}</b>
        </li>
        <li>
          Buen ojo (votaste al impostor cuando cayó): <b>+{PUNTOS_IMP.buenOjo}</b>
        </li>
      </ul>
    </div>
  );
}

// ───────────── Juego ─────────────

const FASE_TEXTO: Record<string, string> = { reparto: 'Tu carta', debate: 'A hablar', votacion: 'Votación', veredicto: 'Veredicto', adivina: 'Última chance', finronda: 'Fin de la ronda' };

function Juego({ sala, s, yo, anfitrion }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista; anfitrion: boolean }) {
  const r = s.ronda!;
  const tu = s.tu;
  const ahora = useCallback(() => sala.ahora(), [sala]);
  const fx = useRef<FxApi>(null);
  const vivo = r.vivos.includes(yo.id);
  const [verCarta, setVerCarta] = useState(false);
  const f = s.fase;

  // Sonidos y vibración al cambiar de fase.
  const faseAntes = useRef(f);
  useEffect(() => {
    if (faseAntes.current === f) return;
    faseAntes.current = f;
    if (f === 'reparto') (sonar.barrido(), vibrar([20, 40, 20]));
    if (f === 'debate') sonar.silbato();
    if (f === 'votacion') (sonar.alarma(), vibrar([40, 60, 40]));
    if (f === 'finronda') {
      const gane = r.ganador && (r.ganador === 'impostor') === !!r.impostores?.includes(yo.id);
      if (gane) {
        sonar.fanfarria();
        fx.current?.confeti([yo.color, '#ffffff', '#ffe14a'], 70);
      } else sonar.uuuh();
    }
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="imp-juego" data-fase={f} data-impostor={tu?.impostor ? '1' : undefined}>
      <Fondo paleta={f === 'veredicto' || f === 'adivina' ? 'troll' : 'misterio'} vel={f === 'votacion' ? 2 : 1} />
      <header className="imp-cab">
        <span className="imp-cab-ronda">
          Ronda <b className="num">{r.n}</b>
          <i className="num">/{s.ajustes.rondas}</i>
        </span>
        <b className="imp-cab-fase" key={f}>
          {FASE_TEXTO[f]}
        </b>
        {(f === 'debate' || f === 'votacion' || f === 'adivina' || f === 'reparto') && <Cuenta vence={s.vence} duracion={s.duracion} ahora={ahora} className="imp-cab-cuenta" />}
      </header>

      <main className="imp-cuerpo">
        <Capa on={f === 'reparto'}>{f === 'reparto' && <Reparto sala={sala} s={s} />}</Capa>
        <Capa on={f === 'debate'}>{f === 'debate' && <Debate s={s} yo={yo} vivo={vivo} anfitrion={anfitrion} sala={sala} />}</Capa>
        <Capa on={f === 'votacion'}>{f === 'votacion' && <Votacion sala={sala} s={s} yo={yo} vivo={vivo} />}</Capa>
        <Capa on={f === 'veredicto'}>{f === 'veredicto' && <VeredictoMovil s={s} yo={yo} />}</Capa>
        <Capa on={f === 'adivina'}>{f === 'adivina' && <Adivina sala={sala} s={s} yo={yo} />}</Capa>
        <Capa on={f === 'finronda'}>{f === 'finronda' && <FinRonda sala={sala} s={s} yo={yo} anfitrion={anfitrion} />}</Capa>
      </main>

      {/* Mi carta, siempre a mano (menos en el reparto, donde ya está en grande). */}
      {f !== 'reparto' && f !== 'finronda' && tu && (
        <button className="imp-ver-carta" data-on={verCarta ? '1' : '0'} onPointerDown={() => setVerCarta(true)} onPointerUp={() => setVerCarta(false)} onPointerLeave={() => setVerCarta(false)} onPointerCancel={() => setVerCarta(false)} onContextMenu={(e) => e.preventDefault()}>
          <span className="imp-ver-rotulo">Mantén presionado para ver tu carta</span>
          <span className="imp-ver-contenido">{tu.impostor ? <b className="imp-ver-imp">Eres el impostor</b> : tu.secreto && <><ImagenSecreto s={tu.secreto} className="imp-ver-img" /><b>{tu.secreto.nombre}</b></>}</span>
        </button>
      )}
      <Fx ref={fx} />
    </div>
  );
}

/** La carta boca abajo: se toca para darla vuelta (y se puede volver a tapar). */
function Reparto({ sala, s }: { sala: SalaImp; s: EstadoImp }) {
  const tu = s.tu;
  const r = s.ronda!;
  const [abierta, setAbierta] = useState(false);
  const carta = useRef<HTMLDivElement>(null);
  const dar = () => {
    const nueva = !abierta;
    setAbierta(nueva);
    vibrar(nueva ? [15, 30, 60] : 10);
    if (nueva) tu?.impostor ? sonar.troll() : sonar.revela(1);
  };
  const listos = r.vistos.length;
  return (
    <div className="imp-reparto">
      <p className="imp-aviso-tapa">Que nadie vea tu pantalla</p>
      <div className="imp-volteo" data-abierta={abierta ? '1' : '0'} ref={carta} onClick={dar} role="button" aria-label={abierta ? 'Tapar la carta' : 'Ver tu carta'}>
        <div className="imp-volteo-dorso">
          <span className="imp-dorso-signo">?</span>
          <b>Toca para ver tu carta</b>
        </div>
        <div className="imp-volteo-frente">
          {tu?.impostor ? (
            <div className="imp-eres">
              <span className="imp-eres-mascara" aria-hidden>
                <MascaraImp />
              </span>
              <b>Eres el impostor</b>
              <p>Nadie sabe que eres tú. Escucha bien, di algo creíble y que no te descubran.</p>
              {tu.companeros.length > 0 && (
                <p className="imp-complice">
                  Tu cómplice: <b>{tu.companeros.map((id) => s.jugadores.find((j) => j.id === id)?.nombre).join(', ')}</b>
                </p>
              )}
            </div>
          ) : (
            tu?.secreto && <CartaSecreto s={tu.secreto} />
          )}
        </div>
      </div>
      {tu && !tu.visto ? (
        <button className="btn btn--acento imp-listo" disabled={!abierta && !tu.visto} onClick={() => (vibrar(20), setAbierta(false), sala.enviar({ t: 'visto' }))}>
          {abierta ? 'Listo, ya lo vi' : 'Primero mira tu carta'}
        </button>
      ) : (
        <p className="imp-esperan">
          Esperando a los demás{' '}
          <b className="num">
            {listos}/{r.participantes.length}
          </b>
        </p>
      )}
    </div>
  );
}

export function MascaraImp() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden>
      <path d="M8 18 C30 4 90 4 112 18 C114 44 100 70 76 70 C68 70 64 58 60 58 C56 58 52 70 44 70 C20 70 6 44 8 18 Z" fill="currentColor" />
      <ellipse cx="38" cy="34" rx="15" ry="10" fill="var(--imp-ojo, #14161a)" />
      <ellipse cx="82" cy="34" rx="15" ry="10" fill="var(--imp-ojo, #14161a)" />
    </svg>
  );
}

function Debate({ sala, s, yo, vivo, anfitrion }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista; vivo: boolean; anfitrion: boolean }) {
  const r = s.ronda!;
  const cosa = s.ajustes.modo === 'clubes' ? 'el club' : 'el jugador';
  const ultimo = r.eliminados[r.eliminados.length - 1];
  const caido = r.votacion > 1 && ultimo && !ultimo.eraImpostor ? s.jugadores.find((j) => j.id === ultimo.pid) : null;
  const instr = !vivo
    ? 'Quedaste afuera de esta ronda. Mira, escucha y no sapees.'
    : r.votacion === 1
      ? `Una palabra cada uno sobre ${cosa}, en este orden. Sin decir el nombre.`
      : `${caido ? `${caido.id === yo.id ? 'Eras' : `${caido.nombre} era`} inocente. ` : ''}El impostor sigue entre ustedes: otra palabra cada uno, en el mismo orden, y a votar de nuevo.`;
  return (
    <div className="imp-debate">
      <b className="imp-gritito">{r.votacion === 1 ? '¡A hablar!' : 'Otra vuelta'}</b>
      <p className="imp-instr">{instr}</p>
      <OrdenHablar s={s} yo={yo.id} />
      {anfitrion && (
        <div className="imp-anf">
          <button className="btn btn--acento" onClick={() => (vibrar(20), sala.enviar({ t: 'aVotar' }))}>
            ¡A votar ya!
          </button>
          <button className="btn" onClick={() => (vibrar(10), sala.enviar({ t: 'masTiempo' }))}>
            +30 s
          </button>
        </div>
      )}
    </div>
  );
}

/** Orden para decir la palabra (sorteado en cada ronda; los eliminados ya no aparecen). */
function OrdenHablar({ s, yo }: { s: EstadoImp; yo: string }) {
  const r = s.ronda!;
  const mio = r.orden.indexOf(yo);
  return (
    <div className="imp-orden">
      <span className="imp-orden-rotulo">{mio >= 0 ? `Te toca hablar en el ${mio + 1}.º lugar` : 'Orden para hablar'}</span>
      <ol>
        {r.orden.map((id, i) => {
          const j = s.jugadores.find((x) => x.id === id);
          if (!j) return null;
          return (
            <li key={id} data-yo={id === yo ? '1' : undefined} style={{ '--c': j.color, '--i': i } as CSSProperties}>
              <i className="num">{i + 1}</i>
              <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
              <b>{id === yo ? 'Tú' : j.nombre}</b>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Los que siguen en pie (los eliminados, tachados). */
function Vivos({ s, yo, votaron }: { s: EstadoImp; yo: string; votaron?: string[] }) {
  const r = s.ronda!;
  return (
    <div className="imp-vivos">
      {r.participantes.map((id, i) => {
        const j = s.jugadores.find((x) => x.id === id);
        if (!j) return null;
        const fuera = !r.vivos.includes(id);
        return (
          <span key={id} className="imp-vivo" data-fuera={fuera ? '1' : undefined} data-voto={votaron?.includes(id) ? '1' : undefined} data-yo={id === yo ? '1' : undefined} style={{ '--c': j.color, '--i': i } as CSSProperties}>
            <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
            <small>{j.nombre}</small>
          </span>
        );
      })}
    </div>
  );
}

function Votacion({ sala, s, yo, vivo }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista; vivo: boolean }) {
  const r = s.ronda!;
  const voto = s.tu?.voto ?? null;
  if (!vivo)
    return (
      <div className="imp-votacion">
        <b className="imp-gritito">Están votando</b>
        <p className="imp-instr">Ya no votas en esta ronda.</p>
        <Vivos s={s} yo={yo.id} votaron={r.votaron} />
      </div>
    );
  const candidatos = r.vivos.filter((id) => id !== yo.id);
  return (
    <div className="imp-votacion">
      <b className="imp-gritito">¿Quién es el impostor?</b>
      <p className="imp-instr">
        {voto ? 'Puedes cambiar tu voto hasta que voten todos' : 'Toca a quien quieras echar'} · <b className="num">{r.votaron.length}</b>/{r.vivos.length} votaron
      </p>
      <div className="imp-urna">
        {candidatos.map((id, i) => {
          const j = s.jugadores.find((x) => x.id === id)!;
          return (
            <button
              key={id}
              className="imp-candidato"
              data-on={voto === id ? '1' : '0'}
              style={{ '--c': j.color, '--i': i } as CSSProperties}
              onClick={() => {
                vibrar(voto === id ? 8 : [15, 30, 15]);
                sonar.toque();
                sala.enviar({ t: 'votar', pid: id });
              }}
            >
              <Avatar src={j.avatar} color={j.color} />
              <b>{j.nombre}</b>
              {voto === id && <em>Tu voto</em>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VeredictoMovil({ s, yo }: { s: EstadoImp; yo: JugadorImpVista }) {
  const v = s.ronda!.veredicto;
  const j = v?.pid ? s.jugadores.find((x) => x.id === v.pid) : null;
  const soyYo = v?.pid === yo.id;
  useEffect(() => {
    const id = setTimeout(() => {
      if (!v) return;
      if (v.empate) sonar.uuuh();
      else if (v.eraImpostor) (sonar.ovacion(), vibrar([30, 50, 120]));
      else (sonar.troll(), vibrar(soyYo ? [80, 60, 200] : 40));
      if (soyYo && s.ajustes.tragos) setTimeout(() => sonar.trago(1), 900);
    }, 2600);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v) return null;
  return (
    <div className="imp-veredicto" data-resultado={v.empate ? 'empate' : v.eraImpostor ? 'impostor' : 'inocente'}>
      <p className="imp-redoble">Y el más votado es…</p>
      {v.empate || !j ? (
        <div className="imp-ver-final">
          <b className="imp-sello">Empate</b>
          <p>Nadie sale. {s.ronda!.empates >= 2 ? 'Segundo empate: el impostor se salva.' : 'Si vuelve a pasar, gana el impostor.'}</p>
        </div>
      ) : (
        <div className="imp-ver-final">
          <span className="imp-ver-quien" style={{ '--c': j.color } as CSSProperties}>
            <Avatar src={j.avatar} color={j.color} />
            <b>{soyYo ? '¡Tú!' : j.nombre}</b>
            <small className="num">
              {v.conteo[j.id]} {v.conteo[j.id] === 1 ? 'voto' : 'votos'}
            </small>
          </span>
          <b className="imp-sello">{v.eraImpostor ? 'Era el impostor' : 'Era inocente'}</b>
          {s.ajustes.tragos && (
            <p className="imp-trago">
              <img src="/img/iconos/trago.webp" alt="" />
              {soyYo ? '¡Toma!' : `¡${j.nombre} toma!`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Adivina({ sala, s, yo }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista }) {
  const r = s.ronda!;
  const yoAdivino = r.adivina === yo.id;
  const [marcado, setMarcado] = useState<string | null>(null);
  const quien = s.jugadores.find((j) => j.id === r.adivina);
  const cosa = s.ajustes.modo === 'clubes' ? 'el club' : 'el jugador';
  return (
    <div className="imp-adivina">
      <b className="imp-gritito">{yoAdivino ? '¡Última chance!' : `${quien?.nombre ?? 'El impostor'} intenta salvarse`}</b>
      <p className="imp-instr">{yoAdivino ? `Te atraparon. Si adivinas ${cosa}, igual ganas.` : `Tiene que adivinar ${cosa}. Cara de póker.`}</p>
      <div className="imp-opciones" data-mio={yoAdivino ? '1' : undefined}>
        {r.opciones?.map((o, i) => (
          <button
            key={o.id}
            className="imp-opcion"
            data-on={marcado === o.id ? '1' : '0'}
            disabled={!yoAdivino}
            style={{ '--i': i } as CSSProperties}
            onClick={() => {
              vibrar(10);
              setMarcado(o.id);
            }}
          >
            <ImagenSecreto s={o} />
            <b>{o.nombre}</b>
          </button>
        ))}
      </div>
      {yoAdivino && (
        <button className="btn btn--acento imp-confirmar" disabled={!marcado} onClick={() => marcado && (vibrar([20, 40, 80]), sala.enviar({ t: 'adivinar', id: marcado }))}>
          {marcado ? `Es ${r.opciones?.find((o) => o.id === marcado)?.nombre}` : 'Elige uno'}
        </button>
      )}
    </div>
  );
}

function FinRonda({ sala, s, yo, anfitrion }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista; anfitrion: boolean }) {
  const r = s.ronda!;
  const imps = (r.impostores ?? []).map((id) => s.jugadores.find((j) => j.id === id)).filter(Boolean) as JugadorImpVista[];
  const fuiImp = r.impostores?.includes(yo.id);
  const gane = (r.ganador === 'impostor') === !!fuiImp && r.motivo !== 'abandono';
  const mis = r.puntos?.[yo.id] ?? 0;
  const ultima = s.rondaN >= s.ajustes.rondas;
  return (
    <div className="imp-fin">
      <div className="imp-fin-cab" data-ganador={r.ganador}>
        <b>{r.motivo === 'abandono' ? 'Ronda anulada' : r.ganador === 'impostor' ? (imps.length > 1 ? 'Ganaron los impostores' : 'Ganó el impostor') : 'Ganó el grupo'}</b>
        <span>{MOTIVO_TEXTO[r.motivo ?? '']}</span>
      </div>
      <div className="imp-fin-revela">
        {r.secreto && <CartaSecreto s={r.secreto} className="imp-carta--chica" />}
        <div className="imp-fin-imps">
          <small>{imps.length > 1 ? 'Los impostores' : 'El impostor'}</small>
          {imps.map((j) => (
            <span key={j.id} style={{ '--c': j.color } as CSSProperties}>
              <Avatar src={j.avatar} color={j.color} />
              <b>{j.id === yo.id ? 'Tú' : j.nombre}</b>
            </span>
          ))}
          <em className="imp-mis" data-gane={gane ? '1' : '0'}>
            {mis > 0 ? `+${mis} para ti` : gane ? 'Ganaste' : 'Sin puntos'}
          </em>
        </div>
      </div>
      <Tabla s={s} yo={yo.id} delta={r.puntos} tragos={s.ajustes.tragos} />
      {anfitrion ? (
        <button className="btn btn--acento imp-siguiente" onClick={() => (vibrar(20), sala.enviar({ t: 'siguiente' }))}>
          {ultima ? 'Ver resultados' : 'Siguiente ronda'}
        </button>
      ) : (
        <p className="imp-esperan">{ultima ? 'Ahora vienen los resultados' : 'La próxima ronda arranca en un momento'}</p>
      )}
    </div>
  );
}

// ───────────── Final ─────────────

function Final({ sala, s, yo, anfitrion }: { sala: SalaImp; s: EstadoImp; yo: JugadorImpVista; anfitrion: boolean }) {
  const tabla = ordenTabla(s.jugadores);
  const fx = useRef<FxApi>(null);
  const puesto = tabla.filter((j) => j.puntos > yo.puntos).length + 1;
  useEffect(() => {
    const id = setTimeout(() => {
      if (puesto === 1) {
        sonar.fanfarria();
        fx.current?.confeti([yo.color, '#ffe14a', '#ffffff'], 120);
      } else sonar.ovacion();
    }, 700);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const masTragos = s.ajustes.tragos ? [...s.jugadores].sort((a, b) => b.tragos - a.tragos)[0] : null;
  return (
    <div className="imp-final">
      <Fondo paleta="leyenda" />
      <header className="imp-final-cab">
        <img src="/img/iconos/trofeo.webp" alt="" />
        <b>{puesto === 1 ? '¡Ganaste!' : `Quedaste ${puesto}.º`}</b>
        <span>
          {s.historial.length} {s.historial.length === 1 ? 'ronda' : 'rondas'} · {s.historial.filter((h) => h.ganador === 'impostor').length} ganadas por el impostor
        </span>
      </header>
      <Podio s={s} />
      <Tabla s={s} yo={yo.id} tragos={s.ajustes.tragos} className="imp-tabla--final" />
      {masTragos && masTragos.tragos > 0 && (
        <p className="imp-sediento">
          <img src="/img/iconos/trago.webp" alt="" />
          El más sediento: <b>{masTragos.nombre}</b> con <b className="num">{masTragos.tragos}</b> {masTragos.tragos === 1 ? 'trago' : 'tragos'}
        </p>
      )}
      <footer className="imp-final-pie">
        {anfitrion ? (
          <button className="btn btn--acento" onClick={() => (vibrar(20), sala.enviar({ t: 'revancha' }))}>
            Revancha
          </button>
        ) : (
          <p className="imp-esperan">El anfitrión decide si hay revancha</p>
        )}
        <BotonConfirmar className="btn" etiqueta="Salir" aviso="¿Seguro? Toca otra vez" alConfirmar={(e) => (sala.enviar({ t: 'salir' }), void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } }))} />
      </footer>
      <Fx ref={fx} />
    </div>
  );
}

export function Podio({ s, className = '' }: { s: EstadoImp; className?: string }) {
  const todos = ordenTabla(s.jugadores);
  const t = todos.slice(0, 3);
  const lugares = [t[1], t[0], t[2]];
  // Con empate en puntos, el número del puesto es el mismo.
  const puesto = (j: JugadorImpVista) => todos.filter((x) => x.puntos > j.puntos).length + 1;
  return (
    <div className={`imp-podio ${className}`}>
      {lugares.map((j, i) =>
        j ? (
          <div key={j.id} className="imp-podio-p" data-lugar={i === 1 ? 1 : i === 0 ? 2 : 3} style={{ '--c': j.color } as CSSProperties}>
            <Avatar src={j.avatar} color={j.color} />
            <b>{j.nombre}</b>
            <span className="imp-podio-base">
              <i className="num">{puesto(j)}</i>
              <em className="num">{j.puntos} pts</em>
            </span>
          </div>
        ) : (
          <div key={i} className="imp-podio-p" data-vacio="1" />
        ),
      )}
    </div>
  );
}
