// Modo TV: muestra un código de 4 letras y un QR. No hace falta teclado: se empareja desde el celular.
import { CSSProperties, useEffect, useState } from 'react';
import { Fondo, QR } from '../components/comunes';
import { irConTelon } from '../lib/ruta';
import { apagarTele, encenderTele, renombrarTele, useTele } from '../lib/tele';
import { usarFlechas } from '../lib/util';

export function Tv() {
  const tele = useTele();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    encenderTele();
    return usarFlechas('.tv-modo');
  }, []);

  const url = tele.codigo ? `${location.origin}/v/${tele.codigo}` : '';
  return (
    <div className="pantalla tv-modo">
      <Fondo paleta="misterio" />
      <div className="tvm-radar" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="tvm-caja">
        <header>
          <b className="logo-mini">SUBASTA FUTBOLERA</b>
          <span className="tvm-estado" data-on={tele.conectada ? '1' : '0'}>
            <i />
            {tele.conectada ? 'Esperando que la conecten' : 'Buscando señal'}
            <span className="puntos">
              <i />
              <i />
              <i />
            </span>
          </span>
        </header>

        <div className="tvm-cuerpo">
          <div className="tvm-izq">
            <span className="tvm-rotulo">Código de esta tele</span>
            <div className="tvm-codigo" key={tele.codigo ?? 'x'}>
              {(tele.codigo ?? '····').split('').map((l, i) => (
                <b key={i} style={{ '--i': i } as CSSProperties}>
                  {l}
                </b>
              ))}
            </div>
            <ol className="tvm-pasos">
              <li>
                En tu celular, crea una sala o entra a una en <b>{location.host}</b>
              </li>
              <li>
                Toca <b>Conectar TV</b> y escribe este código
              </li>
              <li>O escanea el QR con la cámara. La tele entra sola.</li>
            </ol>
          </div>
          <div className="tvm-qr">{url && <QR texto={url} />}</div>
        </div>

        <footer>
          {editando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                renombrarTele(nombre);
                setEditando(false);
              }}
            >
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={24} autoFocus aria-label="Nombre de la tele" />
              <button className="btn btn--acento">Guardar</button>
            </form>
          ) : (
            <>
              <span>
                Esta tele se llama <b>{tele.nombre}</b>. Se recuerda para la próxima.
              </span>
              <button className="btn" onClick={() => (setNombre(tele.nombre), setEditando(true))}>
                Cambiar nombre
              </button>
              <button
                className="btn btn--linea"
                onClick={(e) => {
                  apagarTele();
                  void irConTelon('/', { origen: { x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 } });
                }}
              >
                Salir del modo TV
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
