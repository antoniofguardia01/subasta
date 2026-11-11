// Llegada desde el QR de una tele: el celular decide a qué sala mandarla, sin escribir nada.
import { useEffect, useState } from 'react';
import { Fondo } from '../components/comunes';
import { irConTelon } from '../lib/ruta';
import { claveDispositivo, guardar, leer, vibrar } from '../lib/util';

interface TvGuardada {
  tvId: string;
  nombre: string;
}

export function Vincular({ codigo }: { codigo: string }) {
  const [sala, setSala] = useState<string | null>(null);
  const [estado, setEstado] = useState<'viendo' | 'listo' | 'enviando' | 'ok' | 'mal'>('viendo');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    const ultima = leer<string | null>('sala', null);
    if (!ultima) return setEstado('listo');
    fetch(`/api/salas/${ultima}`)
      .then((r) => r.json())
      .then((d: { existe: boolean }) => {
        if (d.existe) setSala(ultima);
        setEstado('listo');
      })
      .catch(() => setEstado('listo'));
  }, []);

  const mandar = async (destino: string, origen: { x: number; y: number }) => {
    setEstado('enviando');
    try {
      const r = await fetch('/api/tv/vincular', { method: 'POST', body: JSON.stringify({ codigo, sala: destino }) });
      const d = (await r.json()) as { ok: boolean; tvId?: string; nombre?: string };
      if (!d.ok || !d.tvId) throw new Error('codigo');
      const tvs = leer<TvGuardada[]>('tvs', []);
      guardar('tvs', [{ tvId: d.tvId, nombre: d.nombre || 'TV' }, ...tvs.filter((t) => t.tvId !== d.tvId)]);
      setEstado('ok');
      setMensaje(`${d.nombre || 'La tele'} ya está entrando a la sala ${destino}.`);
      vibrar([20, 40, 80]);
      setTimeout(() => void irConTelon(`/r/${destino}`, { origen, cartel: destino }), 900);
    } catch {
      setEstado('mal');
      setMensaje('El código de la tele venció. Mira la pantalla: ya debe mostrar uno nuevo.');
      vibrar([30, 40, 30]);
    }
  };

  const crear = async (e: React.MouseEvent) => {
    const origen = { x: e.clientX, y: e.clientY };
    setEstado('enviando');
    try {
      const r = await fetch('/api/salas', { method: 'POST', body: JSON.stringify({ clave: claveDispositivo() }) });
      const d = (await r.json()) as { codigo: string };
      await mandar(d.codigo, origen);
    } catch {
      setEstado('mal');
      setMensaje('No se pudo crear la sala. Intenta de nuevo.');
    }
  };

  return (
    <div className="pantalla vincular">
      <Fondo paleta="misterio" />
      <div className="entrar-caja vincular-caja">
        <span className="entrar-sala">
          Tele <b>{codigo}</b>
        </span>
        <h1>Conectar esta tele</h1>
        {estado === 'viendo' && <p className="entrar-nota">Un segundo…</p>}
        {(estado === 'listo' || estado === 'enviando' || estado === 'mal') && (
          <>
            <p className="entrar-nota">¿A qué sala la mandamos?</p>
            {sala && (
              <button className="btn btn--acento" disabled={estado === 'enviando'} onClick={(e) => void mandar(sala, { x: e.clientX, y: e.clientY })}>
                A mi sala {sala}
              </button>
            )}
            <button className={`btn ${sala ? '' : 'btn--acento'}`} disabled={estado === 'enviando'} onClick={crear}>
              Crear una sala nueva
            </button>
          </>
        )}
        {mensaje && (
          <p className="entrar-error" data-ok={estado === 'ok' ? '1' : undefined} key={mensaje}>
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
