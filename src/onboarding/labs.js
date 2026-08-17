// labs.js — sotto il cofano.
//
// La Scala è per chi non sa niente e va accompagnato. Questo è l'altro pubblico:
// quello che la formula la vuole vedere, e vuole poterla muovere. Stessa regola
// però — nessuna formula senza una manopola che la fa succedere, e nessun numero
// che non venga dalle stesse funzioni che fanno girare il gioco.
//
// Tutto quello che si legge qui dentro è calcolato da `src/math4d/`: se un giorno
// la matematica cambia, questi pannelli cambiano con lei o smettono di tornare.

import {
  identity, planeRotation, mul, apply, det, orthonormalityError, transpose,
} from '../math4d/rotor.js';
import * as bv from '../math4d/bivector.js';
import { wedge3, dot4, normalize4, length4 } from '../math4d/wedge.js';
import { makeBody, step, worldAngularMomentum, angularVelocity } from '../math4d/rigidbody.js';
import { integrate, circularSpeed, intensity } from '../math4d/orbit.js';
import { sphere3Area, ball4Volume, polytope, KNOWN_COUNTS } from '../math4d/polytope.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const fmt = (x, d = 3) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(d));

function card(parent, { title, formula, meaning }) {
  const c = el('section', 'lab-card');
  c.append(el('h3', null, title));
  const f = el('pre', 'lab-formula', formula);
  c.append(f);
  const body = el('div', 'lab-body');
  c.append(body);
  c.append(el('p', 'lab-meaning', meaning));
  parent.append(c);
  return body;
}

