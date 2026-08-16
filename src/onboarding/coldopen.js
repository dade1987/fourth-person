// coldopen.js — prima di ogni cosa (SPEC §8.0).
//
// Chi apre il link deve vedere entro tre secondi qualcosa di impossibile: l'ombra
// dell'ombra che si contorce mentre l'oggetto si rovescia, in vetro, con la
// parallasse già viva. Poi, e solo poi, una riga sola.
//
// La meraviglia va messa come debito, non come premio.

export const COLD_OPEN_SECONDS = 3.2;

export function runColdOpen({ world, hud, t, seconds = COLD_OPEN_SECONDS }) {
  world.setStage('coldopen');
  hud.silence(true);
  hud.subtitle(null);
  hud.chapter(null);
  hud.controls(false);
  hud.compass(false);
  hud.modeBar(false);

  return new Promise((resolve) => {
    setTimeout(async () => {
      const choice = await hud.coldopen(t.coldopen.question, [t.coldopen.yes, t.coldopen.no]);
      resolve(choice === 0 ? 'ladder' : 'explore');
    }, seconds * 1000);
  });
}
