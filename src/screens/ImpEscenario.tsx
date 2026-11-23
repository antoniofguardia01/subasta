// TV del Impostor: lienzo fijo de 1920×1080. Nunca muestra el secreto hasta que termina la ronda.
import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EstadoImp, JugadorImpVista, MsgClienteImp } from '../../shared/impostor';
import { MIN_DOS_IMPOSTORES, MIN_IMP } from '../../shared/impostor';
import { Avatar, Fondo, QR } from '../components/comunes';
import { CartaSecreto, Cuenta, ImagenSecreto, MOTIVO_TEXTO, Tabla, useFaltan } from '../components/impostor';
import { Fx, FxApi } from '../components/Fx';
import { IconoMusica, IconoSonido } from '../components/Iconos';
import { useSala, type Sala } from '../lib/sala';
import { activarSonido, alCambiarSonido, sonar, sonidoActivo } from '../lib/sonido';
import { alCambiarMusica, musica, musicaPreferida, ponerMusica } from '../lib/musica';
import { ponerLite, esLite } from '../lib/rendimiento';
import { Cargando, SinSala } from './Escenario';
import { MascaraImp, Podio } from './ImpJugador';

type SalaImp = Sala<EstadoImp, MsgClienteImp>;

const MUSICA: Record<string, number> = { lobby: 0.15, reparto: 0.3, debate: 0.45, votacion: 0.8, veredicto: 0.2, finronda: 0.35, final: 0.7 };