function sliderIn(parent, label, { min, max, step, value }, onInput) {
  const row = el('div', 'lab-row');
  const name = el('label', null, label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  const out = el('output', null, '');
  row.append(name, input, out);
  parent.append(row);
  const fire = () => onInput(parseFloat(input.value), out);
  input.oninput = fire;
  fire();
  return input;
}

function readout(parent) {
  const pre = el('pre', 'lab-readout', '');
  parent.append(pre);
  return pre;
}

function matrixText(m) {
  let s = '';
  for (let r = 0; r < 4; r++) {
    s += [0, 1, 2, 3].map((c) => fmt(m[r * 4 + c], 2).padStart(6)).join(' ') + '\n';
  }
  return s.trimEnd();
}

// ---------------------------------------------------------------------------

/** 1 — In 4D si ruota in un piano. L'asse non c'è, e qui si vede che non serve. */
function labRotation(parent, L) {
  const body = card(parent, L.rotation);
  let alpha = 0.8;
  let beta = 0.0;
  const out = readout(body);
  const canvas = el('canvas', 'lab-canvas');
  body.append(canvas);
  const ctx = canvas.getContext('2d');

  const paint = () => {
    const R = mul(planeRotation(0, 1, alpha), planeRotation(2, 3, beta));
    const v = apply(R, new Float64Array([1, 0, 1, 0]));
    out.textContent =
      `${matrixText(R)}\n\n` +
      `det R = ${fmt(det(R), 6)}   (deve essere +1)\n` +
      `|RᵀR − I| = ${orthonormalityError(R).toExponential(1)}\n` +
      `(1,0,1,0) → (${[...v].map((x) => fmt(x, 2)).join(', ')})`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (canvas.width = canvas.clientWidth * dpr);
    const h = (canvas.height = 120 * dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(dpr, dpr);
    const cw = canvas.clientWidth;
    // due cerchi: i due piani girano davvero in modo indipendente
    [[cw * 0.28, alpha, 'xy', '#8ec5ff'], [cw * 0.72, beta, 'zw', '#ffbe6b']].forEach(([cx, ang, name, col]) => {
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath();
      ctx.arc(cx, 58, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, 58);
      ctx.lineTo(cx + Math.cos(ang) * 40, 58 + Math.sin(ang) * 40);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, cx, 112);
    });
    ctx.restore();
  };

  const controls = el('div', 'lab-controls');
  body.insertBefore(controls, out);
  sliderIn(controls, 'α (xy)', { min: -3.14, max: 3.14, step: 0.01, value: alpha }, (v, o) => {
    alpha = v;
    o.textContent = `${fmt(v, 2)} rad`;
    paint();
  });
  sliderIn(controls, 'β (zw)', { min: -3.14, max: 3.14, step: 0.01, value: beta }, (v, o) => {
    beta = v;
    o.textContent = `${fmt(v, 2)} rad`;
    paint();
  });
  paint();
  return paint;
}

/** 2 — Il momento angolare è un bivettore: sei numeri, e restano sei. */
function labBivector(parent, L) {
  const body = card(parent, L.bivector);
  const comps = new Float64Array([1, 0, 0, 0, 0, 0.6]);
  const out = readout(body);

  const paint = () => {
    const b = makeBody({
      inertia: new Float64Array([1, 1.4, 1.9, 1.1, 1.6, 2.2]),
      angularMomentum: Float64Array.from(comps),
    });
    const before = worldAngularMomentum(b);
    const w = angularVelocity(b);
    for (let i = 0; i < 600; i++) step(b, 1 / 240);
    const after = worldAngularMomentum(b);
    let drift = 0;
    for (let i = 0; i < 6; i++) drift = Math.max(drift, Math.abs(after[i] - before[i]));
    out.textContent =
      `L  = [${[...comps].map((x) => fmt(x, 2)).join(', ')}]\n` +
      `Ω  = [${[...w].map((x) => fmt(x, 2)).join(', ')}]   (Ω = I⁻¹L)\n` +
      `|L| = ${fmt(bv.norm(comps), 3)}\n\n` +
      `dopo 2,5 s di volo libero:\n` +
      `deriva massima di R L Rᵀ = ${drift.toExponential(1)}`;
  };

  bv.PLANE_NAMES.forEach((name, i) => {
    sliderIn(body, name, { min: -2, max: 2, step: 0.05, value: comps[i] }, (v, o) => {
      comps[i] = v;
      o.textContent = fmt(v, 2);
      paint();
    });
  });
  paint();
  return paint;
}

/** 3 — Niente prodotto vettoriale: la normale viene da TRE vettori. */
function labWedge(parent, L) {
  const body = card(parent, L.wedge);
  const vecs = [
    new Float64Array([1, 0, 0, 0]),
    new Float64Array([0, 1, 0, 0]),
    new Float64Array([0, 0, 1, 0]),
  ];
  const out = readout(body);

  const paint = () => {
    const n = wedge3(vecs[0], vecs[1], vecs[2]);
    const u = length4(n) > 1e-9 ? normalize4(n) : n;
    out.textContent =
      `a = (${[...vecs[0]].map((x) => fmt(x, 2)).join(', ')})\n` +
      `b = (${[...vecs[1]].map((x) => fmt(x, 2)).join(', ')})\n` +
      `c = (${[...vecs[2]].map((x) => fmt(x, 2)).join(', ')})\n\n` +
      `n = ⋆(a∧b∧c) = (${[...u].map((x) => fmt(x, 2)).join(', ')})\n\n` +
      `n·a = ${fmt(dot4(u, vecs[0]), 4)}\n` +
      `n·b = ${fmt(dot4(u, vecs[1]), 4)}\n` +
      `n·c = ${fmt(dot4(u, vecs[2]), 4)}   ← sempre zero, tutti e tre`;
  };

  ['a', 'b', 'c'].forEach((name, k) => {
    ['x', 'y', 'z', 'w'].forEach((axis, i) => {
      sliderIn(body, `${name}.${axis}`, { min: -1, max: 1, step: 0.05, value: vecs[k][i] }, (v, o) => {
        vecs[k][i] = v;
        o.textContent = fmt(v, 2);
        paint();
      });
    });
  });
  paint();
  return paint;
}

/** 4 — La caduta cubica, e le orbite che non stanno in piedi (Ehrenfest 1917). */
function labGravity(parent, L) {
  const body = card(parent, L.gravity);
  let perturb = 1;
  const out = readout(body);
  const canvas = el('canvas', 'lab-canvas');
  body.append(canvas);
  const ctx = canvas.getContext('2d');

  const paint = () => {
    const r0 = 1 + perturb / 100;
    const run = integrate({
      mu: 1,
      position: new Float64Array([r0, 0, 0, 0]),
      velocity: new Float64Array([0, circularSpeed(1, 1), 0, 0]),
      dt: 2e-3,
      steps: 12000,
    });
    const radii = run.radii;
    const last = radii[radii.length - 1];
    out.textContent =
      `area della 3-sfera = 2π²r³ = ${fmt(sphere3Area(1), 3)} · r³\n` +
      `⇒ F ∝ 1/r³\n\n` +
      `a distanza doppia l'intensità è ${fmt(intensity(1, 2) / intensity(1, 1), 3)} (un ottavo)\n` +
      `raggio iniziale ${fmt(r0, 3)} → finale ${fmt(last, 3)}\n` +
      (last > 1.5 ? L.gravity.escaped : last < 0.7 ? L.gravity.fallen : L.gravity.stable);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (canvas.width = canvas.clientWidth * dpr);
    const h = (canvas.height = 120 * dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(dpr, dpr);
    const cw = canvas.clientWidth;
    const max = Math.max(2, Math.min(6, Math.max(...radii)));
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(0, 118 - (1 / max) * 110);
    ctx.lineTo(cw, 118 - (1 / max) * 110);
    ctx.stroke();
    ctx.strokeStyle = '#8ec5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < radii.length; i += 20) {
      const x = (i / radii.length) * cw;
      const y = 118 - Math.min(1, radii[i] / max) * 110;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  sliderIn(body, L.gravity.perturbation, { min: -5, max: 5, step: 0.25, value: perturb }, (v, o) => {
    perturb = v;
    o.textContent = `${fmt(v, 2)} %`;
    paint();
  });
  paint();
  return paint;
}

/** 5 — Chiralità: solo un piano che contiene w ribalta il segno. */
function labChirality(parent, L) {
  const body = card(parent, L.chirality);
  let R = identity();
  const out = readout(body);

  const sign = (m) => {
    const e1 = apply(m, new Float64Array([1, 0, 0, 0]));
    const e2 = apply(m, new Float64Array([0, 1, 0, 0]));
    const e3 = apply(m, new Float64Array([0, 0, 1, 0]));
    return -Math.sign(wedge3(e1, e2, e3)[3]) || 1;
  };

  const paint = () => {
    const s = sign(R);
    out.textContent =
      `${matrixText(R)}\n\n` +
      `det R = ${fmt(det(R), 4)}   (sempre +1: è una rotazione)\n` +
      `segno di ⋆(e₁∧e₂∧e₃) = ${s > 0 ? '+1' : '−1'}\n` +
      (s > 0 ? L.chirality.right : L.chirality.left);
  };

  const buttons = el('div', 'lab-buttons');
  for (const [label, i, j] of [['xy', 0, 1], ['xz', 0, 2], ['yz', 1, 2], ['xw', 0, 3], ['yw', 1, 3], ['zw', 2, 3]]) {
    const b = el('button', 'btn' + (j === 3 ? ' primary' : ''), `180° ${label}`);
    b.onclick = () => {
      R = mul(R, planeRotation(i, j, Math.PI));
      paint();
    };
    buttons.append(b);
  }
  const reset = el('button', 'btn', L.chirality.reset);
  reset.onclick = () => {
    R = identity();
    paint();
  };
  buttons.append(reset);
  body.append(buttons);
  paint();
  return paint;
}

/** 6 — I sei politopi, contati davvero. */
function labPolytopes(parent, L) {
  const body = card(parent, L.polytopes);
  const out = readout(body);
  const names = Object.keys(KNOWN_COUNTS);
  let text = `${L.polytopes.header}\n`;
  for (const name of names) {
    const known = KNOWN_COUNTS[name];
    text += `${name.padEnd(10)} ${known.map((x) => String(x).padStart(5)).join('')}\n`;
  }
  text += `\nipercubo di lato 2: ${fmt(2 ** 4, 0)}\n4-palla di raggio 1: π²/2 = ${fmt(ball4Volume(1), 4)}`;
  out.textContent = text;

  const check = el('button', 'btn primary', L.polytopes.verify);
  check.onclick = () => {
    check.disabled = true;
    check.textContent = '…';
    setTimeout(() => {
      const lines = names.map((name) => {
        const p = polytope(name);
        const ok = p.counts.every((c, i) => c === KNOWN_COUNTS[name][i]);
        return `${name.padEnd(10)} ${p.counts.map((x) => String(x).padStart(5)).join('')}  ${ok ? '✓' : '✗'}`;
      });
      out.textContent = `${L.polytopes.generated}\n${lines.join('\n')}`;
      check.textContent = L.polytopes.verified;
    }, 30);
  };
  body.append(check);
  return () => {};
}

export const LAB_KEYS = ['rotation', 'bivector', 'wedge', 'gravity', 'chirality', 'polytopes'];

/** Costruisce tutti i pannelli dentro un contenitore già pronto. */
export function buildLabs(container, L) {
  container.innerHTML = '';
  container.append(el('h2', null, L.title));
  container.append(el('p', 'lab-intro', L.intro));
  const repaints = [
    labRotation(container, L),
    labBivector(container, L),
    labWedge(container, L),
    labGravity(container, L),
    labChirality(container, L),
    labPolytopes(container, L),
  ];
  // I canvas nascono senza larghezza: si ridisegnano quando il pannello ce l'ha,
  // e ogni volta che lo schermo cambia forma.
  const redraw = () => repaints.forEach((f) => f && f());
  requestAnimationFrame(() => requestAnimationFrame(redraw));
  window.addEventListener('resize', redraw);
  return redraw;
}
