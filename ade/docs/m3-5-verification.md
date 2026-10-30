# Verifica M3.5 — 30 ottobre 2026

Stati e transizioni delle risorse nell'[esploratore semantico](semantic-explorer.md), sulla branch `feat/roadmap-next`, dopo M3.4 (`007d3ee1`). Ambiente Linux x64, Node 24.22.1, Electron 43.8.3 e Xvfb. La milestone M3 rimane in corso.

## Capacità disponibili

La creazione nativa di un diagramma di stato sceglie una risorsa esistente o ne crea una nuova insieme alla vista in una sola operazione annullabile. Aggiunta di stati, riuso di stati/transizioni e inclusione del ciclo di vita mantengono identità, contenimento e coordinate già presenti. Le nuove transizioni nelle viste di stato richiedono endpoint della stessa risorsa effettiva; sono supportate auto-transizioni. Eventi, guardie testuali, errori e contratti sono condivisi fra viste. Il canvas conserva insieme evento, condizione ed errore nelle etichette.

Riepilogo per risorsa e tabella con endpoint selezionabili affiancano il grafo e il lettore accessibile. Rimuovere dalla sola vista uno stato o una relazione conserva la semantica e gli altri diagrammi. I documenti storici mantengono contesto e stati senza risorsa, segnalati senza normalizzazione. Il formato v3 non introduce campi: risorsa tramite `parentId`, evento tramite `name`, guardia tramite `condition`, errore tramite `errorCode`.

## Controlli automatici

- **48 test di dominio** negli otto file, eseguiti direttamente con Node. I cinque nuovi casi coprono inclusione idempotente del ciclo di vita, riuso degli endpoint, conservazione di layout e altre viste, creazione di stati/risorse, auto-transizioni, round-trip JSON, rigetto atomico di inserimenti non supportati o fuori risorsa, eventi/guardie condivisi, rimozione locale e documenti storici. Restano inclusi i test di regressione delle sequenze e delle operazioni visuali condivise. L'esempio v3 aggiornato supera la validazione.
- **39 test nativi**, compreso il controllo degli errori inattesi. I tre nuovi casi verificano undo fino al v2 originario, ripristino di diagramma/selezione dopo salvataggio, eventi condivisi con la vista storica, selezione riparata dopo rimozione locale, atomicità della creazione risorsa/vista e lettura accessibile con risorsa, eventi e contesto storico.
- Typecheck ADE, build client incrementale, ESLint mirato agli otto file TypeScript coinvolti, Stylelint del foglio ADE, sintassi dello smoke, parsing del workflow YAML e controllo delle differenze.

## Smoke Electron Linux

`--state-only` è superato senza Extension Development Host. Il percorso crea una vista per l'ordine, riusa una transizione e il ciclo di vita, crea uno stato e transizioni condizionate/autocollegate, modifica un evento e la sua guardia, dichiara un errore nel contratto della sorgente e lo associa a una transizione. Verifica tabella e selezione degli endpoint, lettura accessibile, modifica condivisa con il diagramma storico, spostamento da tastiera, undo/redo, salvataggio e ripristino dopo il riavvio. In finestra 800 × 800 rimuove uno stato dalla sola vista e lo reinserisce da tastiera; crea poi una risorsa con il suo diagramma e ne annulla atomicamente la creazione. La semantica e le altre viste restano conservate durante le rimozioni locali.

Schermate ispezionate: `.build/ade-smoke/state-diagram.png` e `state-transition-table.png` nella stessa directory.

```sh
xvfb-run -a node ade/scripts/smoke-desktop.mjs --state-only
```

Anche `--ux-only` è stato ripetuto con esito positivo: lettura/aiuto accessibili, condizioni di pagamento, aggiornamenti esterni e recupero da documento invalido, ripristino del focus, suggerimenti configurabili e scorciatoia personalizzata, tastiera, finestra stretta, quattro temi, contrasto del nodo selezionato, Fit Diagram, scorrimento, terminale e ripristino del contesto. La prova usa le viste storiche con il nuovo riepilogo di stato; la tabella dedicata è stata ispezionata nel tema del percorso `--state-only`.

I percorsi sono configurati in CI desktop per Linux e macOS; gli esiti qui riportati sono locali e non sostituiscono la CI remota.

Anche `--navigation-only` è stato ripetuto con esito positivo: ricerca, contratti M3.3, prospettive condivise, lettura accessibile, salvataggio/riavvio, cancellazione esterna, mappa, routing delle etichette e gruppi della sidebar M2 restano verificati sulla revisione M3.5.

## Limiti aperti

Il sottoinsieme rappresenta stati semplici per risorsa, eventi e guardie dichiarati, errori e auto-transizioni. Non deduce stati iniziali/finali, stati compositi, regioni parallele, entry/exit, temporizzazioni, causalità fra azioni e stati o risultati di esecuzione. I diagrammi possono affiancare risorse e contesto, ma le nuove transizioni devono restare all'interno di una risorsa.

macOS/VoiceOver, tastiera fisica, CI remota e prestazioni su grandi modelli restano da verificare. Il runtime Linux riusa SQLite compilato separatamente e Xvfb estratto in `/tmp`; gli header `x11`/`xkbfile` mancanti mantengono il fallback della mappatura tastiera. Il collaudo non certifica una toolchain nativa completa. I percorsi `--native-only` e `--sequence-only` non sono stati ripetuti in questa sessione; i relativi confini di verifica precedenti restano nei rispettivi verbali. Il prossimo incremento funzionale è M3.6, impatto nel modello dichiarato; analisi del codice e riconciliazione restano in M4–M6.
