# Verifica M3.4 — 30 ottobre 2026

Prima sequenza coordinata dell'[esploratore semantico](semantic-explorer.md), sulla branch `feat/roadmap-next`, dopo M3.3 (`49f25dd7`). Ambiente Linux x64, Node 24.22.1, Electron 43.8.3 e Xvfb. La milestone M3 resta in corso.

## Capacità verificate

Creazione di una sequenza nella feature scelta, riuso di partecipanti e interazioni del sistema, inclusione automatica degli endpoint e ordinamento locale. Le interazioni supportate sono invocazioni, letture e scritture dichiarate; sono presenti auto-messaggi, condizioni ed errori. Proprietà e contratti riusano le identità di struttura e flusso. Rimuovere un messaggio o un partecipante dalla sola sequenza conserva la semantica del sistema e le altre viste; le cancellazioni semantiche mantengono i comandi e le conferme già esistenti.

L'ordine è persistito negli array `nodes` e `relationIds` della vista; il formato v3 non aggiunge proprietà. Le posizioni degli altri diagrammi restano indipendenti. Il renderer misura le righe dei messaggi prima dello zoom e dispone linee di vita e frecce senza cambiare coordinate salvate. Il lettore accessibile conserva lo stesso ordine e segnala le relazioni storiche non rappresentabili come messaggi.

## Controlli automatici

- **43 test di dominio** nei sette file, eseguiti direttamente con Node. I cinque nuovi casi coprono riuso senza duplicazione di endpoint e messaggi, ordine distinto da quello globale, round-trip JSON, indipendenza di semantica e layout delle altre viste, rimozione locale, rigetto atomico degli inserimenti non supportati, segnalazione delle relazioni storiche, ordinamento in loro presenza e auto-messaggi con contratti condivisi.
- **36 test del runner nativo**, compreso il controllo degli errori inattesi. I due nuovi casi verificano cronologia, salvataggio e riavvio della sequenza, selezione riparata dopo rimozione locale e lettura accessibile ordinata con condizioni, errori e contratto corrente.
- Typecheck ADE, build client incrementale, ESLint mirato agli otto file TypeScript coinvolti, Stylelint del foglio ADE, sintassi dello smoke e controllo delle differenze.

## Smoke Electron Linux

Il percorso dedicato `--sequence-only` è superato senza Extension Development Host. Crea il diagramma dal menu nativo, include sette interazioni già esistenti, ordina partecipanti e messaggi con undo/redo, rimuove e ripristina un'occorrenza, aggiunge un auto-messaggio e modifica un contratto visibile anche nella prospettiva strutturale. Controlla lettura accessibile, assenza di sovrapposizione fra etichette misurate, stabilità di Fit Diagram, selezione e ordinamento da tastiera in finestra 800 × 800, pan, salvataggio e ripristino dopo il riavvio. La rimozione finale di un partecipante conserva integralmente semantica e altre viste. Schermata ispezionata: `.build/ade-smoke/sequence-diagram.png`.

```sh
xvfb-run -a node ade/scripts/smoke-desktop.mjs --sequence-only
```

Il percorso è configurato separatamente su Linux e macOS nella CI desktop. Il collaudo locale non costituisce un esito della CI remota.

Anche `--navigation-only` è stato ripetuto con esito positivo sulla revisione M3.4: ricerca, contratti M3.3, prospettive condivise, lettura accessibile, mappa, etichette delle relazioni, salvataggio/riavvio, aggiornamenti esterni e integrazione della sidebar M2 restano verificati su Linux.

## Sottoinsieme e limiti

Una linea di vita corrisponde a un'identità semantica e ogni relazione compare al massimo una volta nel diagramma. Non sono introdotti istanze runtime multiple, occorrenze ripetute della stessa relazione, frammenti `alt`/`loop`/`par`, risposte dedicate, attivazioni, tempi o interpretazione delle condizioni. Una sequenza condizionata resta una dichiarazione progettuale, non una prova di esecuzione. Dipendenze, realizzazioni, transizioni e relazioni legacy non classificate presenti nei documenti storici vengono conservate e segnalate, senza trasformarle in interazioni supportate.

macOS, VoiceOver, tastiera fisica, CI remota e prestazioni su grandi modelli restano da verificare. L'ambiente Linux riusa il runtime preparato per M3.3: SQLite compilato separatamente, Xvfb estratto in `/tmp` e fallback della mappatura tastiera per gli header `x11`/`xkbfile` mancanti. Questo collaudo non certifica una toolchain nativa completa. I percorsi completi `--native-only` e `--ux-only` non vengono ripetuti per questo incremento. Il prossimo incremento funzionale è M3.5, stati e transizioni estese; importazione, Sync ed esecuzione rimangono nelle rispettive milestone.
