# Verifica M3.6 — 30 ottobre 2026

Impatto sul modello ed evidenze registrate nell'[esploratore semantico](semantic-explorer.md), sulla branch `feat/roadmap-next`, dopo M3.5 (`64fe70ca`). Ambiente Linux x64, Node 24.22.1, Electron 43.8.3 e Xvfb. Il percorso funzionale M3.1–M3.6 è implementato; la chiusura delle verifiche di piattaforma resta distinta.

## Capacità disponibili

Change Impact parte dall'identità selezionata e dai discendenti per contenimento, poi risale relazioni dirette e riferimenti di autorizzazione. Per ciascun possibile dipendente conserva una distanza minima e un riferimento rappresentativo; cicli e percorsi equivalenti non duplicano le identità. Antenati e proprietari sono contesto separato. Diagrammi e relazioni da rivedere conservano collegamenti semantici a elementi e viste. I riferimenti non classificati sono segnalati e consultabili, senza propagazione.

Recorded Evidence mantiene mappature, file/simboli/revisioni, tutti gli esiti e i riferimenti alle evidenze presenti nel documento. Mostra conteggi per esito, criteri senza record e criteri con esiti diversi. L'ordine dei record non stabilisce recenza e nessun esito certifica implementazione corrente o freschezza. Il report non legge il codice né esegue test. Gli esempi di prodotto restano privi di evidenze inventate; il [percorso di revisione](../examples/impact-review.md) illustra i risultati sui dati esistenti.

La nuova destinazione di navigazione usa l'identità semantica e lo storage del workspace per cronologia, copia e ripristino. Il report si ricalcola dal modello corrente e non aggiunge dati derivati o proprietà al formato v3. Schede, diagrammi e report condividono le modifiche e le stesse operazioni documentali native.

## Controlli automatici

- **54 test di dominio** nei nove file, eseguiti direttamente con Node. I sei nuovi casi coprono riferimenti inversi e distanze, contenimento delle risorse, autorizzazioni, cicli, omonimi, classificazione incerta, indipendenza del layout, evidenze estranee al perimetro, conservazione di esiti/revisioni, criteri senza record e cronologia del report con destinazioni eliminate.
- **42 test nativi**, compreso il controllo degli errori inattesi. I tre nuovi casi verificano apertura del report senza modificare un v2, Back/Forward, modifica dell'identità, salvataggio di una copia e ripristino dopo riavvio, riparazione dopo cancellazione, cambio documento con ID coincidenti, carichi invalidi e lettura accessibile con esiti/revisioni distinti senza diagrammi obsoleti.
- Typecheck ADE, build client incrementale, ESLint mirato agli undici file TypeScript coinvolti, Stylelint del foglio ADE, sintassi dello smoke, parsing del workflow YAML e controllo delle differenze. Le modifiche finali alla presentazione delle relazioni e alle diciture sono state controllate con lint e test mirati della lettura.

## Smoke Electron Linux

`--impact-only` è superato senza Extension Development Host. Usa un modello temporaneo esplicitamente chiamato **Synthetic Evidence Fixture**; i riferimenti al codice e ai risultati contenuti nel test sono sintetici, non evidenze della codebase A.D.E. Verifica cinque dipendenti del contratto di pagamento, mancata propagazione dei riferimenti incerti, navigazione verso i due endpoint, elementi e diagrammi, ispezione di esiti passed/failed/unknown su revisioni diverse, lettura nativa, immutabilità del documento durante la consultazione, undo/redo, salvataggio e riavvio sulla stessa identità.

In finestra 800 × 800 controlla apertura delle schede da tastiera, ricalcolo dopo la rimozione esterna di una relazione, uscita dal report dopo cancellazione dell'identità e assenza di report obsoleti quando cambia il documento o il file è invalido. Le mappature e i record di verifica rimangono invariati al salvataggio.

Schermate ispezionate: `.build/ade-smoke/model-impact.png` e `recorded-evidence.png` nella stessa directory.

```sh
xvfb-run -a node ade/scripts/smoke-desktop.mjs --impact-only
```

Anche `--navigation-only` e `--ux-only` sono stati ripetuti con esito positivo. Restano verificati ricerca, schede, contratti, identità condivise fra diagrammi, salvataggio/riavvio, aggiornamenti esterni, mappa, routing delle etichette, gruppi della sidebar, lettura/aiuto accessibili, focus, scorciatoie, tastiera, finestra stretta, quattro temi, contrasto del nodo selezionato, Fit Diagram, scorrimento e terminale. La prova dei quattro temi riguarda le viste del percorso UX esistente, non una misura dedicata di ogni riga del report.

Il workflow desktop include il percorso di impatto separatamente su Linux e macOS. Questi risultati sono locali e non attestano il completamento della CI remota.

## Confini e stato M3

L'impatto è un perimetro potenziale di revisione nel grafo dichiarato, non un diff, una previsione del codice o un'esecuzione delle condizioni. I discendenti appartengono al perimetro iniziale; i discendenti di un dipendente non vengono inclusi senza un riferimento che li raggiunga. Un'assenza dal report non prova l'assenza di dipendenze nella codebase. Le evidenze sono metadati del documento: non vengono aperti o eseguiti i relativi percorsi e non viene inferita la validità corrente di una revisione.

Il sottoinsieme visuale M3 resta quello dichiarato nella [guida](semantic-explorer.md): struttura e flussi iniziali, sequenze dichiarative, stati semplici delle risorse e impatto del modello. Restano macOS/VoiceOver, tastiera fisica, CI remota, revisione UX dell'utente e misure su grandi modelli. Il runtime Linux riusa SQLite compilato separatamente e Xvfb estratto in `/tmp`, con fallback della mappatura tastiera per gli header `x11`/`xkbfile` mancanti; questo non certifica una toolchain nativa completa. I percorsi completi `--native-only`, `--sequence-only` e `--state-only` non sono stati ripetuti in questa sessione; i test di dominio e servizio ne includono le regressioni pertinenti. Il prossimo sviluppo funzionale è M4, adattatore iniziale e tracciabilità del codice.
