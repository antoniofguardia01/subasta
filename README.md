# Subasta Futbolera

Juego web multijugador en tiempo real: una subasta de futbolistas donde 3–10 amigos arman su equipo pujando desde el celular, con una TV como escenario principal. Uso personal, sin fines comerciales.

## Cómo se juega

- Formación fija 4-3-3, 11 rondas (una por hueco). En cada ronda salen `participantes + extra` cartas.
- Cada carta sale como **silueta + precio mínimo**. Un solo botón **OFERTAR** suma 1M. Cada oferta reinicia el contador de 15 s.
- Si nadie oferta y sobran cartas, la carta pasa. Si no sobran: última oportunidad (10 s) y después **ruleta**. El último pendiente se lleva la última carta al precio mínimo.
- **Trolls camuflados:** salen con precio de futbolista real; quien lo compra paga lo que ofertó. La cantidad por ronda depende de los participantes (6 → 1–3, 10 → 3–5).
- **Reserva de presupuesto:** nadie puede ofertar más de `saldo − (carta más barata de cada ronda que le falta)`. Así nunca hay un estado sin salida.

## Arquitectura

Un solo Cloudflare Worker, sin base de datos:

| Parte | Dónde | Qué hace |
|---|---|---|
| Motor | `shared/` | Reglas puras en TypeScript: mazo, ofertas, contador, ruleta, reserva, puntaje, ticker. Sin red ni relojes reales. |
| Servidor | `worker/` | `RoomDO` (una sala por Durable Object, estado en memoria + WebSockets) y `RegistryDO` (emparejamiento de TVs). |
| Interfaz | `src/` | Vite + React + GSAP. Pantallas: inicio, celular (`/r/CODIGO`), escenario TV (`/stage/CODIGO`), modo TV (`/tv`). |
| Datos | `data/` | `players.json`, `trolls.json`, `ticker.json`. Fotos en `public/img/`. |

El servidor es autoritativo: sortea el mazo, lleva el reloj, ordena las ofertas y decide las adjudicaciones. La identidad de una carta no viaja al cliente hasta la revelación; las imágenes se piden por un token opaco (`/c/SALA/token`).

## Desarrollo

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:8787`. El PIN de administración local está en `.dev.vars` (`ADMIN_PIN=...`, no se sube al repo).

Otros comandos:

| Comando | Para qué |
|---|---|
| `npm test` | Tests del motor (mazo, ofertas, contador, ruleta, reserva, trolls). |
| `npm run typecheck` | Tipos de interfaz, servidor y scripts. |
| `npm run photos:import` | Importa fotos de los jugadores sin foto de `data/players.json` y genera `data/photos-report.json`. |
| `npm run fotos:hoja` | Genera `docs/validacion-fotos.png` (silueta + revelación de cada jugador). |
| `npm run fuentes` | Regenera `src/fonts` y `src/styles/fuentes.css` (ver comentario del script). |
| `npm run deploy` | Compila y publica el Worker. |

## API de administración

Todas llevan la cabecera `x-admin-pin`.

| Ruta | Cuerpo | Qué hace |
|---|---|---|
| `POST /api/admin/ticker` | `{ "sala": "ABCD", "texto": "…", "fijo": false }` | Manda un mensaje a la barra de noticias de esa sala. |
| `POST /api/admin/avanzar` | `{ "sala": "ABCD", "hasta": "ronda" \| "final" }` | Herramienta de pruebas: adelanta la partida sin ofertas. |

## Escenarios

Cinco escenarios elegibles (el anfitrión elige el de la sala; cada celular puede usar otro): Noche de estadio, Noche de copa, Álbum del 86, Pizarra táctica y Atardecer en Miami. Cada uno cambia paleta, patrón de fondo y tipografías. Los colores de rareza (plata, oro, prime, leyenda, troll) son iguales en todos.

## Estado

Ver `CLAUDE.md` para el plan por etapas y lo que falta.
