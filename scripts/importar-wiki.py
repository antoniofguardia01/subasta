#!/usr/bin/env python3
"""Importa retratos de Wikipedia para jugadores que el buscador de EA no tiene (leyendas retiradas, etc.).

Cada jugador de data/players.json con el campo "wiki" (título del artículo en inglés) y sin foto se baja,
se le quita el fondo con rembg (u2net), se recorta a busto y se encuadra igual que los demás (720×640 WebP).
Guarda la fuente en "fotoFuente". Las fotos de Wikipedia/Commons tienen licencias libres; el repo es privado.

  pip install rembg onnxruntime pillow
  python3 scripts/importar-wiki.py                 # todos los que tienen "wiki" y no tienen foto
  python3 scripts/importar-wiki.py pele zidane     # solo esos ids (reemplaza la foto si ya había)
  python3 scripts/importar-wiki.py --hoja out.png  # además arma una hoja de contactos para revisar a ojo
  python3 scripts/importar-wiki.py --foto id=ruta.jpg[@x0,y0,x1,y1]   # foto propia (ej. enviada por el dueño), con recorte opcional en px

Si el recorte sale mal (otra persona, mala luz), poner en "wikiImg" la URL de otra imagen de Commons y repetir.
Desde las sesiones en la nube hace falta HTTPS_PROXY / SSL_CERT_FILE (ya vienen configurados).
"""
import io, json, os, sys, time, urllib.error, urllib.parse, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from rembg import new_session, remove

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATOS = os.path.join(RAIZ, 'data/players.json')
SALIDA = os.path.join(RAIZ, 'public/img/players')
ANCHO, ALTO = 720, 640
UA = {'User-Agent': 'SubastaFutbolera/1.0 (juego privado entre amigos)'}


def pedir(url):
    # Wikimedia limita a los clientes apurados (429): se espera cada vez más y se reintenta.
    for intento in range(6):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or intento == 5:
                raise
            time.sleep(20 * (intento + 1))


def imagen_de_wikipedia(titulo):
    api = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(titulo.replace(' ', '_'), safe='()_,')
    d = json.loads(pedir(api))
    # Se prefiere la miniatura grande (1600 px) a la original, que a veces pesa 20 MB.
    src = (d.get('originalimage') or {}).get('source') or (d.get('thumbnail') or {}).get('source')
    if not src:
        raise RuntimeError('el artículo no tiene imagen')
    return src.split('?')[0]


def a_busto(cortada):
    """Recorta al sujeto y, si es de cuerpo entero o medio cuerpo largo, se queda con la parte de arriba."""
    al = np.asarray(cortada.split()[3])
    ys, xs = np.where(al > 40)
    if len(ys) < 800:
        raise RuntimeError('sin sujeto')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    ancho = x1 - x0
    # Cuerpo entero: los hombros son ~1/4 del alto, así que el busto es ~1.1 de ancho.
    if (y1 - y0) / ancho > 1.5:
        y1 = min(y1, y0 + int(ancho * 1.15))
        # Con la cabeza arriba los hombros se miden recién ahí: se recalcula el ancho del tramo conservado.
        sub = al[y0:y1]
        xs2 = np.where(sub.max(axis=0) > 40)[0]
        x0, x1 = xs2.min(), xs2.max() + 1
    return cortada.crop((x0, y0, x1, y1))


def encuadrar(busto):
    k = min(ANCHO * 0.96 / busto.width, ALTO * 0.92 / busto.height)
    b = busto.resize((max(1, round(busto.width * k)), max(1, round(busto.height * k))), Image.LANCZOS)
    lienzo = Image.new('RGBA', (ANCHO, ALTO), (0, 0, 0, 0))
    lienzo.paste(b, ((ANCHO - b.width) // 2, ALTO - b.height), b)
    return lienzo


def main():
    args = sys.argv[1:]
    hoja = None
    if '--hoja' in args:
        i = args.index('--hoja')
        hoja = args[i + 1]
        del args[i : i + 2]
    jugadores = json.load(open(DATOS, encoding='utf-8'))
    # --foto id=ruta[@x0,y0,x1,y1]: imagen local en vez de Wikipedia (el recorte en píxeles es opcional).
    locales = {}
    while '--foto' in args:
        i = args.index('--foto')
        pid, _, ruta = args[i + 1].partition('=')
        ruta, _, caja = ruta.partition('@')
        locales[pid] = (ruta, tuple(int(n) for n in caja.split(',')) if caja else None)
        del args[i : i + 2]
    pendientes = [j for j in jugadores if (j['id'] in locales) or (j.get('wiki') and ((j['id'] in args) if args else not j['fotos']))]
    print(f'Importando {len(pendientes)} jugadores desde Wikipedia…')
    sesion = new_session('u2net')
    os.makedirs(SALIDA, exist_ok=True)
    hechos, fallos = [], []
    for j in pendientes:
        if j['id'] not in locales:
            time.sleep(4)
        try:
            if j['id'] in locales:
                ruta, caja = locales[j['id']]
                url = 'foto enviada por el dueño'
                im = ImageOps.exif_transpose(Image.open(ruta)).convert('RGB')
                if caja:
                    im = im.crop(caja)
            else:
                url = j.get('wikiImg') or imagen_de_wikipedia(j['wiki'])
                im = ImageOps.exif_transpose(Image.open(io.BytesIO(pedir(url)))).convert('RGB')
            im.thumbnail((1400, 1400))
            if im.width < 400:
                print(f'  aviso {j["id"]}: imagen chica ({im.width}px)')
            final = encuadrar(a_busto(remove(im, session=sesion)))
            final.save(os.path.join(SALIDA, j['id'] + '.webp'), 'WEBP', quality=84, method=5)
            j['fotos'] = [f'/img/players/{j["id"]}.webp']
            j['fotoFuente'] = url
            hechos.append(j)
            print('✓', j['id'], flush=True)
            json.dump(jugadores, open(DATOS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            open(DATOS, 'a').write('\n')
        except Exception as e:  # noqa: BLE001
            fallos.append(j['id'])
            print('✗', j['id'], str(e)[:90], flush=True)
    json.dump(jugadores, open(DATOS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(DATOS, 'a').write('\n')
    print(f'Listo: {len(hechos)} ok, {len(fallos)} fallaron {fallos}')
    if hoja and hechos:
        cols, w, h = 6, 240, 214
        filas = (len(hechos) + cols - 1) // cols
        H = Image.new('RGB', (cols * w, filas * (h + 24)), (60, 70, 66))
        dib = ImageDraw.Draw(H)
        for n, j in enumerate(hechos):
            f = Image.open(os.path.join(SALIDA, j['id'] + '.webp')).convert('RGBA').resize((w, h))
            x, y = (n % cols) * w, (n // cols) * (h + 24)
            H.paste(f, (x, y + 24), f)
            dib.text((x + 4, y + 6), j['id'][:34], fill=(255, 255, 255))
        H.save(hoja)


if __name__ == '__main__':
    main()