export function ImpEscenario({ codigo }: { codigo: string }) {
  const [sala, vista] = useSala<EstadoImp, MsgClienteImp>(codigo, 'escenario');
  const s = vista.estado;
  const lienzo = useRef<HTMLDivElement>(null);
  const fx = useRef<FxApi>(null);
  const [conSonido, setConSonido] = useState(sonidoActivo());
  const [hayMusica, setHayMusica] = useState(musicaPreferida());
  useEffect(() => alCambiarSonido(() => setConSonido(sonidoActivo())), []);
  useEffect(() => alCambiarMusica(() => setHayMusica(musicaPreferida())), []);

  useLayoutEffect(() => {
    const ajustar = () => {
      const k = Math.min(innerWidth / 1920, innerHeight / 1080);
      const el = lienzo.current;
      if (el) el.style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
    };
    ajustar();
    addEventListener('resize', ajustar);
    return () => removeEventListener('resize', ajustar);
  }, [!!s]);

  const fase = s?.fase;
  useEffect(() => {
    if (!fase || !conSonido) return musica(null);
    musica(MUSICA[fase] ?? 0.3);
  }, [fase, conSonido]);
  useEffect(() => () => musica(null), []);

  // Sonido y efectos de cada cambio de fase.
  const faseAntes = useRef(fase);
  useEffect(() => {
    if (!s || faseAntes.current === fase) return;
    faseAntes.current = fase;
    if (fase === 'reparto') sonar.barrido();
    else if (fase === 'debate') sonar.silbato();
    else if (fase === 'votacion') sonar.alarma();
    else if (fase === 'finronda') {
      const r = s.ronda!;
      if (r.ganador === 'grupo') {
        sonar.ovacion();
        fx.current?.confeti(['#ffffff', '#c6f432', '#2f8bff'], 90);
      } else {
        sonar.troll();
        fx.current?.confeti(['#ff3b4e', '#14161a', '#ffffff'], 70);
      }
    } else if (fase === 'final') {
      sonar.fanfarria();
      fx.current?.confeti(['#ffe14a', '#ffffff', '#ff3b4e'], 160);
    }
  }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Control remoto: OK/Enter avanza lo que se pueda, M música, L liviano, F pantalla completa.
  const sRef = useRef(s);
  sRef.current = s;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const st = sRef.current;
      if (e.key === 'm' || e.key === 'M') ponerMusica(!musicaPreferida());
      else if (e.key === 'l' || e.key === 'L') ponerLite(!esLite());
      else if (e.key === 'f' || e.key === 'F') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
      else if ((e.key === 'Enter' || e.key === ' ') && st && !(document.activeElement instanceof HTMLButtonElement)) {
        if (st.fase === 'debate' || st.fase === 'reparto') sala.enviar({ t: 'aVotar' });
        else if (st.fase === 'finronda') sala.enviar({ t: 'siguiente' });
      }
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, [sala]);

  if (vista.conexion === 'sin_sala') return <SinSala codigo={codigo} />;
  if (!s) return <Cargando texto="Prendiendo la tele" />;
  const enJuego = s.fase !== 'lobby' && s.fase !== 'final';
  const f = s.fase;

  return (
    <div className="pantalla escenario imp-tv" data-fase={f}>
      <div className="lienzo" ref={lienzo}>
        <Fondo paleta={f === 'veredicto' || f === 'lobby' ? 'troll' : f === 'final' ? 'leyenda' : 'misterio'} vel={f === 'votacion' ? 2.2 : 1} />
        <div className="tv-capa" data-on={f === 'lobby' ? '1' : '0'}>
          {f === 'lobby' && <LobbyTV s={s} />}
        </div>
        <div className="tv-capa" data-on={enJuego ? '1' : '0'}>
          {enJuego && <JuegoTV sala={sala} s={s} />}
        </div>
        <div className="tv-capa" data-on={f === 'final' ? '1' : '0'}>
          {f === 'final' && <FinalTV s={s} />}
        </div>
        <footer className="itv-pie">
          <span className="itv-marca">El Impostor</span>
          <span className="itv-codigo">
            Sala <b>{s.codigo}</b>
          </span>
          <span className="itv-flex" />
          {enJuego && (f === 'debate' || f === 'reparto') && (
            <button className="itv-btn" onClick={() => sala.enviar({ t: 'aVotar' })}>
              A votar
            </button>
          )}
          {f === 'debate' && (
            <button className="itv-btn" onClick={() => sala.enviar({ t: 'masTiempo' })}>
              +30 s
            </button>
          )}
          {f === 'finronda' && (
            <button className="itv-btn itv-btn--acento" onClick={() => sala.enviar({ t: 'siguiente' })}>
              {s.rondaN >= s.ajustes.rondas ? 'Resultados' : 'Siguiente ronda'}
            </button>
          )}
          <button className="itv-btn itv-ico" data-on={conSonido ? '1' : '0'} onClick={() => void activarSonido(!conSonido)} aria-label={conSonido ? 'Silenciar' : 'Activar sonido'}>
            <IconoSonido on={conSonido} />
          </button>
          <button className="itv-btn itv-ico" data-on={hayMusica ? '1' : '0'} onClick={() => ponerMusica(!hayMusica)} title="Música (M)" aria-label={hayMusica ? 'Quitar la música' : 'Poner música'}>
            <IconoMusica on={hayMusica} />
          </button>
        </footer>
        <Fx ref={fx} />
      </div>
    </div>
  );
}

// ───────────── Lobby ─────────────

function LobbyTV({ s }: { s: EstadoImp }) {
  const url = `${location.origin}/r/${s.codigo}`;
  const a = s.ajustes;
  const n = s.jugadores.length;
  return (
    <div className="itv-lobby">
      <div className="itv-lobby-izq">
        <div className="itv-titulo">
          <span className="itv-mascara">
            <MascaraImp />
          </span>
          <b>El Impostor</b>
          <em>{a.modo === 'clubes' ? 'Versión clubes' : 'Versión futbolistas'}</em>
        </div>
        <p className="itv-lema">Todos saben quién es. Menos uno.</p>
        <div className="itv-chips">
          <span>
            <b className="num">{a.rondas}</b> {a.rondas === 1 ? 'ronda' : 'rondas'}
          </span>
          {a.modo === 'jugadores' && a.trolls === 'solo' && <span className="itv-chip-troll">Solo trolls</span>}
          <span>
            <b className="num">{a.impostores === 2 && n >= MIN_DOS_IMPOSTORES ? 2 : 1}</b> impostor{a.impostores === 2 && n >= MIN_DOS_IMPOSTORES ? 'es' : ''}
          </span>
          <span>
            <b className="num">{a.debate}</b> s para hablar
          </span>
          {a.tragos && (
            <span className="itv-chip-trago">
              <img src="/img/iconos/trago.webp" alt="" /> Modo tragos
            </span>
          )}
        </div>
        <div className="itv-jugs">
          {s.jugadores.map((j, i) => (
            <span key={j.id} className="itv-jug" style={{ '--c': j.color, '--i': i } as CSSProperties} data-off={j.conectado ? undefined : '1'}>
              <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
              <b>{j.nombre}</b>
            </span>
          ))}
          {n < MIN_IMP && <span className="itv-falta">Faltan {MIN_IMP - n} para empezar</span>}
        </div>
      </div>
      <div className="itv-unirse">
        <QR texto={url} />
        <span>Escanea para entrar</span>
        <b>{s.codigo}</b>
        <small>{location.host}</small>
      </div>
    </div>
  );
}

