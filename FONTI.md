# FONTI

Ogni proprietà implementata ha una fonte, e ogni fonte ha un test che la verifica.
La colonna *dove* rimanda al file; la colonna *test* al controllo che fallisce se
qualcuno rompe la proprietà.

## Geometria e politopi

| Fonte | Cosa ci abbiamo preso | Dove | Test |
|---|---|---|---|
| L. Schläfli, *Theorie der vielfachen Kontinuität* (1852) — politopi regolari in n dimensioni | In ℝ⁴ i politopi regolari sono esattamente sei | `src/math4d/polytope.js` | conteggi contro i valori noti, per tutti e sei |
| H. S. M. Coxeter, *Regular Polytopes* (1948) | Conteggi V/E/F/C, dualità 120-cella ↔ 600-cella, struttura delle celle | `src/math4d/polytope.js` | `math4d.spec.js` |
| E. A. Abbott, *Flatland* (1884, pubblico dominio) | Il capitolo 2: la tela di un mondo piatto è un segmento | `src/ui/hud.js` (`flatland`), `src/i18n/*` | — |
| C. H. Hinton, *What is the Fourth Dimension?* (1884) | L'idea che la quarta dimensione si *riconosca* per regole infrante | capitolo 5 della Scala | — |
| T. Banchoff, *Beyond the Third Dimension* (1990) | Ombra contro fetta: i due modi di affacciarsi | `src/render/slice.js` | — |
| R. Rucker, *The Fourth Dimension* (1984) | Enigmi: cassa sigillata, mano specchiata | `src/game/puzzles/` | `invariants.spec.js` |

## Fisica

| Fonte | Cosa ci abbiamo preso | Dove | Test |
|---|---|---|---|
| M. ten Bosch, *N-Dimensional Rigid Body Dynamics*, SIGGRAPH 2020 | Momento angolare come bivettore, inerzia generalizzata, `dL/dt = [L, Ω]` | `src/math4d/rigidbody.js` | momento conservato su 10 000 passi, deriva < 0,1% |
| P. Ehrenfest, *In what way does it become manifest that space has three dimensions?* (1917) | Area della 3-sfera `2π²r³` → caduta `1/r³` → nessuna orbita circolare stabile | `src/math4d/orbit.js` | l'orbita perturbata dell'1% non torna |
| M. Tegmark, *On the dimensionality of spacetime* (1997) | Il capitolo 7: perché servirebbe un tempo esterno | capitolo 7 della Scala | — |
| Teoria dei nodi (invariante di tricolorabilità; numero di incroci minimo di un nodo non banale = 3) | Il trifoglio si scioglie in ℝ⁴, e alla fine è davvero il nodo banale | `src/math4d/knots.js` | cammino senza auto-intersezioni; diagramma finale non tricolorabile |
| Integrale di Gauss per il numero di allacciamento | Due anelli concatenati si separano | `src/math4d/collide.js` | allacciamento da 1 a 0, senza contatti |

## Percezione

| Fonte | Cosa ci abbiamo preso | Dove | Test |
|---|---|---|---|
| H. Wallach, D. N. O'Connell, *The kinetic depth effect* (1953) | La parallasse di movimento dà volume anche con un occhio solo | `src/render/wiggle.js` | parametri dentro i limiti, moto sinusoidale continuo |
| Cubo di Necker / ambiguità della parallasse | La parallasse **da sola** è ambigua nel segno: serve occlusione, prospettiva, ombreggiatura, rifrazione | `wiggleAllowed`, `cueCheck` | l'oscillazione non si accende sui fili né in ortografica |
| R. Kooima, *Generalized Perspective Projection* (2008) | Frustum asimmetrico fuori asse ancorato agli angoli fisici dello schermo, più traslazione pura di −E | `src/render/headcoupled.js` | la vista non ruota mai; parallasse orizzontale **e** verticale |
| J. C. Lee, *Head Tracking for Desktop VR Displays using the Wii Remote* (2007) | L'idea del *fish-tank VR*: lo schermo come finestra ferma | `src/render/headcoupled.js` | — |
| WCAG 2.2, soglie di lampeggio | Niente che lampeggi più di tre volte al secondo | `MAX_FLASHES_PER_SECOND` | `perception.spec.js` |
| `prefers-reduced-motion` | Oscillazione spenta all'avvio senza chiedere; nessun enigma dipende dal movimento | `src/main.js`, `src/game/puzzles/` | ogni enigma resta risolvibile |

## Riferimenti di rendering per lo Stadio 3

Studiati per il vetro, l'olografia e la parallasse; nessuna riga di codice presa,
nessuna dipendenza aggiunta — il progetto non ha librerie esterne.

- `algomystic/TheParallaxView` — prospettiva accoppiata con face tracking.
- `ybouane/liquidglass`, `naughtyduk/liquidGL` — rifrazione, blur e aberrazione cromatica in shader.
- `simeydotme/pokemon-cards-css` — la specularità che scorre **contro** il tilt, con gradiente non lineare.
- `akella/fake3d` — parallasse su mappa di profondità (per sfondi e HUD, mai per la geometria principale).
- `sparkjsdev/spark`, `mkkellogg/GaussianSplats3D`, `antimatter15/splat` — gaussian splatting, fuori dalla v1 per via del peso dei file.

---

## Gli esperimenti percettivi (SPEC §5.7)

**I criteri sono dichiarati prima di misurare, e stanno nel codice**
(`DEPTH_ORDERING_CRITERION` e `STABILITY_CRITERION` in `src/render/wiggle.js`), così
non possono essere aggiustati dopo aver visto i dati.

**Esperimento 1 — ordinamento in profondità.** Due oggetti a profondità diverse, si
chiede quale sia più vicino. Quattro condizioni: statico / oscillazione / prospettiva
accoppiata / anaglifo. 20 prove per condizione, 10 persone.
*Criterio: l'oscillazione batte lo statico di almeno 15 punti percentuali, e la
prospettiva accoppiata batte l'oscillazione.*

**Esperimento 2 — stabilità percettiva.** Si preme un tasto a ogni ribaltamento
percepito; con geometria solida o vetro i ribaltamenti devono essere prossimi a zero
in 60 secondi. *Criterio: al più un ribaltamento al minuto.* Se non lo sono, mancano
indizi: si torna alla tabella §5.3 della specifica.

### Risultati

> **Non ancora misurati.** Data, numero di partecipanti, risultati per condizione e
> parametri finali dell'oscillazione vanno scritti qui appena la raccolta è fatta.
> Finché questa riga è qui, il progetto sulla percezione ha un'ipotesi, non una prova —
> e va detto così. Un progetto che si dichiara scientifico e non misura non lo è.

| Data | Partecipanti | Statico | Oscillazione | Prospettiva accoppiata | Anaglifo | Esito |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |
