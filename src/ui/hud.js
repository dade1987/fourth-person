// hud.js — l'interfaccia.
//
// Due regole che valgono più di ogni altra cosa scritta qui:
//   niente testo sullo schermo durante un momento wow (SPEC §18);
//   la bussola sta sempre a schermo, perché senza il giocatore si perde in
//   trenta secondi (SPEC §7).

const $ = (id) => document.getElementById(id);

function show(el, on) {
  if (!el) return;
  el.classList.toggle('hidden', !on);
  if (on) el.classList.remove('gone');
}

export function createHud() {
  const el = {
    subtitle: $('subtitle'),
    action: $('action'),
    chapter: $('chapterTitle'),
    choices: $('choices'),
    toast: $('toast'),
    controls: $('controls'),
    compass: $('compass'),
    modeBar: $('modeBar'),
    modeHint: $('modeHint'),
    coldopen: $('coldopen'),
    coldopenText: $('coldopenText'),
    coldopenBtns: $('coldopenBtns'),
    panel: $('panel'),
    share: $('share'),
    rec: $('recdot'),
    flatwrap: $('flatwrap'),
    flatstrip: $('flatstrip'),
    wvalue: $('wvalue'),
    wknob: $('wknob'),
    wslider: $('wslider'),
    wbutton: $('wbutton'),
    stickL: $('stickL'),
    stickR: $('stickR'),
    knobL: $('knobL'),
    knobR: $('knobR'),
    modeProjection: $('modeProjection'),
    modeSection: $('modeSection'),
    menuBtn: $('menuBtn'),
  };

  let toastTimer = null;
  let flatAnim = 0;

  const hud = {
    el,

    subtitle(text) {
      if (!text) return show(el.subtitle, false);
      el.subtitle.textContent = text;
      show(el.subtitle, true);
    },

    action(text) {
      if (!text) return show(el.action, false);
      el.action.textContent = text;
      show(el.action, true);
    },

    chapter(n, total, title, label = 'capitolo', of = 'di') {
      if (n == null) return show(el.chapter, false);
      el.chapter.innerHTML = `${label} ${n} ${of} ${total}<b></b>`;
      el.chapter.querySelector('b').textContent = title;
      show(el.chapter, true);
    },

    /** Sceglie fra alcune opzioni. Risolve con l'indice. */
    choices(labels, { primaryFirst = true } = {}) {
      el.choices.innerHTML = '';
      return new Promise((resolve) => {
        labels.forEach((label, i) => {
          const b = document.createElement('button');
          b.className = 'btn' + (primaryFirst && i === 0 ? ' primary' : '');
          b.textContent = label;
          b.onclick = () => {
            show(el.choices, false);
            el.choices.innerHTML = '';
            resolve(i);
          };
          el.choices.appendChild(b);
        });
        show(el.choices, true);
      });
    },

    hideChoices() {
      show(el.choices, false);
      el.choices.innerHTML = '';
    },

    toast(text, ms = 2600) {
      if (toastTimer) clearTimeout(toastTimer);
      el.toast.textContent = text;
      show(el.toast, true);
      toastTimer = setTimeout(() => show(el.toast, false), ms);
    },

    /** Silenzio assoluto: nessun testo, nessun comando. È il momento forte. */
    silence(on = true) {
      show(el.subtitle, !on && !!el.subtitle.textContent);
      show(el.action, false);
      show(el.choices, false);
      show(el.chapter, !on);
      show(el.modeBar, !on);
      show(el.modeHint, false);
      show(el.toast, false);
      show(el.share, false);
    },

    controls(on) { show(el.controls, on); },
    compass(on) { show(el.compass, on); },
    modeBar(on) { show(el.modeBar, on); },
    modeHint(text) {
      if (!text) return show(el.modeHint, false);
      el.modeHint.textContent = text;
      show(el.modeHint, true);
    },

    coldopen(text, labels) {
      el.coldopenText.textContent = text;
      el.coldopenBtns.innerHTML = '';
      return new Promise((resolve) => {
        labels.forEach((label, i) => {
          const b = document.createElement('button');
          b.className = 'btn' + (i === 0 ? ' primary' : '');
          b.textContent = label;
          b.onclick = () => {
            show(el.coldopen, false);
            resolve(i);
          };
          el.coldopenBtns.appendChild(b);
        });
        show(el.coldopen, true);
      });
    },

    shareButton(label, onClick) {
      el.share.textContent = label;
      el.share.onclick = onClick;
      show(el.share, true);
    },
    hideShare() { show(el.share, false); },
    recording(on) { show(el.rec, on); },

    setW(value) {
      el.wvalue.textContent = `w ${value >= 0 ? ' ' : ''}${value.toFixed(2)}`;
      const h = el.wslider.clientHeight - 44;
      el.wknob.style.top = `${5 + h * (0.5 - value / 2.4)}px`;
    },

    setWMode(on) {
      el.wbutton.classList.toggle('on', on);
      el.stickR.classList.toggle('wmode', on);
    },

    setMode(name) {
      el.modeProjection.classList.toggle('on', name === 'projection');
      el.modeSection.classList.toggle('on', name === 'section');
    },

    /**
     * Il mondo piatto: questa striscia è tutta la vista di chi ci vive.
     * Non è un disegno: è davvero l'immagine 1-D di una figura che passa.
     */
    flatland(kind = 'circle') {
      const cv = el.flatstrip;
      const ctx = cv.getContext('2d');
      show(el.flatwrap, true);
      const shape = [];
      if (kind === 'circle') {
        for (let i = 0; i < 64; i++) {
          const a = (2 * Math.PI * i) / 64;
          shape.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
        }
      } else if (kind === 'square') {
        for (const [x, y] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) shape.push([x, y]);
      } else {
        for (const [x, y] of [[0, 0.55], [0.5, -0.35], [-0.5, -0.35]]) shape.push([x, y]);
      }
      const t0 = performance.now();
      const draw = () => {
        const w = (cv.width = cv.clientWidth * (window.devicePixelRatio || 1));
        const h = (cv.height = 46 * (window.devicePixelRatio || 1));
        const t = ((performance.now() - t0) / 1000) % 6;
        const cx = -2.2 + (t / 6) * 4.4;
        const cy = 1.7;
        const rot = t * 0.8;
        let lo = 1e9;
        let hi = -1e9;
        let near = 1e9;
        for (const [sx, sy] of shape) {
          const x = cx + sx * Math.cos(rot) - sy * Math.sin(rot);
          const y = cy + sx * Math.sin(rot) + sy * Math.cos(rot);
          const u = x / y; // la retina dell'abitante piatto: una sola coordinata
          lo = Math.min(lo, u);
          hi = Math.max(hi, u);
          near = Math.min(near, y);
        }
        ctx.fillStyle = '#0a0b0f';
        ctx.fillRect(0, 0, w, h);
        const toPx = (u) => ((u + 1.6) / 3.2) * w;
        const a = Math.max(0, toPx(lo));
        const b = Math.min(w, toPx(hi));
        if (b > a) {
          const g = ctx.createLinearGradient(a, 0, b, 0);
          const bright = Math.min(1, 1.5 / near);
          g.addColorStop(0, `rgba(142,197,255,${0.35 * bright})`);
          g.addColorStop(0.5, `rgba(200,225,255,${0.95 * bright})`);
          g.addColorStop(1, `rgba(142,197,255,${0.35 * bright})`);
          ctx.fillStyle = g;
          ctx.fillRect(a, 0, b - a, h);
        }
        flatAnim = requestAnimationFrame(draw);
      };
      cancelAnimationFrame(flatAnim);
      draw();
      return () => {
        cancelAnimationFrame(flatAnim);
        show(el.flatwrap, false);
      };
    },

    panel(build) {
      el.panel.innerHTML = '';
      build(el.panel);
      el.panel.classList.remove('gone');
      requestAnimationFrame(() => show(el.panel, true));
    },
    closePanel() {
      show(el.panel, false);
      setTimeout(() => el.panel.classList.add('gone'), 280);
    },
    panelOpen() {
      return !el.panel.classList.contains('gone') && !el.panel.classList.contains('hidden');
    },
  };

  return hud;
}

export function row(parent, label, control) {
  const d = document.createElement('div');
  d.className = 'row';
  const l = document.createElement('label');
  l.textContent = label;
  d.append(l, control);
  parent.appendChild(d);
  return d;
}

export function toggleControl(value, onChange) {
  const b = document.createElement('button');
  b.className = 'btn';
  const paint = () => {
    b.textContent = value ? 'sì' : 'no';
    b.classList.toggle('primary', value);
  };
  b.onclick = () => {
    value = !value;
    paint();
    onChange(value);
  };
  paint();
  return b;
}

export function sliderControl(value, min, max, step, onChange) {
  const i = document.createElement('input');
  i.type = 'range';
  i.min = min;
  i.max = max;
  i.step = step;
  i.value = value;
  i.oninput = () => onChange(parseFloat(i.value));
  return i;
}
