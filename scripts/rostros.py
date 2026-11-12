#!/usr/bin/env python3
"""Ubica la cara de cada troll del panel para que el avatar (el círculo) quede bien encuadrado.

Baja las fotos de los trolls, detecta la cara con OpenCV (YuNet) y guarda en el panel `rostro` =
[centro x, centro y, ancho de la cara, ancho/alto de la imagen] (fracciones). Si no encuentra cara,
usa una suposición: fotos sin fondo → cabeza arriba; fotos con fondo → centro. Después se puede
corregir a mano en /admin → "Encuadre del avatar".

  pip install opencv-python-headless pillow numpy
  SUBASTA_PIN=… python3 scripts/rostros.py                       # solo los que no tienen rostro (producción)
  SUBASTA_PIN=… python3 scripts/rostros.py --todos               # recalcula todos
  SUBASTA_URL=http://localhost:8787 SUBASTA_PIN=… python3 scripts/rostros.py
"""
import io, json, os, sys, urllib.request
import cv2
import numpy as np
from PIL import Image

BASE = os.environ.get('SUBASTA_URL', 'https://subasta-futbolera.antoniofguardia01.workers.dev').rstrip('/')
PIN = os.environ.get('SUBASTA_PIN', '')


def pedir(ruta, metodo='GET', cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo, headers={'x-admin-pin': PIN, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


MODELO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache', 'yunet.onnx')
MODELO_URL = 'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'


def modelo():
    """YuNet (detector de caras de OpenCV, 230 KB): se baja una vez a scripts/.cache."""
    if not os.path.exists(MODELO) or os.path.getsize(MODELO) < 100000:
        os.makedirs(os.path.dirname(MODELO), exist_ok=True)
        open(MODELO, 'wb').write(urllib.request.urlopen(MODELO_URL, timeout=60).read())
    return MODELO


def detectar(im):
    """Devuelve (cx, cy, ancho) de la cara más segura, en fracciones de la imagen, o None."""
    w, h = im.size
    fondo = Image.new('RGB', im.size, (128, 128, 128))
    fondo.paste(im, mask=im.split()[3] if im.mode == 'RGBA' else None)
    bgr = cv2.cvtColor(np.asarray(fondo), cv2.COLOR_RGB2BGR)
    k = 960 / max(w, h) if max(w, h) > 960 else 1
    if k != 1:
        bgr = cv2.resize(bgr, (round(w * k), round(h * k)))
    gh, gw = bgr.shape[:2]
    det = cv2.FaceDetectorYN.create(modelo(), '', (gw, gh), score_threshold=0.6, nms_threshold=0.3, top_k=10)
    _, caras = det.detect(bgr)
    if caras is None or not len(caras):
        return None
    # La que tenga más puntaje × tamaño (evita falsos positivos chicos).
    x, y, fw, fh = max(caras, key=lambda c: c[14] * c[2] * c[3])[:4]
    # El cuadro de YuNet va de la frente al mentón: se agranda un poco para que el avatar respire (pelo, orejas).
    cx, cy = (x + fw / 2) / gw, (y + fh * 0.5) / gh
    return float(cx), float(cy), float(min(1, fw * 1.35 / gw))


def suponer(im):
    """Sin cara detectada: sin fondo → cabeza arriba del sujeto; con fondo → centro."""
    w, h = im.size
    if im.mode == 'RGBA':
        al = np.asarray(im.split()[3])
        ys, xs = np.where(al > 40)
        if len(ys) > 500 and al.min() < 20:
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            ancho = min(x1 - x0, (y1 - y0) * 0.9)
            return (x0 + x1) / 2 / w, (y0 + (y1 - y0) * 0.28) / h, min(1, ancho * 0.5 / w)
    return 0.5, 0.4, 0.45


def main():
    if not PIN:
        sys.exit('Falta SUBASTA_PIN')
    todos = '--todos' in sys.argv
    estado = json.loads(pedir('/api/admin/estado'))
    trolls = [t for t in estado['trolls'] if todos or not t.get('rostro')]
    print(f'{len(trolls)} trolls para ubicar en {BASE}')
    for t in trolls:
        try:
            foto = t['foto'].split('&r=')[0]
            im = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(BASE + foto, headers={'user-agent': 'Mozilla/5.0'}), timeout=60).read()))
            im = im.convert('RGBA')
            r = detectar(im)
            origen = 'cara'
            if r is None:
                r, origen = suponer(im), 'suposición'
            w, h = im.size
            cuerpo = {'rostro': [round(r[0], 3), round(r[1], 3), round(r[2], 3), round(w / h, 3)]}
            pedir('/api/admin/c/troll/' + t['id'], 'PUT', cuerpo)
            print(f'  {t["id"][:10]:10} {t.get("nombre") or "(sin nombre)":16} {origen:10} {cuerpo["rostro"]}', flush=True)
        except Exception as e:  # noqa: BLE001
            print('  ✗', t['id'], str(e)[:80], flush=True)


if __name__ == '__main__':
    main()
