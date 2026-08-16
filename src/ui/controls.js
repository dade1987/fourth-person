// controls.js — dieci gradi di libertà su un vetro (SPEC §7).
//
//  stick sinistro   traslazione in x, z
//  stick destro     rotazione nei piani xz, yz
//  bottone W        commuta lo stick destro sui piani che contengono w
//  cursore / due dita   traslazione in w, sempre con il valore a schermo
//  giroscopio       prospettiva accoppiata, sempre attiva quando c'è

export const W_RANGE = 1.2;

export function createControls({ canvas, hud, onTap = () => {}, onWModeChange = () => {} }) {
  const state = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    w: 0,
    wMode: false,
    dragObject: null,
    beta: 0,
    gamma: 0,
    beta0: null,
    gyroActive: false,
    deviceMoving: false,
    lastTap: null,
  };

  const pointers = new Map();
  let lastMotion = 0;

  function stickVector(el, e) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const n = Math.hypot(dx, dy);
    if (n > 1) {
      dx /= n;
      dy /= n;
    }
    return { x: dx, y: dy };
  }

  function bindStick(el, knob, key) {
    let id = null;
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      el.setPointerCapture(id);
      const v = stickVector(el, e);
      state[key] = v;
      knob.style.transform = `translate(${v.x * 34}px, ${v.y * 34}px)`;
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const v = stickVector(el, e);
      state[key] = v;
      knob.style.transform = `translate(${v.x * 34}px, ${v.y * 34}px)`;
    });
    const release = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      state[key] = { x: 0, y: 0 };
      knob.style.transform = 'translate(0,0)';
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  bindStick(hud.el.stickL, hud.el.knobL, 'move');
  bindStick(hud.el.stickR, hud.el.knobR, 'look');

  // ------------------------------------------------------------ cursore w
  function setW(v) {
    state.w = Math.max(-W_RANGE, Math.min(W_RANGE, v));
    hud.setW(state.w);
  }
  setW(0);

  const slider = hud.el.wslider;
  let wid = null;
  slider.addEventListener('pointerdown', (e) => {
    wid = e.pointerId;
    slider.setPointerCapture(wid);
    const r = slider.getBoundingClientRect();
    setW((0.5 - (e.clientY - r.top) / r.height) * 2 * W_RANGE);
    e.preventDefault();
  });
  slider.addEventListener('pointermove', (e) => {
    if (e.pointerId !== wid) return;
    const r = slider.getBoundingClientRect();
    setW((0.5 - (e.clientY - r.top) / r.height) * 2 * W_RANGE);
  });
  const wRelease = (e) => {
    if (e.pointerId === wid) wid = null;
  };
  slider.addEventListener('pointerup', wRelease);
  slider.addEventListener('pointercancel', wRelease);

  hud.el.wbutton.addEventListener('click', () => {
    state.wMode = !state.wMode;
    hud.setWMode(state.wMode);
    onWModeChange(state.wMode);
  });

  // -------------------------------------------- trascinamento e tocco sul vetro
  let dragId = null;
  let last = null;
  let moved = 0;
  let downAt = 0;
  let twoFinger = null;

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      twoFinger = { y: (a.y + b.y) / 2, w: state.w };
      dragId = null;
      return;
    }
    dragId = e.pointerId;
    last = { x: e.clientX, y: e.clientY };
    moved = 0;
    downAt = performance.now();
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // due dita in verticale: la quarta direzione, senza guardare il cursore
    if (twoFinger && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const y = (a.y + b.y) / 2;
      setW(twoFinger.w + ((twoFinger.y - y) / 260) * W_RANGE);
      return;
    }
    if (e.pointerId !== dragId || !last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    moved += Math.abs(dx) + Math.abs(dy);
    state.dragObject = state.dragObject || { x: 0, y: 0 };
    state.dragObject.x += dx * 0.007;
    state.dragObject.y += dy * 0.007;
  });

  const endDrag = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) twoFinger = null;
    if (e.pointerId !== dragId) return;
    if (moved < 9 && performance.now() - downAt < 450) {
      const r = canvas.getBoundingClientRect();
      state.lastTap = { x: e.clientX - r.left, y: e.clientY - r.top };
      onTap(state.lastTap);
    }
    dragId = null;
    last = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ------------------------------------------------------------ giroscopio
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const db = Math.abs(e.beta - state.beta);
    const dg = Math.abs(e.gamma - state.gamma);
    if (db + dg > 0.35) lastMotion = performance.now();
    state.beta = e.beta;
    state.gamma = e.gamma;
    if (state.beta0 === null) state.beta0 = e.beta; // calibrazione all'avvio
    state.gyroActive = true;
  }

  async function enableGyro() {
    const D = window.DeviceOrientationEvent;
    if (!D) return false;
    if (typeof D.requestPermission === 'function') {
      try {
        const res = await D.requestPermission();
        if (res !== 'granted') return false;
      } catch (err) {
        return false;
      }
    }
    window.addEventListener('deviceorientation', onOrientation);
    return true;
  }

  return {
    state,
    enableGyro,
    setW,
    recalibrate() {
      state.beta0 = state.beta;
    },
    /** Il dispositivo si sta muovendo? Da qui dipende chi comanda la parallasse. */
    get deviceMoving() {
      return performance.now() - lastMotion < 350;
    },
    frameEnd() {
      state.dragObject = null;
      state.lastTap = null;
    },
  };
}
