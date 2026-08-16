// Test end-to-end (SPEC §12).
// Girano su un telefono simulato, perché è lì che il gioco deve stare in piedi.

import { test, expect } from '@playwright/test';

const ready = async (page) => page.waitForFunction(() => !!window.__fp, null, { timeout: 30000 });

test('il primo fotogramma arriva entro tre secondi con la CPU rallentata 4×', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__fp && window.__fp.renderer.state.frames > 0, null, { timeout: 20000 });
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(3000);
});

test('il cold open mostra qualcosa di impossibile prima di ogni testo', async ({ page }) => {
  await page.goto('/index.html');
  // entro tre secondi: nessun menu, nessuna spiegazione, solo la scena
  await page.waitForTimeout(1200);
  expect(await page.locator('#subtitle').isVisible()).toBeFalsy();
  expect(await page.locator('#chapterTitle').isVisible()).toBeFalsy();
  await ready(page);
  expect(await page.evaluate(() => window.__fp.world.stage)).toBe('coldopen');
  await expect(page.locator('#coldopen')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#coldopenText')).toHaveText(/vuoi capire/i);
});

test('la Scala si percorre tutta, e ogni capitolo aspetta il giocatore', async ({ page }) => {
  await page.goto('/index.html?fast=1');
  await ready(page);
  await page.getByText('sì, spiegamelo').click();

  const chapterIs = async (n) =>
    page.waitForFunction((k) => window.__fp.ladder.index === k, n, { timeout: 40000 });

  const drag = async (dx, dy) => {
    await page.mouse.move(195, 400);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(195 + (dx * i) / 12, 400 + (dy * i) / 12);
    await page.mouse.up();
  };

  // 1 — trascinare il cubo
  await chapterIs(0);
  for (let i = 0; i < 5; i++) await drag(140, 40);
  // 2 — il mondo piatto: si sceglie, e sbagliare è previsto
  await chapterIs(1);
  await page.locator('#choices button').first().click({ timeout: 30000 });
  // 3 — rovesciare il tesseratto in un piano che contiene w
  await chapterIs(2);
  for (let i = 0; i < 10; i++) await drag(180, 0);
  // 4 — commutare fra ombra e fetta
  await chapterIs(3);
  await page.locator('#modeSection').click();
  await page.waitForTimeout(500);
  await page.locator('#modeProjection').click();
  await page.waitForTimeout(500);
  await page.locator('#modeSection').click();
  // 5 — toccare un vertice e contare gli spigoli
  await chapterIs(4);
  const vertexScreen = () =>
    page.evaluate(() => {
      const fp = window.__fp;
      const obj = fp.world.objects.find((o) => o.role === 'polytope');
      if (!obj) return null;
      const v = obj.poly.vertices[0];
      return fp.projectToScreen(
        new Float64Array([v[0] * obj.scale, v[1] * obj.scale, v[2] * obj.scale, v[3] * obj.scale]),
        obj.transform
      );
    });
  // il capitolo apre la scelta del vertice solo dopo aver finito di parlare
  for (let attempt = 0; attempt < 15; attempt++) {
    const vs = await vertexScreen();
    expect(vs).not.toBeNull();
    await page.mouse.click(Math.round(vs.x), Math.round(vs.y));
    await page.waitForTimeout(700);
    if (await page.evaluate(() => window.__fp.world && document.querySelectorAll('#choices button').length > 0)) break;
  }
  await page.getByRole('button', { name: '4', exact: true }).click({ timeout: 30000 });
  // 6 — la cassa sigillata
  await chapterIs(5);
  await solveSealedBox(page);
  // 7 — nessuna azione
  await chapterIs(6);
  await page.waitForFunction(() => window.__fp.world.stage === 'room', null, { timeout: 60000 });
});

/** L'enigma risolto con i comandi veri: cursore w, stick di movimento. */
async function solveSealedBox(page) {
  const setMove = (m) => page.evaluate((v) => {
    window.__fp.controls.state.move = v;
  }, m);
  const stop = () => setMove({ x: 0, y: 0 });
  const setW = (w) => page.evaluate((v) => window.__fp.controls.setW(v), w);
  const player = () => page.evaluate(() => [...window.__fp.world.player]);

  /** Cammina finché la condizione non è vera, poi si ferma. */
  const walkUntil = async (move, done, timeout = 12000) => {
    await setMove(move);
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (done(await player())) break;
      await page.waitForTimeout(80);
    }
    await stop();
  };

  await setW(0.7); // fuori dalla fetta: la cassa non è più un ostacolo
  await walkUntil({ x: 0, y: 1 }, (p) => Math.abs(p[2]) < 0.18); // sopra il coperchio
  await setW(0); // e giù, dentro
  await page.waitForFunction(() => window.__fp.world.puzzles.box.state.holding, null, { timeout: 20000 });
  await setW(0.7);
  await walkUntil({ x: 0, y: -1 }, (p) => p[2] > 1.1); // indietro, fuori dalla cassa
  await setW(0);
  await page.waitForFunction(() => window.__fp.world.puzzles.box.state.solved, null, { timeout: 20000 });
}

