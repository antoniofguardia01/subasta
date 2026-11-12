// Main Stage: vista de proyección 16:9 para TV/PC. Solo lectura; se maneja con control remoto (flechas + OK).
import { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import type { EstadoPublico, JugadorSala } from '../../shared/types';
import { MAX_PARTICIPANTES, POS_NOMBRE } from '../../shared/types';
import { Avatar, BotonPantalla, Cancha, Fondo, Numero, QR, Ticker, cuentaEquipo } from '../components/comunes';
import { Escena } from '../components/Escena';
import { Fx, FxApi } from '../components/Fx';
import { Reloj, Tic } from '../components/Reloj';
import { Ruleta } from '../components/Ruleta';
import { irConTelon } from '../lib/ruta';
import { Sala, useSala } from '../lib/sala';
import { esTele } from '../lib/tele';
import { useEquipoEnPantalla } from '../lib/vistaFinal';
import { activarSonido, alCambiarSonido, ambiente, sonar, sonidoActivo } from '../lib/sonido';
import { TEMAS } from '../lib/temas';
import { reducirMovimiento } from '../lib/util';
import { IconoLiviano, IconoSonido } from '../components/Iconos';
import { alCambiarLite, esLite, ponerLite } from '../lib/rendimiento';

type Panel = 'equipos' | 'saldos' | 'historial' | null;

export function Escenario({ codigo }: { codigo: string }) {
  const [sala, vista] = useSala(codigo, 'escenario');
  const s = vista.estado;
  const lienzo = useRef<HTMLDivElement>(null);
  const fx = useRef<FxApi>(null);
  const [tic, setTic] = useState<Tic>({ tension: 0, cuenta: 0 });
  const [panel, setPanel] = useState<Panel>(null);
  const [conSonido, setConSonido] = useState(sonidoActivo());

  // Lienzo fijo de 1920×1080 escalado a la pantalla: se ve idéntico en 720p, 1080p y 4K.
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

  useEffect(() => alCambiarSonido(() => setConSonido(sonidoActivo())), []);

  // Tribuna de fondo: se calienta con la puja y explota en la última oportunidad.
  const fase = s?.fase;
  const pausa = s?.pausa;
  useEffect(() => {
    if (!fase || !conSonido) return ambiente(null);
    const NIVEL: Partial<Record<string, number>> = { lobby: 0.05, intro: 0.3, ronda: 0.25, presenta: 0.35, puja: 0.5, ultima: 0.9, ruleta: 0.85, martillo: 0.75, revela: 0.6, finronda: 0.3, final: 0.55 };
    ambiente(pausa ? 0 : (NIVEL[fase] ?? 0.25));
  }, [fase, pausa, conSonido]);
  useEffect(() => () => ambiente(null), []);
  useEffect(() => {
    if (!conSonido) return;
    if (fase === 'intro') sonar.silbato();
    else if (fase === 'final') sonar.silbato(true);
  }, [fase === 'intro', fase === 'final']);

  // Sonidos de eventos sueltos.
  useEffect(
    () =>
      sala.alEvento((ev, est) => {
        if (ev.e === 'oferta') sonar.oferta(ev.precio - (est.carta?.precioMinimo ?? ev.precio));
        else if (ev.e === 'rechazo' && ev.motivo === 'tarde') sonar.rechazo();
        else if (ev.e === 'entra' && est.fase === 'lobby') sonar.toque();
      }),
    [sala],
  );

  // Los equipos también se muestran en los celulares; saldos e historial quedan solo en esta pantalla.
  const elegirPanel = (p: Panel) => {
    setPanel(p);
    if ((p === 'equipos') !== (s?.panel === 'equipos')) sala.enviar({ t: 'panel', on: p === 'equipos' });
  };
  const elegirRef = useRef(elegirPanel);
  elegirRef.current = elegirPanel;
  const panelRef = useRef<Panel>(null);
  panelRef.current = s?.panel ?? panel;
  const pausarRef = useRef(() => {});
  pausarRef.current = () => {
    if (s && s.fase !== 'lobby' && s.fase !== 'final') sala.enviar({ t: 'pausa', on: !s.pausa });
  };

  // Control remoto / teclado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') setPanel(null);
      else if (e.key === '1') elegirRef.current(panelRef.current === 'equipos' ? null : 'equipos');
      else if (e.key === 'p' || e.key === 'P' || e.key === 'MediaPlayPause') pausarRef.current();
      else if (e.key === '2') setPanel((p) => (p === 'saldos' ? null : 'saldos'));
      else if (e.key === '3') setPanel((p) => (p === 'historial' ? null : 'historial'));
      else if (e.key === 'l' || e.key === 'L') ponerLite(!esLite());
      else if (e.key === 'f' || e.key === 'F') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // Las flechas recorren los botones de la barra.
        const botones = [...document.querySelectorAll<HTMLElement>('.tv-botones button')];
        const i = botones.indexOf(document.activeElement as HTMLElement);
        const sig = botones[(i + (e.key === 'ArrowRight' ? 1 : -1) + botones.length) % botones.length];
        sig?.focus();
        e.preventDefault();
      }
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);

  // La ficha comprada vuela desde la escena hasta la tarjeta del comprador.
  const alVolar = useCallback((origen: DOMRect, img: string, pid: string) => {
    const chip = document.querySelector<HTMLElement>(`[data-chip="${pid}"]`);
    const destino = chip?.querySelector('.avatar')?.getBoundingClientRect();
    if (!chip || !destino) return;
    const el = document.createElement('div');
    el.className = 'ficha-vuela';
    el.style.cssText = `left:${origen.left}px;top:${origen.top}px;width:${origen.width}px;height:${origen.height}px;`;
    el.innerHTML = `<img src="${img}" alt="">`;
    document.body.appendChild(el);
    const esc = destino.width / origen.width;
    const color = getComputedStyle(chip).getPropertyValue('--c');
    gsap
      .timeline({ onComplete: () => el.remove() })
      .to(el, { clipPath: 'circle(34% at 50% 42%)', duration: 0.3, ease: 'power2.out' }, 0)
      .to(
        el,
        {
          x: destino.left + destino.width / 2 - (origen.left + origen.width / 2),
          y: destino.top + destino.height / 2 - (origen.top + origen.height * 0.42),
          scale: esc * 2.4,
          duration: 0.72,
          ease: 'power3.inOut',
        },
        0.08,
      )
      .to(el, { opacity: 0, duration: 0.12 }, 0.72)
      .add(() => {
        const av = chip.querySelector('.avatar');
        if (av) gsap.fromTo(av, { scale: 1.6 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' });
        const r = lienzo.current!.getBoundingClientRect();
        fx.current?.estallar((destino.left + destino.width / 2 - r.left) / r.width, (destino.top + destino.height / 2 - r.top) / r.height, [color, '#fff'], 26, 0.45);
        sonar.toque();
      }, 0.74);
  }, []);

  if (vista.conexion === 'sin_sala') return <SinSala codigo={codigo} />;
  if (!s) return <Cargando texto="Entrando al estadio" />;

  const enJuego = s.fase !== 'lobby' && s.fase !== 'final';
  const pausarTicker = s.fase === 'martillo' || s.fase === 'revela' || s.fase === 'ruleta';

  return (
    <div className="pantalla escenario" data-fase={s.fase}>
      <div className="lienzo" ref={lienzo}>
        <div className="tv-capa" data-on={s.fase === 'lobby' ? '1' : '0'}>
          {s.fase === 'lobby' && <LobbyTV s={s} />}
        </div>

        <div className="tv-capa tv-juego" data-on={enJuego ? '1' : '0'}>
          {enJuego && (
            <>
              <header className="tv-top">
                <div className="tv-marca">
                  <b className="logo-mini">SUBASTA FUTBOLERA</b>
                  <div className="tv-ronda" key={s.ronda?.indice ?? -1}>
                    {s.ronda ? (
                      <>
                        <span>
                          Ronda <b className="num">{s.ronda.indice + 1}</b>
                          <i className="num">/{s.ronda.total}</i>
                        </span>
                        <em>{POS_NOMBRE[s.ronda.pos]}</em>
                      </>
                    ) : (
                      <em>Preparando la subasta</em>
                    )}
                  </div>
                </div>
                <div className="tv-chips" data-n={s.jugadores.length >= 9 ? 'muchos' : s.jugadores.length >= 7 ? 'varios' : 'pocos'}>
                  {s.jugadores.map((j) => (
                    <Chip key={j.id} j={j} s={s} />
                  ))}
                </div>
              </header>

              <main className="tv-centro">
                <Escena sala={sala} s={s} tic={tic} fx={fx} alVolar={alVolar} />
                <div className="tv-reloj" data-on={s.fase === 'puja' || s.fase === 'ultima' || s.fase === 'presenta' ? '1' : '0'}>
                  <Reloj
                    sala={sala}
                    activo={s.fase === 'puja' || s.fase === 'ultima'}
                    vence={s.carta?.vence ?? 0}
                    duracion={s.fase === 'puja' || s.fase === 'ultima' ? (s.carta?.duracion ?? 1) : s.ajustes.segundos * 1000}
                    pausaResto={s.pausa ? s.pausaResto : undefined}
                    alTic={setTic}
                    sonido
                  />
                </div>
                <Ofertas s={s} />
                {s.fase === 'ruleta' && <Ruleta sala={sala} s={s} />}
                <CartelRonda s={s} />
                <FinRonda s={s} />
                <Baraja s={s} sala={sala} />
                <Tira s={s} panel={s.panel ?? panel} setPanel={elegirPanel} conSonido={conSonido} pausar={() => sala.enviar({ t: 'pausa', on: !s.pausa })} />
              </main>
            </>
          )}
        </div>

        <div className="tv-capa" data-on={s.fase === 'final' ? '1' : '0'}>
          {s.fase === 'final' && <FinalTV s={s} fx={fx} sala={sala} />}
        </div>

        {!enJuego && (
          <div className="tv-pantalla">
            <BotonPantalla />
          </div>
        )}
        <PanelTV s={s} panel={enJuego ? (s.panel ?? panel) : null} />
        <div className="tv-ticker">
          <Ticker mensajes={s.ticker} pausa={pausarTicker} alto={64} />
        </div>
        <Fx ref={fx} />
        {vista.conexion === 'reconectando' && (
          <div className="tv-reconecta">
            <i />
            Se cayó la señal. Reconectando…
          </div>
        )}
        {!conSonido && (s.fase === 'lobby' || s.fase === 'intro') && (
          <button className="tv-sonido" onClick={() => void activarSonido(true)} autoFocus>
            <i><IconoSonido on /></i> Pulsa OK para activar el sonido
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────── Tarjeta de participante ─────────────

function Chip({ j, s }: { j: JugadorSala; s: EstadoPublico }) {
  const lider = s.carta?.liderId === j.id && (s.fase === 'puja' || s.fase === 'ultima');
  const pendiente = s.ronda?.pendientes.includes(j.id);
  const n = cuentaEquipo(j);
  return (
    <div className="chip" data-chip={j.id} data-lider={lider ? '1' : '0'} data-pendiente={pendiente ? '1' : '0'} data-off={j.conectado ? undefined : '1'} style={{ '--c': j.color } as CSSProperties}>
      <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
      <div className="chip-datos">
        <span className="chip-nombre">{j.nombre}</span>
        <span className="chip-saldo">
          <Numero valor={j.saldo} prefijo="$" sufijo="M" />
        </span>
        <span className="chip-equipo">
          <i style={{ width: `${(n / 11) * 100}%` }} />
          <b className="num">{n}/11</b>
        </span>
      </div>
      <span className="chip-estado">{lider ? 'Va ganando' : !j.conectado ? 'Sin señal' : pendiente ? 'Falta' : s.ronda ? 'Listo' : ''}</span>
    </div>
  );
}

// ───────────── Últimas ofertas ─────────────

function Ofertas({ s }: { s: EstadoPublico }) {
  const lista = (s.carta?.ofertas ?? []).slice(-4).reverse();
  const visible = (s.fase === 'puja' || s.fase === 'ultima') && lista.length > 0;
  return (
    <div className="tv-ofertas" data-on={visible ? '1' : '0'}>
      {lista.map((o, i) => {
        const j = s.jugadores.find((x) => x.id === o.pid);
        if (!j) return null;
        return (
          <div className="oferta" key={`${o.pid}-${o.precio}`} data-i={i} style={{ '--c': j.color } as CSSProperties}>
            <Avatar src={j.avatar} color={j.color} />
            <span>{j.nombre}</span>
            <b className="num">${o.precio}M</b>
          </div>
        );
      })}
    </div>
  );
}

// ───────────── Tira inferior: candidatos de la ronda, pendientes y botones ─────────────

function Tira({ s, panel, setPanel, conSonido, pausar }: { s: EstadoPublico; panel: Panel; setPanel: (p: Panel) => void; conSonido: boolean; pausar: () => void }) {
  const [lite, setLite] = useState(esLite());
  useEffect(() => alCambiarLite(() => setLite(esLite())), []);
  const r = s.ronda;
  const quedan = r ? r.cartas.filter((c) => c.estado === 'espera' || c.estado === 'actual').length : 0;
  const pend = r ? r.pendientes.map((id) => s.jugadores.find((j) => j.id === id)!).filter(Boolean) : [];
  return (
    <div className="tv-tira" data-lleno={r && r.cartas.length + pend.length > 11 ? '1' : '0'} data-on={r && s.fase !== 'ronda' && s.fase !== 'finronda' ? '1' : '0'}>
      {r && (
        <>
          <div className="tira-bloque">
            <span className="tira-rotulo">
              Quedan <b className="num"><Numero valor={quedan} /></b> de <b className="num">{r.cartas.length}</b>
            </span>
            <div className="tira-cartas">
              {r.cartas.map((c, i) => {
                const comprador = s.jugadores.find((j) => j.id === c.compradorId);
                return (
                  <div className="mini" key={i} data-estado={c.estado} data-rareza={c.rareza} style={{ '--c': comprador?.color } as CSSProperties}>
                    {c.img && <img src={c.img} alt="" />}
                    {(c.estado === 'espera' || c.estado === 'actual') && <b>?</b>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="tira-bloque">
            <span className="tira-rotulo">
              {pend.length === 0 ? 'Todos compraron' : pend.length === 1 ? 'Falta 1 por comprar' : `Faltan ${pend.length} por comprar`}
            </span>
            <div className="tira-pend">
              {pend.map((j) => (
                <Avatar key={j.id} src={j.avatar} color={j.color} off={!j.conectado} />
              ))}
            </div>
          </div>
          <div className="tira-bloque tira-desc" data-cero={r.sobran === 0 ? '1' : '0'}>
            <span className="tira-rotulo">Se pueden descartar</span>
            <b className="num"><Numero valor={r.sobran} /></b>
          </div>
        </>
      )}
      <div className="tv-botones">
        <button data-on={s.pausa ? '1' : '0'} onClick={pausar}>
          <i className="num">P</i> <span>{s.pausa ? 'Seguir' : 'Pausa'}</span>
        </button>
        <button data-on={panel === 'equipos' ? '1' : '0'} onClick={() => setPanel(panel === 'equipos' ? null : 'equipos')}>
          <i className="num">1</i> <span>Equipos</span>
        </button>
        <button data-on={panel === 'saldos' ? '1' : '0'} onClick={() => setPanel(panel === 'saldos' ? null : 'saldos')}>
          <i className="num">2</i> <span>Saldos</span>
        </button>
        <button data-on={panel === 'historial' ? '1' : '0'} onClick={() => setPanel(panel === 'historial' ? null : 'historial')}>
          <i className="num">3</i> <span>Historial</span>
        </button>
        <button className="tv-ico" data-on={conSonido ? '1' : '0'} onClick={() => void activarSonido(!conSonido)} title={conSonido ? 'Con sonido' : 'Silencio'} aria-label={conSonido ? 'Quitar sonido' : 'Poner sonido'}>
          <IconoSonido on={conSonido} size={26} />
        </button>
        <button className="tv-ico" data-on={lite ? '1' : '0'} onClick={() => ponerLite(!lite)} title="Modo liviano (L): menos efectos para teles lentas" aria-label="Modo liviano">
          <IconoLiviano size={26} />
        </button>
        <BotonPantalla corto />
        {!esTele() && (
          <button onClick={(e) => void irConTelon(`/r/${s.codigo}`, { origen: { x: e.clientX, y: e.clientY } })}>Mi pantalla</button>
        )}
      </div>
    </div>
  );
}

// ───────────── Paneles superpuestos (no interrumpen la subasta) ─────────────

function PanelTV({ s, panel }: { s: EstadoPublico; panel: Panel }) {
  // Se recuerda el último panel para que la salida también se anime.
  const ultimo = useRef<Panel>(null);
  if (panel) ultimo.current = panel;
  const p = panel ?? ultimo.current;
  const max = Math.max(1, ...s.jugadores.map((j) => j.saldo + j.gastado));
  const compras = [...s.historial].filter((h) => h.compradorId).reverse();
  return (
    <div className="tv-panel" data-on={panel ? '1' : '0'} data-panel={p ?? ''}>
      {p === 'equipos' && (
        <div className="panel-equipos" data-n={s.jugadores.length}>
          {s.jugadores.map((j) => (
            <div className="panel-equipo" key={j.id} style={{ '--c': j.color } as CSSProperties}>
              <header>
                <Avatar src={j.avatar} color={j.color} />
                <b>{j.nombre}</b>
                <span className="num">
                  ${j.saldo}M · {cuentaEquipo(j)}/11
                </span>
              </header>
              <CanchaMedida equipo={j.equipo} color={j.color} huecoActivo={s.ronda?.pendientes.includes(j.id) ? s.ronda.hueco : undefined} />
            </div>
          ))}
        </div>
      )}
      {p === 'saldos' && (
        <div className="panel-saldos">
          <h2>Saldos</h2>
          {[...s.jugadores]
            .sort((a, b) => b.saldo - a.saldo)
            .map((j) => (
              <div className="saldo-fila" key={j.id} style={{ '--c': j.color } as CSSProperties}>
                <Avatar src={j.avatar} color={j.color} />
                <b>{j.nombre}</b>
                <div className="saldo-barra">
                  <i style={{ transform: `scaleX(${j.saldo / max})` }} />
                </div>
                <span className="num saldo-monto">${j.saldo}M</span>
                <span className="saldo-extra">
                  gastó <b className="num">${j.gastado}M</b> · tope <b className="num">${j.tope}M</b> · skips <b className="num">{j.skips}</b>
                </span>
              </div>
            ))}
          <p className="panel-nota">
            Reserva actual: <b className="num">${s.jugadores[0]?.reserva ?? 0}M</b> por cabeza. Es lo que hay que guardar para poder completar el equipo.
          </p>
        </div>
      )}
      {p === 'historial' && (
        <div className="panel-historial">
          <h2>Historial de compras</h2>
          <div className="historial-lista">
            {compras.length === 0 && <p className="panel-nota">Todavía nadie compró nada. Tacaños.</p>}
            {compras.slice(0, 27).map((h) => {
              const j = s.jugadores.find((x) => x.id === h.compradorId);
              return (
                <div className="historial-fila" key={h.carta.uid} data-rareza={h.carta.rareza} style={{ '--c': j?.color } as CSSProperties}>
                  <span className="historial-foto">
                    <img src={h.carta.img} alt="" />
                  </span>
                  <span className="historial-nombre">
                    <b>{h.carta.apellido || h.carta.nombre}</b>
                    <i>
                      {h.carta.pos} · {j?.nombre ?? 'se fue'}
                      {h.desenlace === 'obligado' ? ' · obligado' : h.desenlace === 'ruleta' ? ' · ruleta' : ''}
                    </i>
                  </span>
                  <em className="num">${h.precio}M</em>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Cancha que calcula su propia unidad de medida (para dibujar igual a cualquier tamaño). */
export function CanchaMedida(props: Parameters<typeof Cancha>[0]) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const medir = () => el.style.setProperty('--ch', `${el.clientWidth / 300}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="cancha-caja">
      <Cancha {...props} />
    </div>
  );
}

// ───────────── Cartel de ronda ─────────────

function CartelRonda({ s }: { s: EstadoPublico }) {
  const r = s.ronda;
  const on = s.fase === 'ronda';
  useEffect(() => {
    if (on) sonar.barrido();
  }, [on]);
  return (
    <div className="cartel-ronda" data-on={on ? '1' : '0'}>
      <Fondo paleta="oscuro" />
      {r && (
        <div className="cartel-texto" key={r.indice}>
          <span className="cartel-num">
            Ronda <b className="num">{r.indice + 1}</b>
            <i className="num">/{r.total}</i>
          </span>
          <h2>{POS_NOMBRE[r.pos]}</h2>
          <p>
            {r.cartas.length} cartas · {s.jugadores.length} compradores · {r.sobran > 0 ? `sobra${r.sobran > 1 ? 'n' : ''} ${r.sobran}` : 'no sobra ninguna'}
          </p>
        </div>
      )}
    </div>
  );
}

// ───────────── Resumen de fin de ronda ─────────────

function FinRonda({ s }: { s: EstadoPublico }) {
  const on = s.fase === 'finronda';
  const r = s.ronda;
  const compras = r ? s.historial.filter((h) => h.ronda === r.indice && h.compradorId) : [];
  return (
    <div className="fin-ronda" data-on={on ? '1' : '0'}>
      <Fondo paleta="oscuro" />
      {r && on && (
        <div className="fin-cont">
          <h2>
            {POS_NOMBRE[r.pos]} <span>· así quedó</span>
          </h2>
          <div className="fin-grilla">
            {compras.map((h, i) => {
              const j = s.jugadores.find((x) => x.id === h.compradorId);
              return (
                <div className="fin-carta" key={h.carta.uid} data-paleta={h.carta.rareza} style={{ '--c': j?.color, '--i': i } as CSSProperties}>
                  <div className="fin-foto">
                    <img src={h.carta.img} alt="" />
                  </div>
                  <b>{h.carta.apellido || h.carta.nombre}</b>
                  <span>
                    {j && <Avatar src={j.avatar} color={j.color} />}
                    {j?.nombre} <em className="num">${h.precio}M</em>
                  </span>
                </div>
              );
            })}
          </div>
          {!!s.sobrantes?.length && (
            <p className="fin-sobrantes">
              Nadie llegó a ver a: <b>{s.sobrantes.map((c) => c.apellido || c.nombre).join(' · ')}</b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────── Barajando el mazo + cuenta regresiva ─────────────

function Baraja({ s, sala }: { s: EstadoPublico; sala: Sala }) {
  const on = s.fase === 'intro';
  const raiz = useRef<HTMLDivElement>(null);
  const [cuenta, setCuenta] = useState(0);

  useLayoutEffect(() => {
    if (!on || !raiz.current) return;
    const q = gsap.utils.selector(raiz.current);
    const cartas = q('.baraja-carta');
    const rm = reducirMovimiento();
    const t = gsap.timeline();
    sonar.barrido();
    t.from(q('.baraja-titulo > *'), { yPercent: 120, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0)
      .from(cartas, { y: 700, rotation: () => gsap.utils.random(-50, 50), duration: 0.7, ease: 'expo.out', stagger: 0.035 }, 0.1);
    if (!rm) {
      // Mezcla: las cartas se abren en dos pilas y se entrelazan, tres veces.
      for (let v = 0; v < 3; v++) {
        t.to(cartas, { x: (i) => (i % 2 ? 190 : -190), rotation: (i) => (i % 2 ? 9 : -9), duration: 0.32, ease: 'power2.inOut', stagger: 0.012 }, '>')
          .add(() => sonar.ruletaTic())
          .to(cartas, { x: 0, rotation: (i) => (i - 6) * 0.6, y: (i) => -i * 2.4, duration: 0.3, ease: 'power3.in', stagger: 0.02 }, '>');
      }
      // Abanico final.
      t.to(cartas, { rotation: (i) => (i - 5.5) * 9, x: (i) => (i - 5.5) * 46, y: (i) => Math.abs(i - 5.5) * 9, duration: 0.7, ease: 'back.out(1.6)', stagger: 0.02 }, '>0.05');
    }
    return () => void t.kill();
  }, [on]);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let previo = -1;
    const paso = () => {
      const resto = s.vence - sala.ahora();
      const n = resto <= 3200 && resto > 200 ? Math.ceil((resto - 200) / 1000) : 0;
      if (n !== previo) {
        previo = n;
        setCuenta(n);
        if (n > 0) sonar.cuenta(4 - n);
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [on, s.vence, sala]);

  const total = s.jugadores.length + s.ajustes.extra;
  return (
    <div className="baraja" data-on={on ? '1' : '0'} ref={raiz}>
      <Fondo paleta="oscuro" vel={2} />
      {on && (
        <>
          <div className="baraja-titulo">
            <span>Barajando el mazo</span>
            <h2>Se viene el remate</h2>
            <p>
              11 rondas · {total} cartas por ronda · ${s.ajustes.presupuesto}M por cabeza
            </p>
          </div>
          <div className="baraja-mazo">
            {Array.from({ length: 12 }, (_, i) => (
              <i className="baraja-carta" key={i} />
            ))}
          </div>
          <div className="baraja-cuenta num" key={cuenta} data-n={cuenta}>
            {cuenta > 0 ? cuenta : ''}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── Lobby en la TV ─────────────

function LobbyTV({ s }: { s: EstadoPublico }) {
  const url = `${location.origin}/r/${s.codigo}`;
  const tema = TEMAS.find((t) => t.id === s.ajustes.tema);
  return (
    <div className="tv-lobby">
      <Fondo paleta="misterio" />
      <div className="lobby-izq">
        <b className="logo-mini">SUBASTA FUTBOLERA</b>
        <span className="lobby-rotulo">Escanea para entrar a la sala</span>
        <div className="lobby-codigo" aria-label={`Código ${s.codigo}`}>
          {s.codigo.split('').map((l, i) => (
            <b key={i} style={{ '--i': i } as CSSProperties}>
              {l}
            </b>
          ))}
        </div>
        <span className="lobby-url">
          o entra a <b>{location.host}</b> y escribe el código
        </span>
        <div className="lobby-reglas">
          <span>
            <b className="num">${s.ajustes.presupuesto}M</b> por cabeza
          </span>
          <span>
            <b className="num">{s.ajustes.segundos}s</b> por oferta
          </span>
          <span>
            <b className="num">+{s.ajustes.incremento}M</b> cada toque
          </span>
          <span>
            <b className="num">{s.ajustes.skips}</b> skips
          </span>
          <span>
            <b className="num">
              {s.ajustes.trollsMin}–{s.ajustes.trollsMax}
            </b>{' '}
            trolls por ronda
          </span>
          <span>{tema?.nombre}</span>
        </div>
      </div>
      <div className="lobby-qr">
        <QR texto={url} />
      </div>
      <div className="lobby-gente">
        <h3>
          En la sala <b className="num">{s.jugadores.length}</b>
          <i className="num">/{MAX_PARTICIPANTES}</i>
        </h3>
        <div className="lobby-lista">
          {s.jugadores.map((j, i) => (
            <div className="lobby-jugador" key={j.id} style={{ '--c': j.color, '--i': i } as CSSProperties} data-off={j.conectado ? undefined : '1'}>
              <Avatar src={j.avatar} color={j.color} off={!j.conectado} />
              <b>{j.nombre}</b>
              {j.id === s.anfitrionId && <i>Anfitrión</i>}
            </div>
          ))}
          {s.jugadores.length === 0 && <p className="lobby-vacio">La tribuna está vacía. Que alguien escanee el código.</p>}
        </div>
        <p className="lobby-espera">
          {s.jugadores.length < 2 ? 'Hacen falta al menos 2 para rematar' : 'Esperando que el anfitrión toque EMPEZAR'}
          <span className="puntos">
            <i />
            <i />
            <i />
          </span>
        </p>
      </div>
    </div>
  );
}

// ───────────── Final ─────────────

function FinalTV({ s, fx, sala }: { s: EstadoPublico; fx: React.RefObject<FxApi | null>; sala: Sala }) {
  const raiz = useRef<HTMLDivElement>(null);
  const f = s.final;
  const puestos = useMemo(() => (f ? f.puestos.map((p) => ({ ...p, j: s.jugadores.find((j) => j.id === p.pid)! })).filter((p) => p.j) : []), [f, s.jugadores]);
  const [premio, setPremio] = useState(0);
  const ganador = puestos[0]?.j;
  const vista = useEquipoEnPantalla(sala, s);
  const mostrado = puestos.find((p) => p.pid === vista.pid) ?? puestos[0];
  const puestoMostrado = puestos.indexOf(mostrado) + 1;

  useLayoutEffect(() => {
    if (!raiz.current || !puestos.length) return;
    const q = gsap.utils.selector(raiz.current);
    const filas = q('.final-fila');
    const t = gsap.timeline();
    // Del último al primero, con suspenso creciente.
    t.from(q('.final-titulo > *'), { yPercent: 130, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.1 }, 0.1);
    [...filas].reverse().forEach((fila, i) => {
      t.from(fila, { xPercent: -30, opacity: 0, duration: 0.5, ease: 'expo.out' }, 1 + i * 0.75).add(() => sonar.tic(i === filas.length - 1), '<');
    });
    t.add(() => {
      sonar.fanfarria();
      const c = ganador ? [ganador.color, '#fff', '#ffe27a'] : ['#fff'];
      fx.current?.confeti(c, 260);
      fx.current?.estallar(0.72, 0.5, c, 120, 1.3);
    })
      .from(q('.final-campeon'), { scale: 0.8, opacity: 0, duration: 0.8, ease: 'back.out(1.8)' }, '<')
      .from(q('.final-premios'), { yPercent: 40, opacity: 0, duration: 0.6, ease: 'expo.out' }, '>-0.2');
    return () => void t.kill();
  }, [puestos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!f?.premios.length) return;
    const id = setInterval(() => setPremio((p) => (p + 1) % f.premios.length), 5200);
    return () => clearInterval(id);
  }, [f?.premios.length]);

  if (!f) return null;
  const pr = f.premios[premio];
  const dueno = s.jugadores.find((j) => j.id === pr?.pid);
  return (
    <div className="tv-final" ref={raiz}>
      <Fondo paleta={ganador ? 'oro' : 'oscuro'} vel={1.6} />
      <div className="final-izq">
        <div className="final-titulo">
          <span>Se bajó el martillo</span>
          <h1>Resultados</h1>
        </div>
        <div className="final-tabla">
          {puestos.map((p, i) => (
            <div className="final-fila" key={p.pid} data-puesto={i + 1} data-on={mostrado?.pid === p.pid ? '1' : '0'} style={{ '--c': p.j.color } as CSSProperties}>
              <b className="num final-pos">{i + 1}</b>
              <Avatar src={p.j.avatar} color={p.j.color} />
              <span className="final-nombre">{p.j.nombre}</span>
              <span className="final-detalle">
                media <b className="num">{Math.round(p.desglose.rating / 11)}</b> · sobró <b className="num">${p.j.saldo}M</b>
                {p.desglose.trolls < 0 && (
                  <>
                    {' '}
                    · trolls <b className="num">{p.desglose.trolls}</b>
                  </>
                )}
              </span>
              <em className="num">{p.puntos}</em>
            </div>
          ))}
        </div>
        {pr && (
          <div className="final-premios" key={premio} style={{ '--c': dueno?.color } as CSSProperties}>
            <span>Premio</span>
            <b>{pr.titulo}</b>
            <p>{pr.detalle}</p>
          </div>
        )}
      </div>
      {mostrado && (
        <div className="final-campeon" key={mostrado.pid} style={{ '--c': mostrado.j.color } as CSSProperties}>
          <header>
            <Avatar src={mostrado.j.avatar} color={mostrado.j.color} />
            <span>
              {puestoMostrado === 1 ? 'Mejor equipo' : `Puesto ${puestoMostrado}`}
              <b>{mostrado.j.nombre}</b>
            </span>
          </header>
          <CanchaMedida equipo={mostrado.j.equipo} color={mostrado.j.color} />
          <footer className="final-rota" data-auto={vista.auto ? '1' : '0'}>
            {vista.auto ? (
              <>
                <i key={mostrado.pid} style={{ animationDuration: `${vista.resto}ms` }} />
                Cambia solo cada 15 s
              </>
            ) : (
              'Elegido por el anfitrión'
            )}
          </footer>
        </div>
      )}
    </div>
  );
}

// ───────────── Estados especiales ─────────────

export function Cargando({ texto }: { texto: string }) {
  return (
    <div className="pantalla cargando">
      <Fondo paleta="oscuro" />
      <div className="cargando-cont">
        <div className="cargando-martillo">
          <i />
        </div>
        <b>{texto}</b>
        <span className="puntos">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

export function SinSala({ codigo }: { codigo: string }) {
  return (
    <div className="pantalla cargando">
      <Fondo paleta="troll" />
      <div className="cargando-cont">
        <b className="sinsala-codigo">{codigo}</b>
        <b>Esa sala no existe o ya cerró</b>
        <span>Las salas se cierran solas cuando todos se van.</span>
        <button className="btn btn--acento" autoFocus onClick={(e) => void irConTelon('/', { origen: { x: e.clientX, y: e.clientY } })}>
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
