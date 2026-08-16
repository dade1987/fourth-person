# fourth-person — Specifica completa

> Documento unico, sostituisce ogni versione precedente. Va nel repository come `SPEC.md`
> e può essere consegnato integralmente a chi (o a cosa) costruirà il progetto.

---

## 0. La tesi

> **Non puoi vedere la quarta dimensione. Puoi riconoscerla.**

Questa frase viene prima del codice, prima della grafica e prima di ogni pitch. Il progetto non parla di geometria: parla dei **limiti della percezione**, e la geometria è il modo per farli toccare con mano. Se una funzionalità non serve a quella frase, non entra.

**Cos'è in pratica:** un gioco nel browser in cui abiti uno spazio a quattro dimensioni, si apre da un link sul telefono, non richiede occhiali né app, e ti porta dalla prospettiva del disegno fino alla quarta dimensione parlandoti in lingua semplice.

**Cosa non è:** un visualizzatore di tesseratti. Di quelli il mondo ne ha abbastanza.

---

## 1. Posizionamento

Giochi 4D esistono: *Miegakure* di Marc ten Bosch (in sviluppo da oltre quindici anni), *4D Toys* dello stesso autore, *4D Golf* di CodeParade su Steam dal 2024, *4D Miner*. Sul web, decine di visualizzatori.

Quello che manca:

1. **Gratuito, nel browser, mobile-first.** Un link, e ci sei.
2. **Nessun hardware.** Niente occhialini, niente visore, niente app.
3. **Una salita guidata per chi non sa nulla.** Tutti presuppongono che tu sia già curioso. Nessuno accompagna una persona qualunque su per la scala, un gradino alla volta, parlandole. **Qui il progetto si gioca tutto.**

---

## 2. Vincoli tecnici

- **Web.** Chrome su Android, telefono di fascia media di due anni fa, **60 fps**.
- **WebGL2**, Three.js o shader a mano. Geometria generata da codice, nessun asset esterno.
- **PWA installabile**: manifest, service worker, offline, schermo intero.
- Budget: ≤ 40k triangoli per frame, ≤ **2 MB** per il gioco base.
- Touch + giroscopio. Nessuna dipendenza da tastiera o mouse.
- HTTPS obbligatorio (PWA e sensori) → GitHub Pages, repository pubblico.

---

## 3. Architettura di rendering

Tre stadi. I primi due sono geometria; il terzo è percezione, ed è quello che quasi tutti saltano ottenendo un gioco corretto e illeggibile.

### 3.1 Stadio 1 — dal mondo 4D alla retina 3D

Camera con posizione `C ∈ ℝ⁴` e orientamento `R ∈ SO(4)`:

```
p = Rᵀ (v − C)
q = ( f·p.x/p.w , f·p.y/p.w , f·p.z/p.w )
```

Il risultato **è un volume tridimensionale**: la retina di un'entità 4D è solida, come la nostra è una superficie. Near-clipping su `p.w`.

**Due modalità commutabili:**
- **Proiezione** — tutto il volume-retina insieme, celle lontane in `w` rimpicciolite e smorzate.
- **Sezione** — solo la fetta `w = w₀`, scena 3D nitida, `w₀` su slider.

Il confronto fra le due è il contenuto didattico centrale.

### 3.2 Stadio 2 — dal volume allo schermo

Proiezione prospettica ordinaria. È la perdita inevitabile: **dichiarala nell'interfaccia**.

### 3.3 Stadio 3 — far sentire solido il volume-ombra

#### (a) Prospettiva accoppiata alla testa — il pezzo forte

*Fish-tank VR*, resa famosa da Johnny Lee nel 2007; oggi replicata col face-tracking (`algomystic/TheParallaxView`). Lo schermo smette di essere un'immagine e diventa **una finestra fissa nel mondo**, dietro la quale l'occhio si muove.

