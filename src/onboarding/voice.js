// voice.js — la Scala è narrata (SPEC §8.1).
//
// `speechSynthesis` del browser: zero asset, decine di lingue, funziona offline.
// I sottotitoli sono attivi di default e restano anche quando la voce parla:
// chi non può o non vuole ascoltare non perde niente.

const WORDS_PER_MINUTE = 150;

export function estimateSeconds(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1.6, (words / WORDS_PER_MINUTE) * 60);
}

export function voiceSupported() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function createVoice({ onSubtitle = () => {}, getLocale = () => 'it-IT', enabled = true, speed = 1 } = {}) {
  let current = null;
  let timer = null;
  let cancelled = false;
  let paused = false;
  let speechOn = enabled;

  function pickVoice(locale) {
    if (!voiceSupported()) return null;
    const voices = speechSynthesis.getVoices() || [];
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase() === locale.toLowerCase()) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(locale.slice(0, 2))) ||
      null
    );
  }

  function stop() {
    cancelled = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (voiceSupported()) speechSynthesis.cancel();
    if (current) {
      const resolve = current;
      current = null;
      resolve();
    }
  }

  return {
    get speaking() {
      return current !== null;
    },
    setSpeech(on) {
      speechOn = on;
      if (!on && voiceSupported()) speechSynthesis.cancel();
    },
    /** Dice una riga e mostra il sottotitolo. Risolve quando ha finito, o quando si salta. */
    say(text) {
      stop();
      cancelled = false;
      onSubtitle(text);
      return new Promise((resolve) => {
        current = resolve;
        const finish = () => {
          if (current === resolve) {
            current = null;
            resolve();
          }
        };
        // Il tempo di lettura fa sempre da rete di sicurezza: se la voce non
        // parte (o non esiste), il capitolo avanza lo stesso.
        const seconds = estimateSeconds(text) / speed;
        timer = setTimeout(finish, (seconds + 0.45) * 1000);

        if (!speechOn || !voiceSupported()) return;
        const u = new SpeechSynthesisUtterance(text);
        const locale = getLocale();
        u.lang = locale;
        const v = pickVoice(locale);
        if (v) u.voice = v;
        u.rate = 0.98;
        u.pitch = 1.0;
        u.onstart = () => {
          // la voce c'è davvero: comanda lei, con una rete di sicurezza più larga
          if (timer) clearTimeout(timer);
          timer = setTimeout(finish, (seconds * 3 + 8) * 1000);
        };
        u.onend = () => {
          if (!cancelled) {
            if (timer) clearTimeout(timer);
            finish();
          }
        };
        try {
          speechSynthesis.speak(u);
        } catch (e) {
          /* i sottotitoli bastano */
        }
      });
    },
    pause() {
      paused = true;
      if (voiceSupported()) speechSynthesis.pause();
    },
    resume() {
      paused = false;
      if (voiceSupported()) speechSynthesis.resume();
    },
    get paused() {
      return paused;
    },
    skip: stop,
    stop,
  };
}
