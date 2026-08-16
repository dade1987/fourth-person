// wiggle.js — l'oscillazione autonoma (SPEC §5.2–5.6).
//
// Effetto cinetico di profondità (Wallach & O'Connell, 1953): un oggetto che si
// muove si legge come volume anche con un occhio solo. Ma la parallasse DA SOLA
// è ambigua nel segno — è il cubo di Necker — e si disambigua solo con indizi a
// verso univoco: occlusione, prospettiva, ombreggiatura, rifrazione.
//
// Regola operativa non negoziabile: l'oscillazione si accende SOLO su geometria
// solida o vetro, e solo in prospettiva. Sui fili va spenta.

export const WIGGLE_LIMITS = {
  minAmplitudeDeg: 3,
  maxAmplitudeDeg: 6,
  minFrequencyHz: 0.4,
  maxFrequencyHz: 0.8,
};

export const DEFAULTS = {
  amplitudeDeg: 4.5,
  frequencyHz: 0.55,
  enabled: true,
};

/** Geometrie che offrono occlusione con un verso univoco. */
export const UNAMBIGUOUS_GEOMETRY = ['solid', 'glass'];

/**
 * Il cancello. Se questa funzione dice di no, l'oscillazione non parte:
 * non c'è impostazione, capitolo o enigma che possa scavalcarla.
 */
export function wiggleAllowed({ geometry = 'glass', projection = 'perspective', reducedMotion = false, userEnabled = true } = {}) {
  if (reducedMotion) return false;
  if (!userEnabled) return false;
  if (projection !== 'perspective') return false;
  return UNAMBIGUOUS_GEOMETRY.includes(geometry);
}

export function clampParams({ amplitudeDeg = DEFAULTS.amplitudeDeg, frequencyHz = DEFAULTS.frequencyHz } = {}) {
  const L = WIGGLE_LIMITS;
  return {
    amplitudeDeg: Math.min(L.maxAmplitudeDeg, Math.max(L.minAmplitudeDeg, amplitudeDeg)),
    frequencyHz: Math.min(L.maxFrequencyHz, Math.max(L.minFrequencyHz, frequencyHz)),
  };
}

/**
 * Spostamento dell'occhio, non rotazione dell'oggetto: l'oscillazione entra nello
 * stesso frustum fuori asse della prospettiva accoppiata, e i due indizi si sommano
 * invece di litigare. Moto sinusoidale continuo, mai alternanza fra due fotogrammi.
 */
export function wiggleOffset(time, { amplitudeDeg, frequencyHz, distance = 0.35, gain = 1 } = DEFAULTS) {
  const p = clampParams({ amplitudeDeg, frequencyHz });
  const a = distance * Math.tan((p.amplitudeDeg * Math.PI) / 180) * gain;
  const ph = 2 * Math.PI * p.frequencyHz * time;
  return {
    x: a * Math.sin(ph),
    // una traccia verticale, in quadratura: il moto è una lenta ellisse, non un va-e-vieni
    y: a * 0.28 * Math.sin(ph * 0.5 + Math.PI / 3),
  };
}

/**
 * Passaggio di consegne fra giroscopio e oscillazione (SPEC §5.5).
 * La parallasse generata da te è superiore a quella subita: se muovi il telefono,
 * l'oscillazione si spegne. Ferma da oltre 2 s, riparte dolcemente.
 */
export const STILLNESS_SECONDS = 2;

export function makeHandover({ stillnessSeconds = STILLNESS_SECONDS, fadeSeconds = 1.2 } = {}) {
  let still = 0;
  let gain = 1;
  return {
    get gain() {
      return gain;
    },
    get stillFor() {
      return still;
    },
    update(dt, deviceMoving) {
      if (deviceMoving) still = 0;
      else still += dt;
      const target = still >= stillnessSeconds ? 1 : 0;
      const rate = dt / Math.max(fadeSeconds, 1e-3);
      gain += Math.min(rate, Math.abs(target - gain)) * Math.sign(target - gain);
      gain = Math.min(1, Math.max(0, gain));
      return gain;
    },
  };
}

/** Soglia WCAG: niente che lampeggi più di tre volte al secondo. */
export const MAX_FLASHES_PER_SECOND = 3;

export function withinFlashLimit(flashesPerSecond) {
  return flashesPerSecond <= MAX_FLASHES_PER_SECOND;
}

/**
 * Indizi di profondità attivi. La tabella §5.3 è codice, non prosa: se manca un
 * obbligatorio, `sufficient` è falso e il renderer non ha il diritto di oscillare.
 */
export const REQUIRED_CUES = ['occlusion', 'perspective', 'shading', 'headCoupled', 'refraction'];

export function cueCheck(active) {
  const missing = REQUIRED_CUES.filter((c) => !active.includes(c));
  return { sufficient: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// I criteri degli esperimenti (SPEC §5.7), dichiarati PRIMA di misurare.
// Stanno nel codice per un motivo solo: un progetto che si dichiara scientifico
// e non misura non lo è, e un criterio deciso dopo i dati non è un criterio.

export const DEPTH_ORDERING_CRITERION = {
  trialsPerCondition: 20,
  participants: 10,
  /** L'oscillazione deve battere lo statico di almeno 15 punti percentuali. */
  minGainOverStatic: 15,
  /** E la prospettiva accoppiata deve battere l'oscillazione. */
  headCoupledMustBeatWiggle: true,
};

/** `results` in percentuale di risposte corrette per condizione. */
export function evaluateDepthOrdering({ staticView, wiggle, headCoupled }) {
  const reasons = [];
  if (wiggle - staticView < DEPTH_ORDERING_CRITERION.minGainOverStatic) {
    reasons.push(`l'oscillazione batte lo statico di ${(wiggle - staticView).toFixed(1)} punti, ne servono ${DEPTH_ORDERING_CRITERION.minGainOverStatic}`);
  }
  if (DEPTH_ORDERING_CRITERION.headCoupledMustBeatWiggle && !(headCoupled > wiggle)) {
    reasons.push('la prospettiva accoppiata non batte l\'oscillazione');
  }
  return { passes: reasons.length === 0, reasons };
}

/** Stabilità percettiva: i ribaltamenti devono essere prossimi a zero in 60 s. */
export const STABILITY_CRITERION = { seconds: 60, maxFlips: 1 };

export function evaluateStability(flips, seconds = STABILITY_CRITERION.seconds) {
  const rate = (flips * STABILITY_CRITERION.seconds) / Math.max(seconds, 1e-6);
  return { passes: rate <= STABILITY_CRITERION.maxFlips, flipsPerMinute: rate };
}