**Il dettaglio che quasi tutti sbagliano:** non basta ruotare la camera. Serve un **frustum asimmetrico fuori asse** ancorato agli angoli fisici dello schermo. Con l'occhio in `E = (ex, ey, ez)` rispetto al centro schermo, semilarghezza `w`, semialtezza `h`, piano vicino `n`:

```
left   = (−w − ex) · n / ez      right = ( w − ex) · n / ez
bottom = (−h − ey) · n / ez      top   = ( h − ey) · n / ez
```

più una **traslazione pura** della vista di `−E`, **senza rotazione**. Riferimento canonico: *generalized perspective projection* di Kooima. Chi ruota la camera ottiene un effetto molliccio, e si riconosce subito.

**Stima di `E` dal giroscopio.** Il sensore dà l'orientamento del dispositivo, non la posizione della testa. Assumi la testa ferma nel mondo: nel sistema dello schermo è l'occhio a spostarsi. Con distanza di visione `d ≈ 35 cm`:

```
ex ≈  d · sin(gamma)
ey ≈ −d · sin(beta − beta₀)        // beta₀ calibrato all'avvio
ez ≈  d · cos(gamma) · cos(beta − beta₀)
```

Passa-basso ~6 Hz, saturazione ±12°, ritorno elastico al centro.

#### (b) Il vetro — la terza via fra fili e solido opaco

**Risolve un problema aperto.** Il reticolo di fili è onesto ma illeggibile e con profondità ambigua; il solido opaco è leggibile ma la cella esterna nasconde le altre sette. La terza via è **renderizzare le celle come vetro**: rifrazione, aberrazione cromatica sui bordi, specularità.

Funziona perché il vetro dà **superfici non ambigue** — riflesso e rifrazione hanno un verso univoco, quindi la profondità non si ribalta — **e insieme lascia vedere attraverso**. Le otto celle si distinguono tutte, ognuna con il proprio indice di rifrazione modulato dalla distanza in `w`.

Da studiare: `ybouane/liquidglass` e `naughtyduk/liquidGL`, le librerie di *liquid glass* per il web che hanno fatto il giro nel 2025-26 (rifrazione, blur, aberrazione cromatica, illuminazione, in shader WebGL). **Questa è probabilmente la repo che avevi visto**, e applicata a un politopo 4D è esattamente ciò che serviva.

Attenzione a una cosa: la rifrazione deve **variare con `w`**, non essere uniforme. Altrimenti è bello e non dice niente. Celle vicine in `w` = vetro più denso e più colorato; celle lontane = quasi aria.

#### (c) Specularità che scorre con l'inclinazione

`simeydotme/pokemon-cards-css`: l'effetto olografico funziona perché il riflesso si muove **in direzione opposta** al tilt con gradiente non lineare, e il cervello lo legge come oggetto fisico sotto luce reale. Applicalo alle celle, con intensità proporzionale alla vicinanza in `w`: così indizio di luce e indizio di quarta dimensione lavorano insieme.

#### (d) L'ombra dell'ombra — la firma visiva

Il tesseratto proiettato in 3D **sta nella stanza** e proietta a sua volta **un'ombra sul pavimento**. Ombra di un'ombra, in un solo colpo d'occhio. Ruotando in 4D il volume si rovescia *e* la macchia si contorce: due gradini della scala nello stesso fotogramma. Shadow map ordinaria — l'ombra è vera.

**È il frame del README, della GIF e del trailer.**

#### (e) Ancoraggi a costo zero

Occlusione di contatto, nebbia, gradienti dithered contro il banding OLED, bagliore soffuso solo su ciò che sta a `w ≠ 0`, accumulazione temporale su 2–3 fotogrammi. **Niente profondità di campo** durante il movimento: sfoca proprio gli indizi che stiamo dando.

#### (f) Parallasse su depth map, e splatting

`akella/fake3d` (parallasse su mappa di profondità): usala per sfondi, HUD a strati e per il pannello "cosa vedono loro" — **non** per la geometria principale, che è già 3D vera.

