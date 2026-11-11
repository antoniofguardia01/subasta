"""Hoja de validación de fotos: silueta (misterio) + revelación por rareza, para revisar de un vistazo.
Uso: python3 scripts/hoja-validacion.py [salida.png]"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONDO = {'comun': (18, 193, 90), 'plata': (150, 170, 190), 'oro': (233, 196, 106), 'prime': (240, 170, 40), 'leyenda': (30, 26, 20), 'troll': (215, 38, 61)}
jug = [j for j in json.load(open(os.path.join(RAIZ, 'data/players.json'))) if j['fotos']]
W, H, COLS = 150, 133, 6
filas = (len(jug) + COLS - 1) // COLS
hoja = Image.new('RGB', (COLS * W * 2, filas * (H + 16)), (12, 16, 14))
d = ImageDraw.Draw(hoja)
try:
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 10)
except Exception:
    f = ImageFont.load_default()
for i, j in enumerate(jug):
    im = Image.open(os.path.join(RAIZ, 'public' + j['fotos'][0])).convert('RGBA').resize((W, H), Image.LANCZOS)
    a = im.split()[3]
    x, y = (i % COLS) * W * 2, (i // COLS) * (H + 16)
    mist = Image.new('RGB', (W, H), (18, 193, 90)); mist.paste(Image.new('RGB', (W, H), (255, 255, 255)), (0, 0), a)
    rev = Image.new('RGB', (W, H), FONDO[j['rareza']]); rev.paste(im, (0, 0), a)
    hoja.paste(mist, (x, y)); hoja.paste(rev, (x + W, y))
    d.text((x + 3, y + H + 2), f"{j['pos']} {(j['nombre'] + ' ' + j['apellido']).strip()[:26]} ${j['precioMinimo']}M", fill=(255, 255, 255), font=f)
salida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'docs/validacion-fotos.png')
hoja.save(salida)
print(salida, hoja.size, len(jug))
