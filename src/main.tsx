import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fuentes.css';
import './styles/base.css';
import './styles/escena.css';
import './styles/escenario.css';
import './styles/jugador.css';
import './styles/inicio.css';
import './styles/admin.css';
import { Escenario } from './screens/Escenario';
import { Inicio } from './screens/Inicio';
import { Jugador } from './screens/Jugador';
import { Tv } from './screens/Tv';
import { Admin } from './screens/Admin';
import { Vincular } from './screens/Vincular';
import { ir, irConTelon, useRuta } from './lib/ruta';
import { alLlamarTele, encenderTele, esTele, teleEnSala } from './lib/tele';
import { aplicarTema, temaPropio } from './lib/temas';
import { vigilarRendimiento } from './lib/rendimiento';

aplicarTema(temaPropio() ?? 'estadio');
vigilarRendimiento();

function App() {
  const ruta = useRuta();
  const partes = ruta.split('/').filter(Boolean);
  const codigo = (partes[1] ?? '').toUpperCase();

  // Una tele emparejada obedece al celular: va sola a la sala que le manden.
  useEffect(() => {
    if (esTele() && (partes[0] === 'tv' || partes[0] === 'stage')) encenderTele();
    return alLlamarTele((sala) => void irConTelon(sala ? `/stage/${sala}` : '/tv', { cartel: sala ?? 'Modo TV' }));
  }, [partes[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    teleEnSala(partes[0] === 'stage' ? codigo : null);
  }, [partes[0], codigo]);

  // Atajo: /ABCD lleva directo a la sala.
  useEffect(() => {
    if (partes.length === 1 && /^[A-Za-z]{4}$/.test(partes[0]) && partes[0] !== 'tv') ir(`/r/${partes[0].toUpperCase()}`, true);
  }, [ruta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (partes[0] === 'stage' && codigo) return <Escenario key={codigo} codigo={codigo} />;
  if (partes[0] === 'r' && codigo) return <Jugador key={codigo} codigo={codigo} />;
  if (partes[0] === 'v' && codigo) return <Vincular key={codigo} codigo={codigo} />;
  if (partes[0] === 'tv') return <Tv />;
  if (partes[0] === 'admin') return <Admin />;
  return <Inicio />;
}

createRoot(document.getElementById('app')!).render(<App />);