**Gaussian splatting** (`sparkjsdev/spark`, `mkkellogg/GaussianSplats3D`, `antimatter15/splat`): permette di rendere la stanza degli abitanti come **cattura fotorealistica di una stanza vera**. Il contrasto fra un ambiente indiscutibilmente reale e un oggetto impossibile che ci entra dentro è il moltiplicatore di stupore più forte disponibile. **Ma i file splat pesano decine di MB** e sfondano il budget: ammesso solo come **scena vetrina singola, caricata a richiesta**, mai nel percorso principale.

---

## 4. Fisica e geometria obbligatorie

Non decorazioni: ognuna è verificata dai test del §12.

**4.1 Rotazioni: piani, non assi.** In 4D **non esiste un asse di rotazione**. `SO(4)` ha dimensione 6, generata dai piani `xy, xz, xw, yz, yw, zw`. Rotazione nel piano `(i,j)`: identità tranne `M[i][i]=M[j][j]=cos θ`, `M[i][j]=−sin θ`, `M[j][i]=+sin θ`.

**4.2 Rotazioni doppie e isocline.** Due piani completamente ortogonali ruotano simultaneamente con angoli indipendenti: `R = R_xy(α)·R_zw(β)`. Se `|α|=|β|` è *isoclina* e non ha punti fissi oltre l'origine. Un corpo libero deve mostrare **due velocità angolari distinte**.

**4.3 Momento angolare come bivettore.** Matrice antisimmetrica 4×4 → **6 componenti**, non 3. Tensore d'inerzia generalizzato.

**4.4 Gradi di libertà.** `SE(4)`: **10** — 4 di traslazione, 6 di rotazione. I controlli li devono dare tutti.

**4.5 Niente prodotto vettoriale.** Esiste solo in 3 e 7 dimensioni. Normale a un iperpiano da **tre** vettori: `n = ⋆(a ∧ b ∧ c)`, componente `i` = `(−1)^i · det` del minore 3×3 senza la colonna `i`.

**4.6 Il bordo di un solido è un volume.** Frontiera fatta di **celle 3D**. Occlusione = rimozione di celle: scarta se `n · (camera − centro_cella) ≤ 0`.

**4.7 Caduta cubica.** Area della 3-sfera `= 2π²r³` → luce, gravità ed elettrostatica vanno come **1/r³**. Conseguenza da mostrare (Ehrenfest 1917): **nessuna orbita circolare stabile**. Metti un pianeta in orbita e falla vedere fallire.

**4.8 Misure.** Ipercubo di lato `s`: `s⁴`. 4-palla: `π²r⁴/2`.

**4.9 I nodi si sciolgono.** Una curva chiusa **non può essere annodata in ℝ⁴**; due cerchi concatenati **si separano**. Oggetti fisici veri, manipolabili.

**4.10 "Chiuso" non significa niente.** In ℝ⁴ solo un'ipersuperficie chiusa separa lo spazio: un guscio sferico **non racchiude nulla**. Le casseforti 3D sono banalmente violabili; solo i contenitori **ipersferici** tengono.

**4.11 Chiralità.** 180° in un piano contenente `w` riporta l'oggetto **specchiato**, e nessuna rotazione interna alla fetta lo annulla.

**4.12 Politopi regolari.** In 4D **esattamente sei**: 5-cella, tesseratto, 16-cella, 24-cella, 120-cella, 600-cella. Tutti generati proceduralmente. La **24-cella non ha alcun analogo tridimensionale**: esiste in quattro dimensioni e in nessun'altra. Usala come pezzo finale, non come voce di elenco.

---

## 5. Profondità senza occhiali

**5.1 Perché niente anaglifo.** Si mangia i canali cromatici, e il colore codifica la profondità in `w`: pagheremmo la terza dimensione con la leggibilità della quarta. Inoltre circa una persona su dieci non fonde le coppie stereo. La parallasse di movimento funziona per tutti, **anche con un occhio solo**. Resta come interruttore opzionale nelle impostazioni, fuori da onboarding e README.

