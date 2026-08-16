# Contribuire

## Aggiungere una lingua — un file solo

È il contributo più utile che si possa fare, e serve toccare **un file**.

1. Copia `src/i18n/it.json` in `src/i18n/<codice>.json` (per esempio `es.json`).
2. Traduci i valori. **Non toccare le chiavi.**
3. Nel nuovo file metti `"code"` (il codice della lingua) e `"voice"` (il locale per la
   voce del browser, per esempio `es-ES`): serve a `speechSynthesis` per scegliere la
   pronuncia giusta.
4. Aggiungi il codice all'elenco delle lingue in `src/main.js` (cerca `for (const code of ['it', 'en'])`)
   e in `sw.js` (l'elenco `SHELL`, così funziona anche offline).
5. Apri una pull request. Non serve altro: niente build, niente dipendenze.

### Come si traduce, qui

Il registro è **colloquiale**: frasi corte, seconda persona singolare, zero gergo.
Sono **vietate** le parole *politopo, iperpiano, varietà, ortogonale, isomorfismo* e i
loro equivalenti nella tua lingua. La regola pratica: se un concetto non si può dire
alla cassa del supermercato, va riscritto.

Non tradurre alla lettera se la tua lingua vuole un'altra immagine. I capitoli devono
suonare come qualcuno che ti parla, non come un manuale tradotto.

## Prestare la voce

La Scala è fatta per essere letta ad alta voce. Il browser la legge da solo, ma una
voce vera è un'altra cosa: sono sette capitoli, circa venti minuti di registrazione.
Se ti va, apri una issue con la lingua e il capitolo che vuoi leggere.

## Codice

```sh
npm test          # matematica, invarianti, percezione. Nessuna dipendenza.
npm run serve     # http://localhost:8080
npm run test:e2e  # richiede Playwright
```

Tre regole non negoziabili, che valgono più di ogni preferenza di stile:

1. **`src/math4d/` non importa nulla dal rendering** ed è testabile in Node senza
   browser. Se una funzione ha bisogno del canvas, non sta lì.
2. **Nessuna dipendenza esterna a runtime.** Il gioco base sta sotto i 2 MB e la
   geometria è generata da codice: niente librerie, niente asset, niente CDN.
3. **Niente pixel finché la matematica non passa.** Una proprietà nuova arriva con il
   suo test, e il test cita la fonte in `FONTI.md`.

E tre regole percettive, che hanno la stessa forza:

- L'oscillazione si accende **solo** su geometria solida o vetro, e solo in prospettiva.
  Sui fili mai: sarebbe ambigua. Il cancello è `wiggleAllowed()`, e non si scavalca.
- La camera **non ruota** mai per simulare la testa: si deforma il frustum.
- **Nessun enigma può dipendere dal solo movimento**, e con `prefers-reduced-motion`
  deve restare risolvibile. C'è un test che lo controlla.

## Cosa non entra

La specifica (`SPEC.md`, §11) elenca cosa sta fuori dalla v1 — 120-cella, gaussian
splatting, face tracking, multiplayer, classifiche, account. Quell'elenco esiste per
poter dire di no: le specifiche ambiziose muoiono tutte allo stesso modo, crescendo.

Se una funzionalità non serve alla frase *"Non puoi vedere la quarta dimensione. Puoi
riconoscerla."*, non entra.

## Licenze

Contribuendo accetti che il codice esca con licenza MIT e i contenuti (testi,
traduzioni) con CC BY 4.0.
