// drone.js — il bordone (SPEC §6).
//
// Un bordone grave la cui altezza segue la tua posizione in w: sali in w, il tono
// sale. Costa un oscillatore e trasforma la quarta direzione da numero letto a
// cosa sentita. Niente musica, niente jingle: il silenzio nei momenti forti
// funziona solo se c'è qualcosa che si interrompe.

export const BASE_HZ = 58; // un La grave, sotto la voce
export const SEMITONES_PER_W = 7;

export function makeDrone() {
  let ctx = null;
  let osc = null;
  let sub = null;
  let gain = null;
  let filter = null;
  let started = false;
  let muted = false;
  let target = 1;

  function frequencyForW(w) {
    return BASE_HZ * Math.pow(2, (w * SEMITONES_PER_W) / 12);
  }

  return {
    get started() {
      return started;
    },
    get muted() {
      return muted;
    },
    /** Va chiamato dentro un gesto dell'utente: i browser non concedono altro. */
    start() {
      if (started) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = 0;
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.6;

      osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = BASE_HZ;

      sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = BASE_HZ / 2;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;

      osc.connect(filter);
      sub.connect(subGain).connect(filter);
      filter.connect(gain).connect(ctx.destination);
      osc.start();
      sub.start();
      started = true;
      this.setLevel(0.12);
    },
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(v) {
      muted = v;
      this.setLevel(target);
    },
    setLevel(level) {
      target = level;
      if (!started) return;
      gain.gain.setTargetAtTime(muted ? 0 : level, ctx.currentTime, 0.08);
    },
    /** Il tono segue w. È l'unico canale che parla della quarta direzione senza parole. */
    setW(w) {
      if (!started) return;
      const f = frequencyForW(w);
      osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      sub.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.05);
      filter.frequency.setTargetAtTime(340 + Math.abs(w) * 260, ctx.currentTime, 0.1);
    },
    /** Silenzio: il momento wow è muto, e per questo si sente. */
    hush(seconds = 0.5) {
      if (!started) return;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      setTimeout(() => this.setLevel(target), seconds * 1000);
    },
    /** Materico appena percepibile sulle collisioni. Nient'altro. */
    tick(strength = 1) {
      if (!started || muted) return;
      const now = ctx.currentTime;
      const n = ctx.createBufferSource();
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      n.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.09 * strength;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      n.connect(f).connect(g).connect(ctx.destination);
      n.start(now);
    },
    frequencyForW,
  };
}