// ───────────── Juego ─────────────

function JuegoTV({ sala, s }: { sala: SalaImp; s: EstadoImp }) {
  const r = s.ronda!;
  const ahora = useCallback(() => sala.ahora(), [sala]);
  const f = s.fase;
  const faltan = useFaltan(s.vence, ahora);
  // Tic en los últimos 5 segundos de hablar y de votar.
  const seg = Math.ceil(faltan / 1000);
  useEffect(() => {
    if ((f === 'votacion' || f === 'debate') && seg > 0 && seg <= 5) sonar.tic(seg <= 3);
  }, [seg, f]);
  return (
    <div className="itv-juego" data-fase={f}>
      <header className="itv-cab">
        <div className="itv-ronda" key={r.n}>
          <span>Ronda</span>
          <b className="num">{r.n}</b>
          <i className="num">/{s.ajustes.rondas}</i>
        </div>
        {r.votacion > 1 && (f === 'debate' || f === 'votacion') && <span className="itv-votacion">Votación {r.votacion}</span>}
        <span className="itv-flex" />
        {(f === 'debate' || f === 'votacion' || f === 'reparto') && <Cuenta vence={s.vence} duracion={s.duracion} ahora={ahora} className="itv-cuenta" />}
      </header>
      <div className="itv-escena">
        <div className="tv-capa itv-sub" data-on={f === 'reparto' ? '1' : '0'}>
          {f === 'reparto' && <RepartoTV s={s} />}
        </div>
        <div className="tv-capa itv-sub" data-on={f === 'debate' ? '1' : '0'}>
          {f === 'debate' && <DebateTV s={s} />}
        </div>
        <div className="tv-capa itv-sub" data-on={f === 'votacion' ? '1' : '0'}>
          {f === 'votacion' && <VotacionTV s={s} />}
        </div>
        <div className="tv-capa itv-sub" data-on={f === 'veredicto' ? '1' : '0'}>
          {f === 'veredicto' && <VeredictoTV s={s} />}
        </div>
        <div className="tv-capa itv-sub" data-on={f === 'finronda' ? '1' : '0'}>
          {f === 'finronda' && <FinRondaTV s={s} />}
        </div>
      </div>
    </div>
  );
}

const jug = (s: EstadoImp, id: string | null | undefined) => (id ? s.jugadores.find((j) => j.id === id) : undefined);

/** Ronda de caras: los vivos en color, los eliminados apagados y tachados. */
function Ronda({ s, marca, orden }: { s: EstadoImp; marca?: (id: string) => string | undefined; orden?: boolean }) {
  const r = s.ronda!;
  const ids = orden ? r.orden : r.participantes;
  return (
    <div className="itv-ronda-caras" data-n={ids.length > 8 ? 'muchos' : undefined} data-orden={orden ? '1' : undefined}>
      {ids.map((id, i) => {
        const j = jug(s, id);
        if (!j) return null;
        const fuera = !r.vivos.includes(id);
        return (
          <span key={id} className="itv-cara" data-fuera={fuera ? '1' : undefined} data-marca={marca?.(id)} style={{ '--c': j.color, '--i': i } as CSSProperties}>
            {orden && <i className="itv-turno num">{i + 1}</i>}
            <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
            <b>{j.nombre}</b>
          </span>
        );
      })}
    </div>
  );
}

