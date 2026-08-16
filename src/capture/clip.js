// clip.js — il clip condivisibile (SPEC §9.1).
//
// Dopo ogni momento wow il gioco registra da solo sei secondi e li offre con un
// tocco. Non è marketing: un "wow" che non si può far vedere a un amico muore
// nella stanza in cui è successo. Ed è l'unico motore di diffusione che funziona
// davvero — nessuna quantità di post sostituisce una persona che gira il telefono.

export const CLIP_SECONDS = 6;

function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

export function clipSupported() {
  return typeof MediaRecorder !== 'undefined' && !!pickMimeType() && !!HTMLCanvasElement.prototype.captureStream;
}

/**
 * Registra il canvas componendolo con la filigrana (l'URL del gioco).
 * Il compositing avviene su un canvas 2D: così la filigrana finisce nel file, e
 * chi riceve il video sa dove trovare la cosa.
 */
export function createClipRecorder(sourceCanvas, { watermark = location.host + location.pathname, fps = 30 } = {}) {
  let recording = false;

  async function record(seconds = CLIP_SECONDS, onProgress = () => {}) {
    if (recording || !clipSupported()) return null;
    recording = true;

    const w = Math.min(sourceCanvas.width, 720);
    const h = Math.round((w * sourceCanvas.height) / sourceCanvas.width);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');

    const stream = out.captureStream(fps);
    const mime = pickMimeType();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const start = performance.now();
    let raf = 0;
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.drawImage(sourceCanvas, 0, 0, w, h);
      ctx.font = `${Math.round(h * 0.030)}px system-ui, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const text = watermark;
      const tw = ctx.measureText(text).width;
      ctx.fillRect(w - tw - h * 0.05, h - h * 0.055, tw + h * 0.03, h * 0.04);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(text, w - tw - h * 0.035, h - h * 0.022);
      onProgress(Math.min(1, t / seconds));
      if (t < seconds) raf = requestAnimationFrame(draw);
    };

    rec.start();
    draw();

    const blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
      setTimeout(() => {
        cancelAnimationFrame(raf);
        rec.stop();
      }, seconds * 1000 + 120);
    });

    recording = false;
    return blob;
  }

  return {
    get recording() {
      return recording;
    },
    record,
  };
}

export function fileNameFor(mime) {
  return `quarta-persona.${mime && mime.includes('mp4') ? 'mp4' : 'webm'}`;
}

/** Un tocco: condividi. Se il sistema non sa condividere file, si scarica. */
export async function shareClip(blob, { title = 'fourth-person', text = 'Non puoi vedere la quarta dimensione. Puoi riconoscerla.', url = location.href } = {}) {
  const file = new File([blob], fileNameFor(blob.type), { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text, url });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  return 'downloaded';
}
