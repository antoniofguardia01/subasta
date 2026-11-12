# Subasta Futbolera — guía para sesiones de Claude

Juego de subasta de futbolistas para jugar entre amigos (celulares + TV). Todo el texto de la interfaz va en **español neutro latinoamericano**, tono pícaro y futbolero. Los nombres de código (variables, archivos, mensajes) también están en español.

## Reglas del dueño del proyecto (no negociables)

- **Sin base de datos.** Estado de las partidas en memoria del Durable Object; datos del juego en archivos del repo.
- **No tocar nada existente en sus cuentas** (tiene un proyecto en Supabase y otros recursos en Vercel y Cloudflare): no leer datos, no ejecutar SQL, no cambiar configuración. Antes de crear cualquier recurso nuevo, avisar qué y dónde, y esperar su OK.
- Aprobado hasta ahora: un Worker nuevo `subasta-futbolera` en **su cuenta personal de Cloudflare** (plan gratuito) y el almacenamiento interno del Durable Object para lo que se edite desde el panel web.
- El repo es privado: las fotos de sus amigos (trolls) pueden vivir en él.
- Se trabaja **por etapas**: terminar una, mostrarla y esperar a que diga "siguiente".
- Animaciones y transiciones son el corazón del proyecto: ningún cambio de pantalla o de estado sin transición. Usar Higgsfield (si está conectado) para imágenes, video y sonido; avisar el costo en créditos.

## Mapa del código

- `shared/types.ts` — tipos, ajustes por defecto, `rangoTrolls(n)`, protocolo WebSocket.
- `shared/deck.ts` — sorteo del mazo (semilla), precio camuflado de trolls, garantía de cartas baratas.
- `shared/game.ts` — clase `Partida`: máquina de estados (`lobby → intro → ronda → presenta → puja → [ultima → ruleta] → martillo → revela → finronda → final`). Pura: el servidor llama `avanzar(ahora)`.
- `shared/score.ts`, `shared/ticker.ts` — puntaje/premios y burlas del ticker.
- `worker/room.ts` — sala (WebSockets, reloj, difusión). `worker/registry.ts` — TVs. `worker/index.ts` — rutas.
- `src/components/Escena.tsx` — la carta: silueta, martillazo y revelación (líneas de tiempo GSAP). **La silueta es la misma imagen con un filtro**; no duplicar assets.
- `src/screens/` — `Inicio`, `Jugador` (celular), `Escenario` (TV, lienzo fijo 1920×1080 escalado), `Tv` (emparejar), `Vincular`.
- `src/styles/fuentes.css` — generado. Cada escenario tiene una familia compuesta: `font-stretch: 62%` = titular, `100%` = texto, `125%` = placa.
- `tests/engine.test.ts` — tests del motor. Correr `npm test` después de tocar `shared/`.

## Cómo probar en navegador

`npm run dev` levanta todo en `:8787`. Para ver los resultados sin jugar 11 rondas: `POST /api/admin/avanzar` con `{"sala":"ABCD","hasta":"final"}` y la cabecera `x-admin-pin` (local: el de `.dev.vars`).

## Tareas frecuentes

- **Agregar o corregir un jugador:** editar `data/players.json` (id, nombre, apellido, pos, pais, rating, rareza, precioMinimo, etiqueta, dato, fotos). Dejar `fotos: []` y correr `npm run photos:import -- <id>`; si la búsqueda trae a otra persona, poner el campo `ea` con el id correcto y repetir.
- **Cambiar un precio mínimo:** `precioMinimo` en `data/players.json`. Escala: leyenda 150–250, prime 100–150, oro 60–100, plata 30–60, común 10–30.
- **Agregar un troll:** foto con fondo transparente en `public/img/trolls/` y una entrada en `data/trolls.json` (`id, nombre, descripcion, precioMinimo, rating, foto, activo`). `precioMinimo` solo se usa si la sala apaga "trolls camuflados". *(El comando `troll:add` y el panel web llegan en la etapa 4.)*
- **Agregar burlas al ticker:** `data/ticker.json` → `plantillas` (`disparador`, `intensidad` 1–3, `texto` con `{jugador}`, `{monto}`, `{carta}`, `{rival}`, `{troll}`, `{descripcion}`, `{posicion}`, `{ultimo}`).

## Plan por etapas

1. **Slice jugable** ✅ — inicio, salas, emparejar TV, mazo, subasta completa, ruleta, resultados, 5 escenarios, 78 cartas con foto, trolls de muestra.
2. **Publicación y robustez** ✅ — publicado en `subasta-futbolera.antoniofguardia01.workers.dev` (`npm run deploy`; los archivos estáticos van al KV `subasta-futbolera-archivos`). La partida se guarda sola en el almacenamiento del Durable Object (`Partida.exportar/importar`) y se restaura tras un reinicio; probado matando el servidor en plena puja.
3. **Contenido** — los 270 jugadores con precio mínimo (tabla para revisar), simulación de calibración, fotos de leyendas, informe de fallos.
4. **Administración** — panel web con PIN (trolls con nombre/descripción/pendientes, jugadores, precios, ticker) y la vía por Claude (`troll:add` + endpoints).
5. **Pulido** — repaso de animación pantalla por pantalla, sonido completo, íconos dibujados (hoy hay glifos), modo lite en TV real, escaneo de QR, prueba con 5–10 celulares.

## Pendientes conocidos

- El PIN de administración no está configurado en producción (falta `wrangler secret put ADMIN_PIN`).
- Desde las sesiones en la nube, publicar necesita `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` y un `CLOUDFLARE_API_TOKEN` cualquiera (el proxy pone el real).
- Los trolls actuales son dibujos de muestra; faltan las fotos reales.
- Revisar a ojo las fotos importadas (`docs/validacion-fotos.png`): alguna puede ser de otra persona con el mismo apellido.
- Faltan Keylor Navas y Ochoa (sin retrato en la fuente).
