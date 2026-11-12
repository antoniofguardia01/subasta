// Escáner de QR con la cámara trasera. Usa BarcodeDetector cuando existe (Chrome/Android) y,
// si no (Safari en iPhone), jsQR, que se descarga recién al abrir la cámara.
import { useEffect, useRef, useState } from 'react';

type Detector = (v: HTMLVideoElement) => Promise<string | null>;

async function crearDetector(): Promise<Detector> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const d = new BD({ formats: ['qr_code'] });
      return async (v) => (await d.detect(v))[0]?.rawValue ?? null;
    } catch {
      /* sigue con jsQR */
    }
  }
  const jsQR = (await import('jsqr')).default;
  const lienzo = document.createElement('canvas');
  const c = lienzo.getContext('2d', { willReadFrequently: true })!;
  return async (v) => {
    const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
    lienzo.width = Math.round(v.videoWidth * k);
    lienzo.height = Math.round(v.videoHeight * k);
    if (!lienzo.width) return null;
    c.drawImage(v, 0, 0, lienzo.width, lienzo.height);
    const img = c.getImageData(0, 0, lienzo.width, lienzo.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

export const hayCamara = () => !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

export function Escaner({ alLeer, cerrar }: { alLeer: (texto: string) => boolean; cerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const alLeerRef = useRef(alLeer);
  alLeerRef.current = alLeer;

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!vivo || !video.current) return flujo.getTracks().forEach((t) => t.stop());
        video.current.srcObject = flujo;
        await video.current.play();
        const detectar = await crearDetector();
        const ciclo = async () => {
          if (!vivo || !video.current) return;
          const texto = await detectar(video.current).catch(() => null);
          if (texto && alLeerRef.current(texto)) return;
          timer = setTimeout(ciclo, 180);
        };
        void ciclo();
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError' ? 'Sin permiso para la cámara. Escribe el código a mano.' : 'No se pudo abrir la cámara.');
      }
    })();
    return () => {
      vivo = false;
      clearTimeout(timer);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="escaner">
      <video ref={video} muted playsInline />
      <i className="escaner-mira" />
      <p>{error || 'Apunta al QR de la tele'}</p>
      <button onClick={cerrar}>Cerrar cámara</button>
    </div>
  );
}