test('un enigma si risolve con i comandi, e solo uscendo dalla fetta', async ({ page }) => {
  await page.goto('/index.html?fast=1');
  await ready(page);
  await page.getByText('no, fammi provare').click();
  await page.waitForFunction(() => window.__fp.world.stage === 'room', null, { timeout: 20000 });

  // restando nella fetta la cassa tiene: si sbatte contro la parete
  const before = await page.evaluate(() => [...window.__fp.world.player]);
  await page.evaluate(() => {
    window.__fp.controls.state.move = { x: 0, y: 1 };
  });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    window.__fp.controls.state.move = { x: 0, y: 0 };
  });
  const blocked = await page.evaluate(() => [...window.__fp.world.player]);
  expect(await page.evaluate(() => window.__fp.world.puzzles.box.state.holding)).toBeFalsy();
  expect(Math.abs(blocked[2])).toBeGreaterThan(0.5); // la parete lo ha fermato
  expect(before[2]).toBeGreaterThan(blocked[2]);

  await solveSealedBox(page);
  expect(await page.evaluate(() => window.__fp.world.puzzles.box.state.solved)).toBeTruthy();
});

test('toccare la chiave fa qualcosa: o la prende, o dice perché no', async ({ page }) => {
  await page.goto('/index.html?fast=1');
  await ready(page);
  await page.getByText('no, fammi provare').click();
  await page.waitForFunction(() => window.__fp.world.stage === 'room', null, { timeout: 20000 });

  const keyScreen = () =>
    page.evaluate(() => {
      const fp = window.__fp;
      const k = fp.world.objects.find((o) => o.role === 'key');
      return fp.projectToScreen(new Float64Array([0, 0, 0, 0]), k.transform);
    });

  // da fuori la cassa: toccarla non la prende, ma spiega perché — mai un tocco muto
  const s = await keyScreen();
  expect(s).not.toBeNull();
  await page.mouse.click(Math.round(s.x), Math.round(s.y));
  await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#toast')).toHaveText(/fetta/i);
  expect(await page.evaluate(() => window.__fp.world.puzzles.box.state.holding)).toBeFalsy();

  // e una volta dentro, si prende
  await page.evaluate(() => window.__fp.controls.setW(0.7));
  await page.evaluate(() => {
    window.__fp.controls.state.move = { x: 0, y: 1 };
  });
  await page.waitForFunction(() => Math.abs(window.__fp.world.player[2]) < 0.18, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__fp.controls.state.move = { x: 0, y: 0 };
  });
  await page.evaluate(() => window.__fp.controls.setW(0));
  await page.waitForFunction(() => window.__fp.world.puzzles.box.state.holding, null, { timeout: 10000 });
});

test('il frustum accoppiato dà parallasse orizzontale e verticale, coerenti con l inclinazione', async ({ page }) => {
  await page.goto('/index.html?fast=1');
  await ready(page);
  await page.evaluate(() => {
    window.__fp.settings.gyro = true;
    window.__fp.settings.wiggle = false; // niente oscillazione: qui misuriamo il giroscopio
    window.__fp.controls.state.gyroActive = true;
    window.__fp.controls.state.beta0 = 0;
  });

  const sample = async (beta, gamma) => {
    await page.evaluate(([b, g]) => {
      window.__fp.controls.state.beta = b;
      window.__fp.controls.state.gamma = g;
    }, [beta, gamma]);
    await page.waitForTimeout(700); // il passa-basso deve arrivare a regime
    return page.evaluate(() => {
      const p = window.__fp.projectToScreen(new Float64Array([0, 0, 0, 0]), null);
      const eye = window.__fp.renderer.lastView;
      return { p, eyeX: -eye[12], eyeY: -eye[13] };
    });
  };

  const centre = await sample(0, 0);
  const right = await sample(0, 10);
  const up = await sample(10, 0);

  // l'occhio si sposta davvero: se questi sono zero, l'effetto non c'è
  expect(Math.abs(right.eyeX - centre.eyeX)).toBeGreaterThan(0.01);
  expect(Math.abs(up.eyeY - centre.eyeY)).toBeGreaterThan(0.01);

  // e la scena dietro il vetro si sposta: orizzontale E verticale
  expect(Math.abs(right.p.x - centre.p.x)).toBeGreaterThan(2);
  expect(Math.abs(up.p.y - centre.p.y)).toBeGreaterThan(2);
  // l'occhio va a destra, il punto dietro la finestra va a destra con lui
  expect(Math.sign(right.p.x - centre.p.x)).toBe(Math.sign(right.eyeX - centre.eyeX));
  expect(Math.sign(up.p.y - centre.p.y)).toBe(-Math.sign(up.eyeY - centre.eyeY));
});

test('il clip condivisibile viene generato ed è riproducibile', async ({ page }) => {
  await page.goto('/index.html?fast=1');
  await ready(page);
  const info = await page.evaluate(async () => {
    const blob = await window.__fp.clip.record(1.2);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.src = url;
    const ok = await new Promise((resolve) => {
      v.onloadeddata = () => resolve(true);
      v.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 8000);
    });
    return { size: blob.size, type: blob.type, playable: ok };
  });
  expect(info).not.toBeNull();
  expect(info.size).toBeGreaterThan(1000);
  expect(info.playable).toBeTruthy();
});

test('funziona offline: è una PWA, non una pagina', async ({ page, context }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, { timeout: 20000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2500); // il guscio finisce in cache
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.__fp.renderer.state.frames)).toBeGreaterThan(0);
  await context.setOffline(false);
});