function RepartoTV({ s }: { s: EstadoImp }) {
  const r = s.ronda!;
  return (
    <div className="itv-centro">
      <div className="itv-mazo" aria-hidden>
        {r.participantes.map((id, i) => (
          <i key={id} style={{ '--i': i, '--n': r.participantes.length } as CSSProperties} />
        ))}
      </div>
      <b className="itv-grande">Miren su celular</b>
      <p className="itv-texto">
        {r.nImpostores > 1 ? 'Hay dos impostores entre ustedes.' : 'Uno de ustedes es el impostor.'} Que nadie espíe la pantalla del otro.
      </p>
      <Ronda s={s} marca={(id) => (r.vistos.includes(id) ? 'listo' : undefined)} />
    </div>
  );
}

function DebateTV({ s }: { s: EstadoImp }) {
  const r = s.ronda!;
  const cosa = s.ajustes.modo === 'clubes' ? 'el club' : 'el jugador';
  const ultimo = r.eliminados[r.eliminados.length - 1];
  const caido = r.votacion > 1 && ultimo && !ultimo.eraImpostor ? jug(s, ultimo.pid) : null;
  return (
    <div className="itv-centro">
      <b className="itv-grande itv-grito">{r.votacion === 1 ? '¡A hablar!' : 'Otra vuelta'}</b>
      <p className="itv-texto">
        {r.votacion === 1 ? (
          <>
            <b>Una palabra</b> cada uno sobre {cosa}, en este orden. Sin decir el nombre.
          </>
        ) : (
          <>
            {caido && <>{caido.nombre} era inocente. </>}El impostor sigue entre ustedes: <b>otra palabra</b> cada uno, en el mismo orden, y a votar de nuevo.
          </>
        )}
      </p>
      <Ronda s={s} orden />
    </div>
  );
}

function VotacionTV({ s }: { s: EstadoImp }) {
  const r = s.ronda!;
  return (
    <div className="itv-centro">
      <b className="itv-grande itv-pregunta">¿Quién es el impostor?</b>
      <p className="itv-texto">
        Voten en el celular · <b className="num">{r.votaron.length}</b> de <b className="num">{r.vivos.length}</b> ya votaron
      </p>
      <Ronda s={s} marca={(id) => (r.votaron.includes(id) ? 'voto' : undefined)} />
    </div>
  );
}

