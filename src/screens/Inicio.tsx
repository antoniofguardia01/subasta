// Pantalla de inicio: el estadio a oscuras, los reflectores se encienden, cae el martillo y se arma el logo.
import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { BotonPantalla, Fondo, Ticker } from '../components/comunes';
import { Fx, FxApi } from '../components/Fx';
import { irConTelon } from '../lib/ruta';
import { activarSonido, sonar, sonidoPreferido } from '../lib/sonido';
import { TEMAS, aplicarTema, elegirTemaPropio, temaActual } from '../lib/temas';
import { claveDispositivo, pareceTV, reducirMovimiento, usarFlechas, vibrar } from '../lib/util';

const TITULARES = [
  'Bienvenidos a la Subasta Futbolera: 1000 millones por cabeza y once huecos que llenar',
  'Cada oferta suma 1 millón. No hay vuelta atrás',
  'Las siluetas mienten. Los precios también',
  'Si nadie oferta y no sobran cartas, decide la ruleta',
  'Se juega con 3 a 8 amigos. O enemigos, da igual',
].map((texto, i) => ({ id: -10 - i, texto, tipo: 'sistema' as const }));

const FONDOS_PROPIOS = ['album', 'pizarra', 'miami'];

const centro = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export function Inicio() {
  const raiz = useRef<HTMLDivElement>(null);
  const fx = useRef<FxApi>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [modo, setModo] = useState<'menu' | 'codigo'>('menu');
  const [letras, setLetras] = useState('');
  const [estado, setEstado] = useState<'idle' | 'buscando' | 'ok' | 'mal'>('idle');
  const [creando, setCreando] = useState(false);
  const [siluetas, setSiluetas] = useState<string[]>([]);
  const [tema, setTema] = useState(temaActual());
  const [sonido, setSonido] = useState(sonidoPreferido());
  const cajas = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const tele = pareceTV();

  useEffect(() => {
    fetch('/api/datos')
      .then((r) => r.json())
      .then((d: { siluetas?: string[] }) => setSiluetas(d.siluetas ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => usarFlechas('.inicio-menu'), []);

  // ── Secuencia de entrada (≈4 s) ──
  useLayoutEffect(() => {
    const el = raiz.current!;
    const q = gsap.utils.selector(el);
    const rm = reducirMovimiento();
    const t = gsap.timeline({ defaults: { ease: 'expo.out' } });
    gsap.set(q('.ini-martillo'), { rotation: 28, opacity: 0 });
    gsap.set(q('.ini-letra'), { yPercent: 115 });
    gsap.set(q('.ini-placa'), { scaleX: 0 });
    gsap.set(q('.ini-placa span'), { opacity: 0 });
    gsap.set(q('.ini-entra'), { y: 36, opacity: 0 });
    gsap.set(q('.ini-haz'), { opacity: 0 });
    if (rm) {
      gsap.set(q('.ini-letra'), { yPercent: 0 });
      gsap.set(q('.ini-placa'), { scaleX: 1 });
      gsap.set(q('.ini-placa span, .ini-haz'), { opacity: 1 });
      gsap.set(q('.ini-entra'), { y: 0, opacity: 1 });
      gsap.set(q('.ini-negro'), { opacity: 0 });
      gsap.set(q('.ini-martillo'), { rotation: -90, opacity: 1 });
      return;
    }
    void video.current?.play().catch(() => {});
    // 0.0–1.4 s: de negro al estadio; los reflectores se encienden uno a uno.
    t.to(q('.ini-negro'), { opacity: 0, duration: 1.4, ease: 'power2.inOut' }, 0.15)
      .to(q('.ini-haz'), { opacity: 1, duration: 0.18, ease: 'steps(3)', stagger: 0.24, onStart: () => sonar.tic(true) }, 0.35)
      // 1.5 s: cae el martillo (acelera) y golpea.
      .to(q('.ini-martillo'), { opacity: 1, duration: 0.1 }, 1.45)
      .to(q('.ini-martillo'), { rotation: -90, duration: 0.42, ease: 'power3.in' }, 1.45)
      .add(() => {
        sonar.martillo();
        vibrar([40, 30, 90]);
        fx.current?.onda(0.5, 0.42, '#ffffff', 0.9);
        const p = getComputedStyle(document.documentElement);
        fx.current?.estallar(0.5, 0.42, [p.getPropertyValue('--acento').trim(), '#ffffff', p.getPropertyValue('--m0').trim()], 110, 1.2);
      }, 1.87)
      .fromTo(q('.ini-flash'), { opacity: 1 }, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 1.87)
      .fromTo(q('.ini-marca'), { scaleY: 0.9, scaleX: 1.04 }, { scaleY: 1, scaleX: 1, duration: 0.8, ease: 'elastic.out(1, 0.35)' }, 1.87)
      // Rebote del martillo: se levanta un poco y queda apoyado sobre el logo.
      .to(q('.ini-martillo'), { rotation: -74, duration: 0.16, ease: 'power2.out' }, 1.89)
      .to(q('.ini-martillo'), { rotation: -90, duration: 0.5, ease: 'bounce.out' }, 2.05)
      // 1.9 s: el logo se arma letra por letra, con resorte.
      .to(q('.ini-letra'), { yPercent: 0, duration: 0.7, ease: 'back.out(1.7)', stagger: 0.04 }, 1.9)
      .to(q('.ini-placa'), { scaleX: 1, duration: 0.55 }, 2.35)
      .to(q('.ini-placa span'), { opacity: 1, duration: 0.3, stagger: 0.03 }, 2.55)
      // 2.8 s: entran los botones, escalonados.
      .to(q('.ini-entra'), { y: 0, opacity: 1, duration: 0.6, stagger: 0.08 }, 2.8);
    return () => void t.kill();
  }, []);

  // ── Parallax con el cursor o el giroscopio ──
  useEffect(() => {
    if (reducirMovimiento()) return;
    const el = raiz.current!;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const paso = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      el.style.setProperty('--px', x.toFixed(4));
      el.style.setProperty('--py', y.toFixed(4));
      raf = requestAnimationFrame(paso);
    };
    const raton = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
    };
    const giro = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 30));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    addEventListener('pointermove', raton);
    addEventListener('deviceorientation', giro);
    raf = requestAnimationFrame(paso);
    return () => {
      removeEventListener('pointermove', raton);
      removeEventListener('deviceorientation', giro);
      cancelAnimationFrame(raf);
    };
  }, []);

  const crear = async (e: React.MouseEvent) => {
    if (creando) return;
    const origen = centro(e.currentTarget);
    setCreando(true);
    vibrar(20);
    try {
      const r = await fetch('/api/salas', { method: 'POST', body: JSON.stringify({ clave: claveDispositivo() }) });
      const d = (await r.json()) as { codigo: string };
      if (!d.codigo) throw new Error('sin código');
      sonar.barrido();
      await irConTelon(`/r/${d.codigo}`, { origen, cartel: d.codigo });
    } catch {
      setCreando(false);
      gsap.fromTo(e.currentTarget, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.25)' });
    }
  };

  const abrirCodigo = () => {
    setModo('codigo');
    setLetras('');
    setEstado('idle');
    setTimeout(() => entrada.current?.focus(), 60);
  };

  const escribir = async (v: string) => {
    const l = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (l.length > letras.length) {
      vibrar(8);
      sonar.toque();
    }
    setLetras(l);
    setEstado('idle');
    if (l.length < 4) return;
    setEstado('buscando');
    try {
      const r = await fetch(`/api/salas/${l}`);
      const d = (await r.json()) as { existe: boolean };
      if (!d.existe) throw new Error('no');
      setEstado('ok');
      vibrar([20, 40, 80]);
      sonar.barrido();
      entrada.current?.blur();
      setTimeout(() => void irConTelon(`/r/${l}`, { origen: cajas.current ? centro(cajas.current) : undefined, cartel: l }), 480);
    } catch {
      setEstado('mal');
      vibrar([30, 40, 30]);
      sonar.rechazo();
      if (cajas.current) gsap.fromTo(cajas.current, { x: -14 }, { x: 0, duration: 0.55, ease: 'elastic.out(1.2, 0.22)' });
      setTimeout(() => (setLetras(''), setEstado('idle')), 950);
    }
  };

  const cambiarTema = (id: string) => {
    vibrar(10);
    elegirTemaPropio(id);
    aplicarTema(id);
    setTema(id);
  };

  return (
    <div className="pantalla inicio" ref={raiz} data-modo={modo}>
      <div className="ini-fondo">
        <Fondo paleta="oscuro" />
        <video ref={video} className="ini-video" src="/media/estadio.mp4" poster="/media/estadio.jpg" muted playsInline preload="auto" />
        <div className="ini-tinte" />
        {/* Álbum, Pizarra y Miami tienen su propia ilustración de fondo (entra con fundido al elegir el escenario). */}
        {FONDOS_PROPIOS.includes(tema) && <img key={tema} className="ini-imagen" src={`/media/fondo-${tema}.jpg`} alt="" draggable={false} />}
        <div className="ini-haces" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <i className="ini-haz" key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <div className="ini-desfile" aria-hidden>
          {siluetas.map((s, i) => (
            <img key={s} src={s} alt="" style={{ '--i': i, '--n': siluetas.length } as CSSProperties} />
          ))}
        </div>
        <div className="ini-vineta" />
      </div>
      <div className="ini-negro" />
      <div className="ini-flash" />

      <main className="ini-centro">
        <div className="ini-marca">
          <h1 className="ini-logo" aria-label="Subasta Futbolera">
            <img className="ini-martillo" src="/media/martillo.webp" alt="" draggable={false} />
            <span className="ini-fila">
              {'SUBASTA'.split('').map((l, i) => (
                <b className="ini-letra" key={i}>
                  {l}
                </b>
              ))}
            </span>
            <span className="ini-placa">
              {'FUTBOLERA'.split('').map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </span>
          </h1>
          <p className="ini-bajada ini-entra">Arma tu equipo a los martillazos</p>
        </div>

        <div className="inicio-menu">
          <div className="ini-panel" data-on={modo === 'menu' ? '1' : '0'}>
            <button className="btn btn--acento ini-btn ini-entra" onClick={crear} disabled={creando} autoFocus={!tele}>
              {creando ? 'Armando la sala…' : 'Crear sala'}
            </button>
            <button className="btn ini-btn ini-entra" onClick={abrirCodigo}>
              Unirme con código
            </button>
            <button
              className="btn btn--linea ini-btn ini-btn--tv ini-entra"
              data-sugerido={tele ? '1' : undefined}
              autoFocus={tele}
              onClick={(e) => void irConTelon('/tv', { origen: centro(e.currentTarget), cartel: 'Modo TV' })}
            >
              Modo TV
              {tele && <small>Parece que esto es una tele: pulsa OK</small>}
            </button>
          </div>

          <div className="ini-panel ini-panel--codigo" data-on={modo === 'codigo' ? '1' : '0'}>
            <span className="ini-rotulo">Escribe el código de la sala</span>
            <div className="ini-cajas" ref={cajas} data-estado={estado} onClick={() => entrada.current?.focus()}>
              {[0, 1, 2, 3].map((i) => (
                <b key={i} data-lleno={letras[i] ? '1' : '0'} data-cursor={i === letras.length && estado === 'idle' ? '1' : undefined}>
                  <span key={letras[i] ?? ''}>{letras[i] ?? ''}</span>
                </b>
              ))}
              <input
                ref={entrada}
                value={letras}
                onChange={(e) => void escribir(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={4}
                aria-label="Código de la sala"
                tabIndex={modo === 'codigo' ? 0 : -1}
              />
            </div>
            <span className="ini-estado" data-estado={estado}>
              {estado === 'buscando' ? 'Buscando la sala…' : estado === 'ok' ? '¡Adentro!' : estado === 'mal' ? 'Esa sala no existe' : 'Cuatro letras, como en la tele'}
            </span>
            <button className="btn btn--linea ini-volver" onClick={() => setModo('menu')} tabIndex={modo === 'codigo' ? 0 : -1}>
              Volver
            </button>
          </div>
        </div>
      </main>

      <footer className="ini-pie ini-entra">
        <div className="ini-temas" role="radiogroup" aria-label="Escenario">
          <span>Escenario</span>
          {TEMAS.map((t) => (
            <button key={t.id} role="radio" aria-checked={tema === t.id} data-on={tema === t.id ? '1' : '0'} title={t.nombre} aria-label={t.nombre} onClick={() => cambiarTema(t.id)}>
              <i style={{ background: t.muestra[0] }} />
              <i style={{ background: t.muestra[1] }} />
            </button>
          ))}
          <em key={tema}>{TEMAS.find((t) => t.id === tema)?.nombre}</em>
        </div>
        <BotonPantalla corto className="ini-pantalla" />
      </footer>
      <button className="ini-sonido ini-entra" data-on={sonido ? '1' : '0'} onClick={() => (setSonido(!sonido), void activarSonido(!sonido))}>
        ♪ {sonido ? 'Con sonido' : 'Silencio'}
      </button>
      <div className="ini-ticker">
        <Ticker mensajes={TITULARES} alto={36} />
      </div>
      <Fx ref={fx} />
    </div>
  );
}
