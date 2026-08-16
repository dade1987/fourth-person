// headcoupled.js — prospettiva accoppiata alla testa (SPEC §3.3a).
//
// Lo schermo non è un'immagine: è una finestra ferma nel mondo, dietro la quale
// l'occhio si sposta. Il pezzo che quasi tutti sbagliano è questo: NON si ruota
// la camera. Si deforma il frustum, ancorandolo agli angoli fisici dello schermo,
// e si trasla la vista di −E senza alcuna rotazione (Kooima, 2008).
//
// Matrici: qui si esce verso WebGL, quindi Float32Array(16) in ordine per colonne.
// (Il modulo resta puro: nessuna chiamata GL, nessun DOM. È testabile in Node.)

export const VIEW_DISTANCE = 0.35; // metri, distanza di lettura di un telefono
export const MAX_TILT_DEG = 12; // saturazione (SPEC §3.3a)
export const LOWPASS_HZ = 6;

/** Circa 3780 pixel CSS per metro (96 dpi). Serve a dare allo schermo una misura vera. */
export const CSS_PIXELS_PER_METER = 3780;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

/**
 * Stima della posizione dell'occhio rispetto al centro dello schermo.
 * Il sensore dà l'orientamento del dispositivo, non la testa: assumiamo la testa
 * ferma nel mondo, quindi nel sistema dello schermo è l'occhio a spostarsi.
 */
export function eyeFromOrientation({ beta = 0, gamma = 0, beta0 = 0, distance = VIEW_DISTANCE }) {
  const g = rad(clamp(gamma, -MAX_TILT_DEG, MAX_TILT_DEG));
  const b = rad(clamp(beta - beta0, -MAX_TILT_DEG, MAX_TILT_DEG));
  return {
    x: distance * Math.sin(g),
    y: -distance * Math.sin(b),
    z: distance * Math.cos(g) * Math.cos(b),
  };
}

/** Passa-basso del primo ordine: il giroscopio è rumoroso, l'illusione no. */
export function makeLowPass(cutoffHz = LOWPASS_HZ, initial = 0) {
  let value = initial;
  return {
    get value() {
      return value;
    },
    reset(v) {
      value = v;
    },
    update(target, dt) {
      const a = 1 - Math.exp(-2 * Math.PI * cutoffHz * Math.max(dt, 1e-4));
      value += (target - value) * a;
      return value;
    },
  };
}

/** Ritorno elastico al centro quando il dispositivo torna fermo. */
export function elasticReturn(value, dt, rate = 1.6) {
  return value * Math.exp(-rate * dt);
}

export function frustumParams({ eye, halfWidth, halfHeight, near }) {
  const ez = Math.max(eye.z, 1e-3);
  return {
    left: ((-halfWidth - eye.x) * near) / ez,
    right: ((halfWidth - eye.x) * near) / ez,
    bottom: ((-halfHeight - eye.y) * near) / ez,
    top: ((halfHeight - eye.y) * near) / ez,
  };
}

export function frustumMatrix(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0] = (2 * near) / (right - left);
  m[5] = (2 * near) / (top - bottom);
  m[8] = (right + left) / (right - left);
  m[9] = (top + bottom) / (top - bottom);
  m[10] = -(far + near) / (far - near);
  m[11] = -1;
  m[14] = (-2 * far * near) / (far - near);
  return m;
}

/** Proiezione prospettica generalizzata: asimmetrica, fuori asse. */
export function offAxisProjection({ eye, halfWidth, halfHeight, near = 0.01, far = 20 }) {
  const p = frustumParams({ eye, halfWidth, halfHeight, near });
  return frustumMatrix(p.left, p.right, p.bottom, p.top, near, far);
}

/**
 * Vista: traslazione pura di −E. Nessuna rotazione, mai.
 * Chi ruota la camera ottiene un effetto molliccio, e si riconosce subito.
 */
export function translationView(eye) {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = -eye.x;
  m[13] = -eye.y;
  m[14] = -eye.z;
  return m;
}

/** Quanto il frustum è fuori asse: 0 significa che l'effetto non sta funzionando. */
export function asymmetry(params) {
  return Math.abs(params.right + params.left) / (params.right - params.left);
}

export function screenHalfSizeMeters(cssWidth, cssHeight, pixelsPerMeter = CSS_PIXELS_PER_METER) {
  return {
    halfWidth: cssWidth / pixelsPerMeter / 2,
    halfHeight: cssHeight / pixelsPerMeter / 2,
  };
}

export { clamp, deg, rad };
