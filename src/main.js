// main.js — il filo che tiene insieme tutto.

import { createRenderer } from './render/renderer.js';
import { createWorld } from './game/world.js';
import { createHud, row, toggleControl, sliderControl } from './ui/hud.js';
import { createControls, W_RANGE } from './ui/controls.js';
import { createCompass } from './ui/compass.js';
import { createVoice } from './onboarding/voice.js';
import { runColdOpen } from './onboarding/coldopen.js';
import { createLadder } from './onboarding/chapters.js';
import { buildLabs } from './onboarding/labs.js';
import { makeDrone } from './audio/drone.js';
import { createClipRecorder, clipSupported, shareClip } from './capture/clip.js';
import {
  eyeFromOrientation, makeLowPass, screenHalfSizeMeters, VIEW_DISTANCE,
} from './render/headcoupled.js';
import { wiggleAllowed, wiggleOffset, makeHandover, DEFAULTS, clampParams } from './render/wiggle.js';
import { cameraPlaneAngles, toCameraSpace, transformPoint, NEAR_W } from './render/project.js';
import { currentName } from './render/slice.js';
import { polytope } from './math4d/polytope.js';

const STORE = 'fourth-person:settings';

const settings = Object.assign(
  {
    lang: (navigator.language || 'it').toLowerCase().startsWith('it') ? 'it' : 'en',
    subtitles: true,
    sound: true,
    speech: true,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    wiggle: true,
    amplitudeDeg: DEFAULTS.amplitudeDeg,
    frequencyHz: DEFAULTS.frequencyHz,
    gyro: false,
  },
  JSON.parse(localStorage.getItem(STORE) || '{}')
);

// prefers-reduced-motion vince all'avvio, senza chiedere niente a nessuno.
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) settings.reducedMotion = true;

function saveSettings() {
  localStorage.setItem(STORE, JSON.stringify(settings));
}

const strings = {};

async function loadLanguage(code) {
  if (!strings[code]) {
    const res = await fetch(`src/i18n/${code}.json`);
    strings[code] = await res.json();
  }
  document.documentElement.lang = code;
  return strings[code];
}

