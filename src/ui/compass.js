// compass.js — la bussola a sei quadranti (SPEC §7).
//
// "Senza, il giocatore si perde in trenta secondi: è il pezzo di interfaccia più
// importante del progetto." Sei quadranti, uno per piano di rotazione, più la
// tacca della tua posizione lungo w. I tre piani che contengono w sono in ambra:
// sono quelli che ti portano fuori dalla fetta.

import { PLANE_NAMES, W_PLANES } from '../math4d/bivector.js';

export function createCompass(canvas) {
  const ctx = canvas.getContext('2d');

  function draw(angles, w, wRange = 1.2) {
    // Nascosta o non ancora impaginata: larghezza e altezza sono zero, e un
    // raggio negativo farebbe eccezione. Un'eccezione qui fermava il ciclo di
    // rendering e con lui tutto il gioco.
    if (canvas.clientWidth < 8 || canvas.clientHeight < 8) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (canvas.width = canvas.clientWidth * dpr);
    const H = (canvas.height = canvas.clientHeight * dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(dpr, dpr);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    const cols = 3;
    const rows = 2;
    const cellW = cw / cols;
    const cellH = (ch - 16) / rows;
    const r = Math.min(cellW, cellH) * 0.31;

    PLANE_NAMES.forEach((name, i) => {
      const cx = (i % cols) * cellW + cellW / 2;
      const cy = Math.floor(i / cols) * cellH + cellH / 2;
      const isW = W_PLANES.includes(i);
      const tint = isW ? '255,190,107' : '142,197,255';

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${tint},0.28)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      const a = angles[i] || 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.strokeStyle = `rgba(${tint},0.95)`;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = `rgba(${tint},0.6)`;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, cx, cy + r + 9);
    });

    // la tacca di w: dove sei rispetto alla fetta abitata
    const barY = ch - 6;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(4, barY, cw - 8, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cw / 2 - 0.5, barY - 2, 1, 7);
    const x = 4 + ((w / wRange + 1) / 2) * (cw - 8);
    ctx.fillStyle = Math.abs(w) < 0.05 ? '#8ec5ff' : '#ffbe6b';
    ctx.beginPath();
    ctx.arc(Math.max(4, Math.min(cw - 4, x)), barY + 1.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return { draw };
}
