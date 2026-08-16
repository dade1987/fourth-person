# CHANGELOG

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [1.0.0] — v1

Il perimetro è quello dichiarato in `SPEC.md` §11, e niente di più.

### Dentro

- **Cold open**: entro tre secondi un tesseratto di vetro che si rovescia e proietta
  un'ombra sul pavimento. Nessun menu, nessun testo. Poi una riga sola.
- **La Scala**, sette capitoli narrati in italiano e inglese, con `speechSynthesis`,
  sottotitoli attivi di default, e un'azione del giocatore alla fine di ognuno.
- **Renderer a tre stadi**: proiezione 4D→3D nello shader di vertice, frustum
  asimmetrico fuori asse (Kooima) per lo stadio 2, e per lo stadio 3 vetro con
  rifrazione che varia con `w`, aberrazione cromatica, specularità olografica che
  scorre contro il tilt, ombra dell'ombra con shadow map, nebbia, occlusione di
  contatto e dithering.
- **Proiezione e sezione** come due estremi di una sola finestra in `w` che si
  stringe: la transizione è continua, e ci si può fermare a metà.
- **Prospettiva accoppiata** al giroscopio, con passa-basso a 6 Hz, saturazione a 12°
  e passaggio di consegne con l'oscillazione autonoma (0,4–0,8 Hz, ±3–6°).
- **Controlli**: due stick, cursore in `w`, bottone modale `W` per i piani che
  contengono `w`, due dita in verticale, e la bussola a sei quadranti sempre a schermo.
- **Enigmi 1, 3 e 4**: la cassa sigillata, i due anelli, la mano specchiata.
- **Tesseratto, 16-cella e 24-cella** generati proceduralmente (in `math4d` ci sono
  tutti e sei i politopi regolari, 120-cella e 600-cella comprese, per i test).
- **Bordone** WebAudio la cui altezza segue la posizione in `w`.
- **Clip condivisibile** di sei secondi con filigrana, via `MediaRecorder` e Web Share.
- **PWA** installabile e funzionante offline.
- **Test verdi**: 42 controlli su matematica, invarianti fisici e percezione, più i
  test end-to-end su telefono simulato. Nessuna dipendenza a runtime.

### Fuori, e va scritto

120-cella e 600-cella nel gioco, gaussian splatting, face tracking con fotocamera,
enigmi 2, 5, 6 e 7, lingue oltre it/en, anaglifo, multiplayer, classifiche, account.

### Da fare prima di dichiarare il progetto scientifico

Gli esperimenti percettivi di `SPEC.md` §5.7 non sono ancora stati eseguiti. I criteri
sono dichiarati e codificati (`DEPTH_ORDERING_CRITERION`, `STABILITY_CRITERION`); i
risultati vanno in `FONTI.md`.

### Scostamenti dalla specifica

- `src/math4d/` contiene due file in più rispetto alla struttura di §10 — `knots.js` e
  `orbit.js` — per non mettere nodi e orbite dentro `collide.js`. La regola vera resta
  rispettata: nessun import dal rendering.
- Aggiunti `src/render/renderer.js` (l'orchestrazione dei tre stadi), `src/game/shapes.js`
  (geometria degli oggetti della stanza) e `src/ui/` (interfaccia, comandi, bussola).