**5.2 Il fenomeno.** *Effetto cinetico di profondità* (Wallach & O'Connell, 1953): la proiezione piatta di un oggetto in movimento genera percezione di volume immediata, senza due occhi.

**5.3 L'ambiguità, e come si elimina.** **Punto critico.** La parallasse *da sola* è ambigua nel segno: un reticolo di fili che oscilla si ribalta da solo — è il cubo di Necker. Si disambigua con indizi a verso univoco:

| Indizio | Obbligatorio |
|---|---|
| **Occlusione** (solido o vetro, mai fili) | **sì** |
| **Prospettiva** (mai ortografica) | **sì** |
| **Ombreggiatura** con luce fissa | **sì** |
| **Prospettiva accoppiata** (§3.3a) | **sì** |
| **Rifrazione del vetro** (§3.3b) | **sì** |
| Nebbia, ombre portate | sì |

**Regola operativa:** l'oscillazione si accende **solo** su geometria solida o vetro, in prospettiva. Sui fili va disattivata o segnalata come ambigua.

**5.4 Parametri dell'oscillazione autonoma.** Moto **sinusoidale continuo**, non alternanza fra due fotogrammi. Ampiezza ±3°…±6°, frequenza **0,4–0,8 Hz**, pivot sul centro di interesse. Tutto regolabile dall'utente, con memoria.

**5.5 Ibrido col giroscopio.** La parallasse **generata da te** è superiore a quella subita (il cervello riceve anche la copia efferente del comando motorio). Dispositivo in movimento → prospettiva accoppiata, oscillazione spenta. Fermo da oltre 2 s → l'oscillazione riparte dolcemente. Transizione morbida, mai a scatto.

**5.6 Accessibilità e sicurezza.** `prefers-reduced-motion` → oscillazione spenta all'avvio senza chiedere, compensando con nebbia, ombre e gradienti. **Niente che lampeggi più di 3 volte al secondo** (WCAG). Interruttore "riduci il movimento" a due tocchi. **Nessun enigma può dipendere dal solo movimento.**

**5.7 Come si verifica.** *Esperimento di ordinamento in profondità*: due oggetti a profondità diverse, si chiede quale sia più vicino, in quattro condizioni — statico / oscillazione / prospettiva accoppiata / anaglifo. 20 prove per condizione, 10 persone. **Criterio dichiarato prima: la 2 batte la 1 di almeno 15 punti percentuali, la 3 batte la 2.**
*Stabilità percettiva*: si preme un tasto a ogni ribaltamento percepito; con solido o vetro devono essere **prossimi a zero** in 60 s. Se non lo sono, mancano indizi: torna alla tabella 5.3.
Risultati, parametri finali, data e numero di partecipanti in `FONTI.md`. **Un progetto che si dichiara scientifico e non misura non lo è.**

---

## 6. Regia del movimento e suono

**Movimento.** Mai `linear`; interfaccia `cubic-bezier(0.32,0.72,0,1)` 180–320 ms, movimenti spaziali 600–1200 ms. Ingressi sfalsati di 40 ms. **Transizioni continue, mai tagli** — da proiezione a sezione l'oggetto si trasforma: il legame fra le due viste *è* il contenuto. La rotazione 4D si trascina col dito: potersi fermare a metà del rovesciamento è la differenza fra guardare e capire. **Niente particelle.**

**Suono — obbligatorio, ed è la ragione per cui il silenzio funziona.** Un **bordone grave la cui altezza segue la tua posizione in `w`**: sali in `w`, il tono sale. Costa un oscillatore WebAudio e trasforma la quarta direzione da numero letto a cosa sentita. Più un materico appena percepibile sulle collisioni. Nient'altro: niente musica, niente jingle. Il silenzio nei momenti forti ha senso **solo** se c'è qualcosa che si interrompe.

**Coreografia dei tre momenti**

*Primo passo in `w`*: `0,0 s` slider · `0,0–0,9 s` la parete perde opacità, l'oscillazione si ferma, **il bordone si spegne** · `0,9–1,4 s` immobilità e silenzio assoluti, **nessun testo** · `1,4 s` bordone e oscillazione riprendono, ora dentro la stanza · `3,0 s` compare il sottotitolo.

*Ritorno specchiato*: rotazione di 180° in `xw` mostrata per intero e lenta (1,8 s), mai tagliata. Poi confronto affiancato con la forma originale, e lasciare che sia il giocatore ad accorgersene. **Nessuna scritta "SPECCHIATO!"**

*Nodo che si scioglie*: rallentatore al 40% nel passaggio critico. È l'unica volta in tutto il gioco in cui si manipola il tempo: per questo funziona.

**Budget.** 60 fps su fascia media. Se un effetto scende sotto i 55, **salta l'effetto**, non la risoluzione. Un'animazione a scatti è peggio di nessuna animazione, e qui doppiamente.

---

## 7. Controlli

Dieci gradi di libertà su un vetro.

- **Stick sinistro** — traslazione in `x`, `z`.
- **Stick destro** — rotazione nei piani `xz`, `yz`.
- **Slider o due dita in verticale** — traslazione in `w`, valore sempre visibile.
- **Bottone modale `W`** — commuta lo stick destro sui piani con `w` (`xw`, `yw`, `zw`). Cambia colore in modo evidente: è il momento in cui smetti di essere tridimensionale.
- **Giroscopio** — prospettiva accoppiata, sempre attiva quando disponibile.
- **Bussola a sei quadranti** sempre a schermo. **Senza, il giocatore si perde in trenta secondi: è il pezzo di interfaccia più importante del progetto.**

---

## 8. Apertura e Scala

### 8.0 Cold open — prima di ogni cosa

Chi apre il link deve vedere **entro tre secondi qualcosa di impossibile**, prima di qualunque menu, testo o spiegazione: l'ombra dell'ombra che si contorce mentre l'oggetto si rovescia, in vetro, con la parallasse già viva sull'inclinazione del telefono.

Poi, e solo poi, una riga: **"vuoi capire cosa hai appena visto?"**

La meraviglia va messa come **debito, non come premio**. Un onboarding che comincia da un disegno in prospettiva perde il giocatore prima del secondo capitolo.

### 8.1 La Scala — introduzione narrata multilingue

Non un tutorial dei comandi: un percorso che **rifà la strada del capire**.

**Principio guida:** ogni capitolo si chiude con un'azione che il giocatore compie di persona. Non "guarda cosa succede": **fallo tu**. Nessun capitolo avanza da solo.

Registro colloquiale, frasi corte, zero gergo. **Vietate** le parole *politopo, iperpiano, varietà, ortogonale, isomorfismo*. Se un concetto non si può dire alla cassa del supermercato, va riscritto.

**1 — Il trucco che usi ogni giorno** *(~50 s)* — prospettiva, parallele che si chiudono, punto di fuga. *Azione:* trascinare un cubo e guardare le facce deformarsi.

**2 — Un gradino sotto** *(~60 s)* — il mondo piatto, la cui tela è un segmento. *Azione:* vedere **solo** la striscia 1-D e indovinare la forma. Sbaglierà. È previsto.

**3 — Un gradino sopra** *(~50 s)* — compare il cubo dentro il cubo. *Azione:* ruotarlo col dito finché si rovescia. Si introduce l'oscillazione con una frase sola: *"Muovilo. Ti serve a capire cosa sta davanti a cosa, ed è esattamente quello che fai muovendo la testa."*

**4 — Ombra o fetta** *(~60 s)* — i due modi in cui una cosa grande si affaccia in un mondo piccolo. *Azione:* commutare fra proiezione e sezione finché la differenza è ovvia.

**5 — Come si riconosce, visto che non si vede** *(~70 s)* — il capitolo onesto: la quarta dimensione arriva come regola infranta. Otto cubi, quattro spigoli per vertice, il rovesciamento impossibile. *Azione:* toccare un vertice e **contare** gli spigoli; il gioco chiede il numero e aspetta.

**6 — Adesso tocca a te** *(~50 s)* — il giocatore riceve la `w`; qui si propone il giroscopio. *Azione:* recuperare un oggetto da una cassa sigillata. **Momento wow principale: silenzio, nessun testo.**

**7 — Quello che nemmeno tu puoi fare** *(~60 s)* — il limite: anche da quassù vedi una proiezione, e per *cambiare* un blocco 4D servirebbe un tempo esterno che non esiste. La scala continua sopra di te. *Nessuna azione.*

**Voce e lingue.** `speechSynthesis` del browser: zero asset, decine di lingue, offline. Fallback a sottotitoli grandi + audio registrato scaricabile. **Sottotitoli attivi di default.** Lingue al lancio: it, en, es, fr, de, pt. Tutte le stringhe in `src/i18n/*.json`. `CONTRIBUTING.md` deve spiegare come aggiungere una lingua copiando **un solo file**: è il contributo esterno più probabile. Pausa, ripeti, salta, e Scala rivedibile dal menu.

---

## 9. Mondo, enigmi e condivisione

Abitanti tridimensionali confinati alla fetta `w = 0`, ed enigmi risolvibili **solo** con la quarta dimensione:

1. Recuperare un oggetto da una cassa 3D sigillata.
2. Sciogliere un nodo dimostrabilmente impossibile da sciogliere in 3D.
3. Separare due anelli concatenati.
4. **Trasformare una mano sinistra in una destra** per una serratura specchiata.
5. Attraversare un labirinto con vicoli ciechi solo in 3D.
6. Osservare un'orbita 1/r³ collassare, e stabilizzarla vincolandola a una fetta.
7. Muoversi dentro una 24-cella usata come architettura.

**Perché una mano e non un'elica.** Specchiare un'elica è astratto. Una **mano** no: il giocatore ha la propria accanto allo schermo, la gira per farla combaciare e non ci riesce. Vale dieci eliche, ed è l'immagine che si ricorda.

### 9.1 Il clip condivisibile — obbligatorio

Dopo ogni momento wow il gioco **registra da solo un clip di 6 secondi** (`MediaRecorder` sul canvas, filigrana con l'URL) e lo offre con la **Web Share API**, un tocco.

Non è marketing: **un "wow" che non si può far vedere a un amico muore nella stanza in cui è successo.** È anche l'unico motore di diffusione che funziona davvero — nessuna quantità di post sostituisce una persona che gira il telefono verso un'altra.

---

## 10. Struttura del repository

```
fourth-person/
├── README.md · SPEC.md · FONTI.md · CONTRIBUTING.md · CHANGELOG.md
├── LICENSE (MIT, codice) · LICENSE-CONTENT (CC BY 4.0, testi e contenuti)
├── index.html · manifest.webmanifest · sw.js
├── src/
│   ├── math4d/          # ZERO dipendenze dal rendering, testabile in Node
│   │   rotor.js · bivector.js · wedge.js · polytope.js · rigidbody.js · collide.js
│   ├── render/
│   │   project.js · headcoupled.js · glass.js · wiggle.js · shadow.js · holo.js · slice.js
│   ├── audio/ drone.js
│   ├── capture/ clip.js        # registrazione e condivisione dei 6 secondi
│   ├── game/ world.js · npc.js · puzzles/
│   ├── onboarding/ coldopen.js · chapters.js · voice.js
│   └── i18n/ it.json en.json es.json fr.json de.json pt.json
├── test/ math4d.spec.js · invariants.spec.js · perception.spec.js · e2e.spec.js
├── .github/workflows/ test.yml · deploy.yml
└── press/ presskit.html · screenshots/ · trailer.mp4
```

**Regola non negoziabile:** `src/math4d/` non importa nulla dal rendering ed è testabile in Node senza browser.

---

## 11. Perimetro della v1

**Dentro:** cold open · Scala completa in it/en · enigmi 1, 3, 4 · tesseratto, 16-cella, 24-cella · proiezione e sezione · prospettiva accoppiata + oscillazione · vetro · ombra dell'ombra · bordone · clip condivisibile · PWA offline · test matematici verdi.

**Fuori dalla v1, e va scritto:** 120-cella e 600-cella · gaussian splatting · face tracking con fotocamera · enigmi 2, 5, 6, 7 · lingue oltre it/en · anaglifo · multiplayer di qualunque tipo · classifiche · account.

Le specifiche ambiziose muoiono tutte allo stesso modo: crescendo. **Questa lista serve a poter dire di no.**

---

## 12. Test e validazione

Il rischio non è il crash: è avere qualcosa che **sembra giusto e non lo è**.

**Matematica.** `RᵀR = I` a 1e-12 e `det R = +1` · rotazione doppia con due velocità distinte, misurate · isoclina senza punti fissi · momento angolare conservato su 10 000 passi, deriva < 0,1% · prodotto cuneo ortogonale ai tre vettori · conteggi dei sei politopi contro i valori noti (tesseratto 16/32/24/8, 24-cella 24/96/96/24, 600-cella 120/720/1200/600) · ogni vertice del tesseratto ha **grado 4** · ognuna delle 8 celle è un cubo · intensità a distanza doppia = **1/8** · orbita 1/r³ perturbata che non ritorna · oggetto chirale dopo 180° in `xw` con orientamento invertito e nessuna delle 1000 rotazioni casuali che lo ripristina · trifoglio slegabile con cammino continuo senza autointersezioni.

**Percezione.** I due esperimenti del §5.7, con criteri dichiarati prima. Verifica che con `prefers-reduced-motion` ogni enigma resti risolvibile.

**End-to-end (Playwright).** Primo frame < 3 s con CPU rallentata 4× · onboarding percorribile · un enigma risolvibile via input simulato · funziona offline · il frustum accoppiato produce parallasse orizzontale **e** verticale coerenti con l'inclinazione simulata · il clip condivisibile viene generato ed è riproducibile.

**CI.** GitHub Actions, test a ogni push, deploy su Pages solo se passano, badge nel README.

---

## 13. README

Vetrina, non manuale.

1. **Una GIF nei primi 400 pixel** — l'ombra dell'ombra mentre l'oggetto si rovescia.
2. Una frase sola: *"Non puoi vedere la quarta dimensione. Puoi riconoscerla."*
3. **Il link per giocare**, grande, sopra tutto.
4. *"Nessun occhiale, nessuna app, nessun permesso. Apri il link e inclina il telefono."*
5. Cosa lo distingue, incluso il fatto che ti insegna.
6. Le proprietà matematiche implementate, con rimando a `FONTI.md`.
7. Come girarlo in locale, tre righe.
8. Come contribuire, con "aggiungere una lingua" in evidenza.
9. Licenze, crediti, e **ringraziamenti espliciti a Miegakure, 4D Toys, 4D Golf**.

---

## 14. Divulgazione

Da attivare **solo a gioco funzionante**: una specifica chiede di immaginare, e nessuno lo farà.

Il pubblico italiano ha due profili opposti e servono due approcci.

**Formato breve e visivo** (per esempio Quantum Girl / Virginia Benzi, che lavora sul verticale per chi credeva di odiare la fisica): serve **un momento da quindici secondi con una reazione visibile** — il muro che sparisce, o la mano specchiata. Si manda un link e un video verticale. Nient'altro, nessun allegato.

**Formato didattico lungo** (per esempio Scuola Sisini): interessa la sostanza — il momento angolare a sei componenti, la caduta 1/r³, le orbite che non stanno in piedi. Si manda la specifica e i test degli invarianti, perché ci si può costruire una lezione.

**La regola che vale per tutti: non chiedere "me lo condividi?" — chiedi la voce.** La Scala va narrata: proporre di prestare la propria voce ai sette capitoli costa venti minuti di registrazione e rende coautori di una cosa gratuita, aperta e didattica. È un'offerta, non una richiesta, ed è una conversazione completamente diversa.

---

## 15. Pubblicazione

- **GitHub Pages** da `main`, repository **pubblico** (serve HTTPS gratuito: senza, niente PWA né sensori).
- **Landing** in `/press/`: GIF, pulsante Gioca, tre righe, presskit. Open Graph e Twitter Card curate: la maggior parte delle visite arriva da un'anteprima in chat.
- **itch.io** con lo stesso build.
- Annuncio a cose finite: `r/math`, `r/gamedev`, `r/webgl`, Show HN, Mastodon `#creativecoding`. Un post onesto che dice cosa fa **e cosa non fa**.
- **Nessuna telemetria.**

---

## 16. FONTI.md

- E. A. Abbott, *Flatland*, 1884 (pubblico dominio) · L. Schläfli, politopi regolari in n dimensioni · H. S. M. Coxeter, *Regular Polytopes*, 1948.
- P. Ehrenfest, *In what way does it become manifest that space has three dimensions?*, 1917.
- M. ten Bosch, *N-Dimensional Rigid Body Dynamics*, SIGGRAPH 2020.
- H. Wallach, D. N. O'Connell, *The kinetic depth effect*, 1953.
- R. Kooima, *Generalized Perspective Projection*, 2008 · J. C. Lee, *Head Tracking for Desktop VR Displays using the Wii Remote*, 2007.
- T. Banchoff, *Beyond the Third Dimension*, 1990 · R. Rucker, *The Fourth Dimension*, 1984 · C. H. Hinton, *What is the Fourth Dimension?*, 1884 · M. Tegmark, *On the dimensionality of spacetime*, 1997.
- WCAG 2.2, soglie di lampeggio.
- Repository di riferimento per lo Stadio 3: `algomystic/TheParallaxView` · `ybouane/liquidglass` · `naughtyduk/liquidGL` · `simeydotme/pokemon-cards-css` · `akella/fake3d` · `sparkjsdev/spark`.

---

## 17. Ordine dei lavori

**Passo 0 — lo spike, due giorni, prima di ogni altra cosa.**
Un file HTML solo: tesseratto in vetro, frustum accoppiato al giroscopio, ombra sul pavimento. Nient'altro — niente enigmi, niente menu, niente Scala.
**Criterio di morte, dichiarato adesso: se inclinando il telefono non senti il volume, il progetto cambia forma o si ferma.** Meglio scoprirlo in due giorni che in due mesi.

1. `src/math4d/` con i test verdi. **Nessun pixel finché la matematica non passa.**
2. Renderer: doppia proiezione + modalità sezione.
3. Stadio 3 completo: vetro, frustum accoppiato, oscillazione, ombra dell'ombra.
4. Cold open e clip condivisibile. Presto: sono il motore di diffusione.
5. Controlli touch e bussola a sei quadranti.
6. Primo enigma: la cassa sigillata.
7. La Scala in italiano e inglese, col bordone.
8. Enigmi della mano e degli anelli.
9. PWA, offline, 60 fps su Android.
10. README, presskit, landing. Poi i divulgatori.

**Se il tempo finisce a metà, fermati al punto 7 e pubblica.** La Scala più un enigma è già un progetto compiuto. Venti enigmi senza la Scala non lo sono.

---

## 18. Cosa NON fare

- Non consegnare un tesseratto che ruota: è un oggetto guardato da fuori, non uno spazio abitato.
- Non usare "rotazioni attorno a un asse": in 4D non esistono.
- Non ruotare la camera al posto di deformare il frustum.
- Non accendere l'oscillazione su geometria a fili.
- Non far partire il gioco da una spiegazione: **prima l'impossibile, poi la domanda**.
- Non lasciare che il wow resti dentro il telefono: registra e condividi.
- Non far dipendere nessun enigma dal solo movimento.
- Non mettere testo sullo schermo durante un momento wow.
- Non nascondere la doppia proiezione: è il concetto.