async function boot() {
  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (err) {
    const t = await loadLanguage(settings.lang);
    document.body.insertAdjacentHTML('beforeend', `<div id="fatal">${t.ui.noWebgl}</div>`);
    console.error(err);
    return;
  }

  let t = await loadLanguage(settings.lang);
  const hud = createHud();
  const world = createWorld(renderer);
  const compass = createCompass(hud.el.compass);
  const drone = makeDrone();
  const clip = createClipRecorder(canvas);

  // ?fast serve ai test end-to-end: la narrazione scorre, il resto è identico
  const fast = new URLSearchParams(location.search).has('fast');
  const voice = createVoice({
    onSubtitle: (text) => hud.subtitle(settings.subtitles ? text : null),
    getLocale: () => t.voice,
    enabled: settings.speech && !fast,
    speed: fast ? 14 : 1,
  });

  const controls = createControls({
    canvas,
    hud,
    onTap: (p) => onTap(p),
    onWModeChange: (on) => {
      if (on && !settings.seenW) {
        settings.seenW = true;
        saveSettings();
        hud.toast(t.ui.wExplain, 6000);
      }
    },
  });

  // ----------------------------------------------------------- prospettiva
  const lpBeta = makeLowPass(6, 0);
  const lpGamma = makeLowPass(6, 0);
  const handover = makeHandover();
  let wiggleSuspended = false;
  let lastProj = null;
  let lastView = null;
  let pickedVertex = null;
  let picking = false;
  let lastGuide = null;

  hud.el.modeProjection.onclick = () => {
    world.setSlice('projection');
    world.emit('slice', { target: 0 });
    hud.modeHint(t.ui.modeHintProjection);
  };
  hud.el.modeSection.onclick = () => {
    world.setSlice('section');
    world.emit('slice', { target: 1 });
    hud.modeHint(t.ui.modeHintSection);
  };
  hud.el.menuBtn.onclick = () => (hud.panelOpen() ? hud.closePanel() : openMenu());

  function paintLabels() {
    hud.el.modeProjection.textContent = t.ui.projection;
    hud.el.modeSection.textContent = t.ui.section;
    hud.el.wcaption.textContent = t.ui.wCaption;
  }
  paintLabels();

  /** Ombra o fetta non sono nomi: sono due cose diverse, e va detto ogni volta. */
  function paintModeHint() {
    const name = currentName(world.sliceMode);
    if (name === 'section') hud.modeHint(t.ui.modeHintSection);
    else if (name === 'projection') hud.modeHint(t.ui.modeHintProjection);
  }

  // --------------------------------------------------------------- eventi
  world.on(async (type, payload) => {
    if (type === 'bump') drone.tick(0.5);
    if (type === 'grab') hud.toast(t.puzzles[payload.puzzle]?.grab || '');
    if (type === 'solved') {
      const p = t.puzzles[payload.puzzle];
      if (p) {
        await voice.say(p.solved);
        hud.subtitle(null);
      }
      const all = refreshGoals({ open: true, hideAfter: 4200 });
      if (all) {
        await voice.say(t.objectives.allDone);
        hud.subtitle(null);
      }
      offerClip();
    }
  });

  function firstGesture() {
    if (settings.sound) {
      drone.start();
      drone.resume();
      drone.setMuted(!settings.sound);
    }
  }
  window.addEventListener('pointerdown', firstGesture, { once: true });

  // ------------------------------------------------------------- il clip
  async function offerClip() {
    if (!clipSupported()) return;
    hud.shareButton(t.ui.share, async () => {
      hud.hideShare();
      hud.recording(true);
      const blob = await clip.record(6);
      hud.recording(false);
      if (blob) {
        const res = await shareClip(blob, { title: t.title, text: t.thesis });
        if (res !== 'cancelled') hud.toast(t.ui.shared);
      }
    });
  }

  // ------------------------------------------------------- scelta vertice
  function projectToScreen(p4, transform) {
    if (!lastProj) return null;
    const world4 = transform ? transformPoint(transform, p4) : p4;
    const p = toCameraSpace(world.camera, world4);
    const w = Math.max(p[3], NEAR_W);
    const q = [
      (world.camera.focal * p[0]) / w,
      (world.camera.focal * p[1]) / w,
      (world.camera.focal * p[2]) / w,
    ];
    const v = world.view;
    const pos = [
      v.scale3 * q[0] + v.offset3[0],
      v.scale3 * q[1] + v.offset3[1],
      v.scale3 * q[2] + v.offset3[2],
      1,
    ];
    const mv = [0, 1, 2, 3].map((i) =>
      lastView[i] * pos[0] + lastView[4 + i] * pos[1] + lastView[8 + i] * pos[2] + lastView[12 + i] * pos[3]
    );
    const cl = [0, 1, 2, 3].map((i) =>
      lastProj[i] * mv[0] + lastProj[4 + i] * mv[1] + lastProj[8 + i] * mv[2] + lastProj[12 + i] * mv[3]
    );
    if (cl[3] <= 0.0001) return null;
    return {
      x: (cl[0] / cl[3] * 0.5 + 0.5) * canvas.clientWidth,
      y: (0.5 - (cl[1] / cl[3]) * 0.5) * canvas.clientHeight,
    };
  }

  function onTap(point) {
    if (!picking) {
      tapObjects(point);
      return;
    }
    const obj = world.objects.find((o) => o.role === 'polytope');
    if (!obj) return;
    let best = null;
    obj.poly.vertices.forEach((v, i) => {
      const p4 = new Float64Array([v[0] * obj.scale, v[1] * obj.scale, v[2] * obj.scale, v[3] * obj.scale]);
      const s = projectToScreen(p4, obj.transform);
      if (!s) return;
      const d = Math.hypot(s.x - point.x, s.y - point.y);
      if (d < 52 && (!best || d < best.d)) best = { i, d };
    });
    if (best) {
      pickedVertex = best.i;
      drone.tick(0.4);
    }
  }

  /**
   * Toccare una cosa deve fare qualcosa. Se non si può ancora prendere, il gioco
   * dice perché — una volta sola, e con la frase che è già l'indizio dell'enigma.
   */
  function tapObjects(point) {
    // il lucchetto: toccarlo lo apre, passando fuori dalla fetta
    const near = (obj, radius = 110) => {
      if (!obj || (obj.opacity ?? 1) < 0.05) return false;
      const s = projectToScreen(new Float64Array([0, 0, 0, 0]), obj.transform);
      return !!s && Math.hypot(s.x - point.x, s.y - point.y) < radius;
    };
    if (world.stage === 'oggetti') {
      const body = world.objects.find((o) => o.role === 'padlockBody');
      const shackle = world.objects.find((o) => o.role === 'shackle');
      if (near(body) || near(shackle)) {
        if (world.playPadlock()) drone.tick(0.4);
      }
      return;
    }
    // la mano: mezzo giro in xw, mostrato per intero
    const hand = world.objects.find((o) => o.role === 'hand');
    if (hand && near(hand, 90) && !world.puzzles.hand?.state.solved) {
      if (world.playMirror()) drone.tick(0.4);
      return;
    }

    const box = world.puzzles.box;
    const key = world.objects.find((o) => o.role === 'key');
    if (!box || !key || box.state.solved || box.state.holding) return;
    const s = projectToScreen(new Float64Array([0, 0, 0, 0]), key.transform);
    if (!s) return;
    if (Math.hypot(s.x - point.x, s.y - point.y) > 90) return;
    const res = box.attemptGrab(world.player, world.emit);
    if (res === 'grabbed') {
      drone.tick(0.7);
    } else if (res === 'blocked') {
      hud.toast(t.puzzles['sealed-box'].hint, 4600);
    } else {
      hud.toast(t.puzzles['sealed-box'].reach, 3600);
    }
  }

  // --------------------------------------------------------- gli obiettivi
  const GOALS = ['sealed-box', 'rings', 'hand'];
  let goalsTimer = null;

  function refreshGoals({ open = false, hideAfter = 0 } = {}) {
    if (world.stage !== 'room') return hud.goals(null);
    const solved = {
      'sealed-box': !!world.puzzles.box?.state.solved,
      rings: !!world.puzzles.rings?.state.solved,
      hand: !!world.puzzles.hand?.state.solved,
    };
    hud.goals(
      t.objectives.title,
      GOALS.map((id) => ({ text: t.objectives[id], done: solved[id] }))
    );
    if (open) hud.showGoals(true);
    if (goalsTimer) clearTimeout(goalsTimer);
    if (hideAfter) goalsTimer = setTimeout(() => hud.showGoals(false), hideAfter);
    return GOALS.every((id) => solved[id]);
  }

  hud.el.goalChip.onclick = () => hud.showGoals(!hud.goalsOpen());

  // ------------------------------------------------------------- il menu
  function openMenu() {
    hud.panel((panel) => {
      const h = document.createElement('h2');
      h.textContent = t.ui.settings;
      panel.appendChild(h);

      const langSel = document.createElement('select');
      langSel.className = 'btn';
      for (const code of ['it', 'en']) {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = code === 'it' ? 'Italiano' : 'English';
        if (code === settings.lang) o.selected = true;
        langSel.appendChild(o);
      }
      langSel.onchange = async () => {
        settings.lang = langSel.value;
        saveSettings();
        t = await loadLanguage(settings.lang);
        paintLabels();
        hud.closePanel();
      };
      row(panel, t.ui.language, langSel);

      row(panel, t.ui.subtitles, toggleControl(settings.subtitles, (v) => {
        settings.subtitles = v;
        saveSettings();
      }));
      row(panel, t.ui.sound, toggleControl(settings.sound, (v) => {
        settings.sound = v;
        saveSettings();
        drone.start();
        drone.setMuted(!v);
      }));
      row(panel, t.ui.reduceMotion, toggleControl(settings.reducedMotion, (v) => {
        settings.reducedMotion = v;
        saveSettings();
      }));
      row(panel, t.ui.wiggle, toggleControl(settings.wiggle, (v) => {
        settings.wiggle = v;
        saveSettings();
        if (!v) hud.toast(t.ui.wiggleOff, 2000);
      }));
      row(panel, t.ui.amplitude, sliderControl(settings.amplitudeDeg, 3, 6, 0.5, (v) => {
        settings.amplitudeDeg = v;
        saveSettings();
      }));
      row(panel, t.ui.frequency, sliderControl(settings.frequencyHz, 0.4, 0.8, 0.05, (v) => {
        settings.frequencyHz = v;
        saveSettings();
      }));
      row(panel, t.ui.gyro, toggleControl(settings.gyro, async (v) => {
        settings.gyro = v;
        saveSettings();
        if (v) {
          const ok = await controls.enableGyro();
          if (ok) controls.recalibrate();
        }
      }));

      const again = document.createElement('button');
      again.className = 'btn';
      again.textContent = t.ui.restart;
      again.onclick = () => {
        hud.closePanel();
        ladder.stop();
        setTimeout(() => startLadder(0), 60);
      };
      panel.appendChild(again);

      const labs = document.createElement('button');
      labs.className = 'btn';
      labs.textContent = t.ui.labs;
      labs.onclick = () => {
        hud.closePanel();
        hud.lab((root) => buildLabs(root, t.labs), t.ui.close);
      };
      panel.appendChild(labs);

      const things = document.createElement('button');
      things.className = 'btn';
      things.textContent = t.ui.everyday;
      things.onclick = () => {
        hud.closePanel();
        ladder.stop();
        startEveryday();
      };
      panel.appendChild(things);

      const explore = document.createElement('button');
      explore.className = 'btn';
      explore.textContent = t.ui.explore;
      explore.onclick = () => {
        hud.closePanel();
        ladder.stop();
        startExplore();
      };
      panel.appendChild(explore);

      const close = document.createElement('button');
      close.className = 'btn primary';
      close.textContent = t.ui.close;
      close.onclick = () => hud.closePanel();
      panel.appendChild(close);
    });
  }

  // ------------------------------------------------------------ il gioco
  const app = {
    world,
    hud,
    voice,
    drone,
    strings: () => t,
    setWMode(on) {
      controls.state.wMode = on;
      hud.setWMode(on);
    },
    setWiggleSuspended(v) {
      wiggleSuspended = v;
    },
    enableVertexPicking(on) {
      picking = on;
      pickedVertex = null;
    },
    get pickedVertex() {
      return pickedVertex;
    },
    capture: { offerClip },
  };

  const ladder = createLadder(app);

  async function startLadder(from = 0) {
    hud.objectChip(null);
    hud.goals(null);
    hud.modeBar(true);
    await ladder.run(from);
    startExplore();
  }

  /** La vetrina delle cose di casa: una tazza con vero spessore in w, e un lucchetto. */
  function startEveryday() {
    hud.goals(null);
    world.setStage('oggetti');
    hud.controls(false);
    hud.compass(true);
    hud.modeBar(true);
    hud.chapter(null);
    hud.objectChip(t.ui[world.showcase === 'mug' ? 'mug' : 'lucchetto']);
    hud.action(t.ui.everydayHint);
    setTimeout(() => hud.action(null), 7000);
  }

  hud.el.objectChip.onclick = () => {
    const name = world.nextShowcase();
    hud.objectChip(t.ui[name === 'mug' ? 'mug' : 'lucchetto']);
  };

  function startExplore() {
    hud.objectChip(null);
    world.setStage('room');
    hud.controls(true);
    hud.compass(true);
    hud.modeBar(true);
    hud.chapter(null);
    // Chi arriva qui deve sapere due cose: perché ci è e cosa deve fare.
    refreshGoals({ open: true, hideAfter: 9000 });
    paintModeHint();
    voice.say(t.objectives.intro).then(() => hud.subtitle(null));
    hud.hintW(true);
    const watch = setInterval(() => {
      if (Math.abs(world.player[3]) > 0.05) {
        hud.hintW(false);
        hud.action(null);
        clearInterval(watch);
      }
      if (world.stage !== 'room') clearInterval(watch);
    }, 200);
  }

  // Un aggancio per i test end-to-end e per chi vuole guardarci dentro.
  window.__fp = {
    world, renderer, controls, settings, hud, voice, drone, clip, ladder,
    projectToScreen, get view() { return world.view; },
    startExplore, startLadder, startEveryday,
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // gli altri politopi si preparano mentre si guarda il cold open
  setTimeout(() => {
    polytope('16-cell');
    polytope('24-cell');
  }, 1200);

  // ------------------------------------------------------------- il loop
  let last = performance.now();
  let crashed = false;

  /**
   * Rete di sicurezza: un'eccezione dentro il ciclo lo fermava per sempre, e il
   * gioco restava lì congelato senza dire niente. Adesso il fotogramma seguente
   * riparte comunque, e l'errore si vede una volta sola in console.
   */
  function frame(now) {
    try {
      frameBody(now);
    } catch (err) {
      if (!crashed) {
        crashed = true;
        console.error('fotogramma saltato:', err);
      }
    }
    requestAnimationFrame(frame);
  }

  function frameBody(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // "in movimento" non è solo il giroscopio: se stai toccando lo schermo la
    // parallasse la stai già generando tu, e quella imposta deve togliersi di mezzo.
    const touching =
      controls.state.move.x !== 0 || controls.state.move.y !== 0 ||
      controls.state.look.x !== 0 || controls.state.look.y !== 0 ||
      !!controls.state.dragObject;
    const moving = controls.deviceMoving || touching;
    const gain = handover.update(dt, moving);

    let eye;
    if (settings.gyro && controls.state.gyroActive) {
      const beta = lpBeta.update(controls.state.beta, dt);
      const gamma = lpGamma.update(controls.state.gamma, dt);
      eye = eyeFromOrientation({ beta, gamma, beta0: controls.state.beta0 ?? 0 });
    } else {
      eye = { x: 0, y: 0, z: VIEW_DISTANCE };
    }

    const geometry = world.geometry;
    const allowWiggle =
      !wiggleSuspended &&
      wiggleAllowed({
        geometry,
        projection: 'perspective',
        reducedMotion: settings.reducedMotion,
        userEnabled: settings.wiggle,
      });
    // La prima volta che entra, si dice cos'è e come si spegne. Una volta sola.
    if (allowWiggle && gain > 0.3 && !settings.seenWiggle) {
      settings.seenWiggle = true;
      saveSettings();
      hud.toast(t.ui.wiggleExplain, 6500);
    }
    if (allowWiggle) {
      const p = clampParams(settings);
      const off = wiggleOffset(world.time, { ...p, distance: VIEW_DISTANCE, gain });
      eye = { x: eye.x + off.x, y: eye.y + off.y, z: eye.z };
    }

    const size = screenHalfSizeMeters(canvas.clientWidth, canvas.clientHeight);

    controls.update(dt);
    world.update(dt, {
      move: controls.state.move,
      look: controls.state.look,
      w: controls.state.w,
      wMode: controls.state.wMode,
      dragObject: controls.state.dragObject,
    });
    controls.frameEnd();

    const scene = world.scene();
    const view = {
      eye,
      halfWidth: size.halfWidth,
      halfHeight: size.halfHeight,
      tilt: { x: eye.x / VIEW_DISTANCE, y: eye.y / VIEW_DISTANCE },
    };
    renderer.render(scene, view);
    lastProj = renderer.lastProj;
    lastView = renderer.lastView;

    // la guida della cassa segue quello che stai facendo, passo per passo
    const box = world.puzzles.box;
    if (box && !box.state.solved && (world.stage === 'room' || world.stage === 'box')) {
      const step = box.guide(world.player);
      const text = t.puzzles['sealed-box'].guide[step];
      if (text && text !== lastGuide) {
        lastGuide = text;
        hud.action(text);
      }
    }

    compass.draw(cameraPlaneAngles(world.camera), world.player[3], W_RANGE);
    hud.setMode(currentName(world.sliceMode));
    if (hud.el.modeBar && !hud.el.modeBar.classList.contains('hidden') && world.stage === 'room') paintModeHint();
    drone.setW(world.player[3]);
  }
  requestAnimationFrame(frame);

  // --------------------------------------------------------- si comincia
  const start = await runColdOpen({ world, hud, t, seconds: fast ? 0.4 : undefined });
  hud.silence(false);
  if (start === 'ladder') startLadder(0);
  else startExplore();

}

boot();