function VeredictoTV({ s }: { s: EstadoImp }) {
  const r = s.ronda!;
  const v = r.veredicto;
  useVeredictoSonido(v?.empate ?? true, v?.eraImpostor ?? false);
  if (!v) return null;
  const j = jug(s, v.pid);
  // Barras de votos: de más a menos votado.
  const filas = Object.entries(v.conteo).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...filas.map((f) => f[1]));
  return (
    <div className="itv-veredicto" data-resultado={v.empate ? 'empate' : v.eraImpostor ? 'impostor' : 'inocente'}>
      <div className="itv-conteo">
        <b className="itv-redoble">Y el más votado es…</b>
        {filas.map(([pid, n], i) => {
          const p = jug(s, pid);
          if (!p) return null;
          const quienes = Object.entries(v.votos).filter(([, a]) => a === pid).map(([q]) => jug(s, q)).filter(Boolean) as JugadorImpVista[];
          return (
            <div key={pid} className="itv-barra" style={{ '--c': p.color, '--i': i, '--w': n / max } as CSSProperties}>
              <Avatar src={p.avatar} color={p.color} />
              <b>{p.nombre}</b>
              <span className="itv-barra-fill">
                {quienes.map((q) => (
                  <Avatar key={q.id} src={q.avatar} color={q.color} className="itv-votante" />
                ))}
              </span>
              <em className="num">{n}</em>
            </div>
          );
        })}
        {!filas.length && <p className="itv-texto">Nadie votó.</p>}
      </div>
      <div className="itv-elegido">
        {v.empate || !j ? (
          <>
            <b className="itv-sello">Empate</b>
            <p className="itv-texto">Nadie sale. {r.empates >= 2 ? 'Segundo empate: el impostor se salva.' : 'Si vuelve a pasar, gana el impostor.'}</p>
          </>
        ) : (
          <>
            <span className="itv-elegido-cara" style={{ '--c': j.color } as CSSProperties}>
              <Avatar src={j.avatar} color={j.color} />
            </span>
            <b className="itv-elegido-nombre">{j.nombre}</b>
            <b className="itv-sello">{v.eraImpostor ? 'Era el impostor' : 'Era inocente'}</b>
            {s.ajustes.tragos && (
              <p className="itv-trago">
                <img src="/img/iconos/trago.webp" alt="" />¡{j.nombre} toma!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function useVeredictoSonido(empate: boolean, eraImpostor: boolean) {
  useEffect(() => {
    const id = setTimeout(() => {
      if (empate) sonar.uuuh();
      else if (eraImpostor) sonar.ovacion();
      else sonar.troll();
    }, 2600);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function FinRondaTV({ s }: { s: EstadoImp }) {
  const r = s.ronda!;
  const imps = (r.impostores ?? []).map((id) => jug(s, id)).filter(Boolean) as JugadorImpVista[];
  return (
    <div className="itv-fin" data-ganador={r.ganador}>
      <div className="itv-fin-izq">
        <div className="itv-fin-cab">
          <b>{r.motivo === 'abandono' ? 'Ronda anulada' : r.ganador === 'impostor' ? (imps.length > 1 ? 'Ganaron los impostores' : 'Ganó el impostor') : 'Ganó el grupo'}</b>
          <span>{MOTIVO_TEXTO[r.motivo ?? '']}</span>
        </div>
        <div className="itv-fin-revela">
          {r.secreto && <CartaSecreto s={r.secreto} />}
          <div className="itv-fin-imps">
            <small>{imps.length > 1 ? 'Los impostores eran' : 'El impostor era'}</small>
            {imps.map((j) => (
              <span key={j.id} style={{ '--c': j.color } as CSSProperties}>
                <Avatar src={j.avatar} color={j.color} />
                <b>{j.nombre}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="itv-fin-tabla">
        <b className="itv-fin-titulo">Tabla de posiciones</b>
        <Tabla s={s} delta={r.puntos} tragos={s.ajustes.tragos} demora={1.6} />
      </div>
    </div>
  );
}

// ───────────── Final ─────────────

function FinalTV({ s }: { s: EstadoImp }) {
  const masTragos = s.ajustes.tragos ? [...s.jugadores].sort((a, b) => b.tragos - a.tragos)[0] : null;
  const impGanadas = s.historial.filter((h) => h.ganador === 'impostor').length;
  return (
    <div className="itv-final">
      <div className="itv-final-izq">
        <b className="itv-grande">Resultados</b>
        <p className="itv-texto">
          {s.historial.length} {s.historial.length === 1 ? 'ronda' : 'rondas'} · el impostor ganó {impGanadas}
        </p>
        <Podio s={s} className="itv-podio" />
        {masTragos && masTragos.tragos > 0 && (
          <p className="itv-trago">
            <img src="/img/iconos/trago.webp" alt="" />
            El más sediento: <b>{masTragos.nombre}</b> · {masTragos.tragos} {masTragos.tragos === 1 ? 'trago' : 'tragos'}
          </p>
        )}
      </div>
      <div className="itv-final-der">
        <Tabla s={s} tragos={s.ajustes.tragos} demora={0} />
        <div className="itv-historial">
          {s.historial.map((h) => (
            <span key={h.n} data-ganador={h.ganador}>
              <i className="num">{h.n}</i>
              <ImagenSecreto s={h.secreto} />
              <b>{h.secreto.nombre}</b>
              <em>{h.ganador === 'impostor' ? 'Impostor' : 'Grupo'}</em>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
