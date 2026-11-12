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
- `src/components/Iconos.tsx` — íconos SVG dibujados (rarezas, sonido, liviano…); no usar glifos de texto. `Escaner.tsx` — lector de QR (BarcodeDetector o jsQR bajo demanda) en Conectar TV.
- `src/lib/sonido.ts` — sintetizador + muestras; `ambiente(nivel)` es la tribuna de fondo de la TV. `src/lib/rendimiento.ts` — modo liviano (Smart TV automática, medición continua, botón/tecla L).
- `src/styles/fuentes.css` — generado. Cada escenario tiene una familia compuesta: `font-stretch: 62%` = titular, `100%` = texto, `125%` = placa.
- `tests/engine.test.ts` — tests del motor. Correr `npm test` después de tocar `shared/`.

## Pantallas

- Celular, iPad y PC usan `/r/CODIGO` (columna centrada de hasta 680 px; en PC la barra espaciadora oferta). En PC e iPad horizontal hay un diseño a dos columnas (escena grande + controles). El escenario (`/stage/CODIGO`) se abre desde Modo TV; el dueño pidió quitar el botón de pantalla principal para los jugadores. Todos tienen botón de pantalla completa (`BotonPantalla`; no existe en iPhone).

## Cómo probar en navegador

`npm run dev` levanta todo en `:8787`. Para ver los resultados sin jugar 11 rondas: `POST /api/admin/avanzar` con `{"sala":"ABCD","hasta":"final"}` y la cabecera `x-admin-pin` (local: el de `.dev.vars`).

## Tareas frecuentes

- **Agregar o corregir un jugador:** editar `data/players.json` (id, nombre, apellido, pos, pais, rating, rareza, precioMinimo, etiqueta, dato, fotos). Dejar `fotos: []` y correr `npm run photos:import -- <id>`; si la búsqueda trae a otra persona, poner el campo `ea` con el id correcto y repetir.
- **Cambiar un precio mínimo:** `precioMinimo` en `data/players.json`. Escala: leyenda 150–250, prime 100–150, oro 60–100, plata 30–60, común 10–30.
- **Trolls, jugadores, precios y mensajes en producción:** panel web en `/admin` (PIN) o por línea de comandos con `SUBASTA_PIN=… node scripts/admin.mjs <comando>` (sin argumentos muestra la ayuda). Comandos: `troll:add <fotos…> --nombre --desc`, `troll:list`, `troll:set`, `troll:foto`, `troll:borrar`, `jugador:buscar`, `jugador:set <id> --precio N`, `jugador:reset`, `ticker "texto" --sala ABCD`. Las fotos que el dueño manda por el chat: guardarlas en el scratchpad y subirlas con `troll:add` (sin `--nombre` quedan en "Sin nombre / pendientes" para que él las nombre). Para quitar el fondo hay un script de ejemplo probado: `rembg` (`pip install rembg onnxruntime`, modelo u2net, descarga de GitHub) + recorte de busto; cortes de las fotos del dueño ya subidos. Con `--sin-fondo` el CLI lo hace solo; si no, se muestran en óvalo.
- Los trolls del panel reemplazan a los dibujos de muestra de `data/trolls.json` apenas hay uno cargado. Todo lo editado vive en el Durable Object `CatalogDO` (`worker/catalog.ts`), no en el repo; `shared/catalogo.ts` lo mezcla con `data/*.json`.
- **Agregar burlas al ticker:** `data/ticker.json` → `plantillas` (`disparador`, `intensidad` 1–3, `texto` con `{jugador}`, `{monto}`, `{carta}`, `{rival}`, `{troll}`, `{descripcion}`, `{posicion}`, `{ultimo}`).

## Plan por etapas

1. **Slice jugable** ✅ — inicio, salas, emparejar TV, mazo, subasta completa, ruleta, resultados, 5 escenarios, 78 cartas con foto, trolls de muestra.
2. **Publicación y robustez** ✅ — publicado en `subasta-futbolera.antoniofguardia01.workers.dev` (`npm run deploy`; los archivos estáticos van al KV `subasta-futbolera-archivos`). La partida se guarda sola en el almacenamiento del Durable Object (`Partida.exportar/importar`) y se restaura tras un reinicio; probado matando el servidor en plena puja.
3. **Contenido** ✅ — 270 jugadores con foto (30 por posición, 15+15 laterales) y precio mínimo (`docs/precios.md`, `docs/precios.csv`); `npm run simulate` corre partidas de bots para calibrar. Pendiente: leyendas históricas (Maradona, Pelé…) sin fuente de retrato.
4. **Administración** ✅ — panel `/admin` con PIN (trolls con foto/nombre/descripción/pendientes, jugadores y precios, mensajes y plantillas del ticker) y CLI `scripts/admin.mjs` para Claude.
5. **Pulido** (en curso) — hecho: tribuna/silbato/uuuh, íconos SVG, modo liviano en Smart TV, escaneo de QR, diseño compacto para 7–10 participantes (probado con 9 bots: `diez.js` en el scratchpad de la sesión). Repaso de animación hecho (pausa y avisos con salida animada). Falta: prueba con celulares reales del dueño.

## Pendientes conocidos

- El PIN de administración de producción es un secreto del Worker (lo eligió el dueño; no escribirlo en el repo).
- `npm run deploy` sube a KV solo los archivos que cambiaron (manifiesto en la clave `__manifiesto`): el plan gratuito permite ~1000 escrituras por día y antes se subían los 323 archivos cada vez.
- Desde las sesiones en la nube, publicar necesita `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` y un `CLOUDFLARE_API_TOKEN` cualquiera (el proxy pone el real).
- Hay 27 trolls reales cargados en el panel (fotos de la carpeta de Drive "Guilles", 4 con fondo a pedido del dueño); faltan sus nombres y descripciones.
- Revisar a ojo las fotos importadas (`docs/validacion-fotos.png`): alguna puede ser de otra persona con el mismo apellido.
- Hay solo 4 leyendas (150M+): Messi, Cristiano, Modrić y Zlatan/Benzema en prime; la fuente de retratos no tiene jugadores históricos.
