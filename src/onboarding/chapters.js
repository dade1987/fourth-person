// chapters.js — la Scala (SPEC §8.1).
//
// Non un tutorial dei comandi: un percorso che rifà la strada del capire.
// Principio guida, e vale per tutti e sette i capitoli: ognuno si chiude con
// un'azione che il giocatore compie di persona. Non "guarda cosa succede":
// fallo tu. Nessun capitolo avanza da solo.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function waitFor(predicate, { interval = 90 } = {}) {
  return new Promise((resolve) => {
    const id = setInterval(() => {
      if (predicate()) {
        clearInterval(id);
        resolve();
      }
    }, interval);
  });
}

export function createLadder(app) {
  const { world, hud, voice, drone, capture } = app;
  let index = 0;
  let abort = false;
  let skipChapter = false;

  const t = () => app.strings();

  async function say(line) {
    if (abort || skipChapter) return;
    await voice.say(line);
  }

  async function lines(ch) {
    for (const line of ch.lines || []) {
      await say(line);
      if (abort || skipChapter) return;
    }
    hud.subtitle(null);
  }

  // ------------------------------------------------------------- capitoli
  const chapters = [
    // 1 — Il trucco che usi ogni giorno
    async (ch) => {
      world.setStage('cube');
      world.dragAccum = 0;
      await lines(ch);
      hud.action(ch.action);
      await waitFor(() => (world.dragAccum || 0) > 3.0 || skipChapter);
      hud.action(null);
    },

    // 2 — Un gradino sotto: la tela di un mondo piatto è un segmento
    async (ch) => {
      world.setStage('cube');
      world.objects = [];
      await lines(ch);
      hud.action(ch.action);
      const stop = hud.flatland('circle');
      const answer = await hud.choices(ch.options, { primaryFirst: false });
      stop();
      hud.action(null);
      // sbagliare è previsto: da dentro un mondo piatto non si può sapere
      await say(answer === 0 ? ch.right : ch.wrong);
      hud.subtitle(null);
    },

    // 3 — Un gradino sopra: il cubo dentro il cubo, e il rovesciamento
    async (ch) => {
      world.setStage('chapter3');
      world.dragAccumW = 0;
      app.setWMode(true);
      await lines(ch);
      hud.action(ch.action);
      hud.compass(true);
      await waitFor(() => (world.dragAccumW || 0) > Math.PI || skipChapter);
      hud.action(null);
    },

    // 4 — Ombra o fetta
    async (ch) => {
      world.setStage('chapter4');
      hud.modeBar(true);
      hud.modeHint(t().ui.modeHint);
      let toggles = 0;
      const off = world.on((type) => {
        if (type === 'slice') toggles++;
      });
      await lines(ch);
      hud.action(ch.action);
      await waitFor(() => toggles >= 2 || skipChapter);
      hud.action(null);
      hud.modeHint(null);
    },

    // 5 — Come si riconosce: contare gli spigoli di un vertice
    async (ch) => {
      world.setStage('chapter5');
      hud.compass(true);
      await lines(ch);
      hud.action(`${ch.action}`);
      app.enableVertexPicking(true);
      await waitFor(() => app.pickedVertex !== null || skipChapter);
      app.enableVertexPicking(false);
      if (!skipChapter) {
        hud.action(t().ui.howMany);
        let ok = false;
        while (!ok && !skipChapter) {
          const answer = await hud.choices(['3', '4', '5', '6'], { primaryFirst: false });
          ok = ['3', '4', '5', '6'][answer] === String(ch.answer);
          if (!ok) {
            hud.toast(t().ui.wrong);
            await say(ch.wrong);
            hud.subtitle(null);
          }
        }
      }
      hud.action(null);
    },

    // 6 — Adesso tocca a te. Momento wow: silenzio, nessun testo.
    async (ch) => {
      world.setStage('box');
      hud.controls(true);
      hud.compass(true);
      await lines(ch);
      hud.action(ch.action);

      let left = false;
      const watch = setInterval(() => {
        if (!left && Math.abs(world.player[3]) > 0.28) {
          left = true;
          runWowChoreography();
        }
      }, 80);

      await waitFor(() => world.puzzles.box?.state.solved || skipChapter);
      clearInterval(watch);
      hud.action(null);
      await capture.offerClip();
    },

    // 7 — Quello che nemmeno tu puoi fare. Nessuna azione.
    async (ch) => {
      world.setStage('chapter7');
      hud.controls(false);
      await lines(ch);
      hud.action(null);
    },
  ];

  /**
   * Coreografia del primo passo in w (SPEC §6):
   *   0,0–0,9  la parete perde opacità, l'oscillazione si ferma, il bordone si spegne
   *   0,9–1,4  immobilità e silenzio assoluti, nessun testo
   *   1,4      bordone e oscillazione riprendono, ora dentro la stanza
   *   3,0      compare il sottotitolo
   */
  async function runWowChoreography() {
    const walls = world.objects.find((o) => o.role === 'walls');
    hud.silence(true);
    app.setWiggleSuspended(true);
    drone.hush(1.4);
    const t0 = performance.now();
    const fade = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      if (walls) walls.opacity = 0.9 - 0.62 * k;
      if (k < 1) requestAnimationFrame(fade);
    };
    fade();
    await wait(1400);
    app.setWiggleSuspended(false);
    await wait(1600);
    hud.silence(false);
    const ch = t().chapters[5];
    hud.action(ch.action);
  }

  return {
    get index() {
      return index;
    },
    get total() {
      return chapters.length;
    },
    skip() {
      skipChapter = true;
      voice.skip();
    },
    stop() {
      abort = true;
      voice.stop();
    },
    async run(from = 0) {
      abort = false;
      index = from;
      const strings = t();
      while (index < chapters.length && !abort) {
        skipChapter = false;
        const ch = strings.chapters[index];
        hud.chapter(index + 1, chapters.length, ch.title, strings.ui.chapter, strings.ui.of);
        await chapters[index](ch);
        if (abort) break;
        if (ch.done && !skipChapter) {
          await say(ch.done);
          hud.subtitle(null);
        }
        index++;
      }
      hud.chapter(null);
      hud.subtitle(null);
      hud.action(null);
      return !abort;
    },
  };
}
