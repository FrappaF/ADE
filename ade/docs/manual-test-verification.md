# Verifica delle correzioni dei test manuali

Incremento del 5 novembre 2026 sulla branch `fix/manual-test-followup`, a partire da `69e25b5e`. Il [piano](manual-test-roadmap.md) conserva segnalazioni e criteri di accettazione. Questo verbale registra i risultati senza equiparare provider simulati e account reali.

## Implementazione

| Punti | Comportamento disponibile nell’app |
| --- | --- |
| AI-01 | Verifica del login della CLI originale, stato separato dalla scelta del modello, configurazione persistente, aggiornamento dopo login/refresh, PATH e home coerenti |
| AI-02 | Avanzamento per fase, esiti dei budget zero/solo piano, prerequisiti espliciti, errori del provider riassunti, recupero e controllo delle operazioni concorrenti |
| PRJ-01 | Apertura della cartella del progetto nel workspace nativo, conservazione dei workspace multipli, ripristino del modello e gestione esplicita di un progetto già esistente |
| TERM-01 | Nuovo terminale nella radice attiva, pannello visibile prima del focus; la CLI della revisione usa il worktree |
| SYNC-01 | Sync Project globale, perimetro nell’anteprima, conflitti, annullamento e risultato visibili; nessuna promessa di riconciliazione M6 |
| REL-01 | Tipo, nome, condizione ed errore sulle connessioni; dipendenze tratteggiate e realizzazioni con triangolo; lettura accessibile |
| LAY-01 | Disposizione deterministica sensibile al grafo, cicli e nomi, tre densità e cronologia nativa per vista |
| ROUTE-01 | Porte distribuite su tutte le relazioni incidenti, penalizzazione dei tratti condivisi, bersagli più ampi e scelta delle relazioni sovrapposte |
| CTX-01 | Menu nativi sui nodi, creazione sul canvas o da elenco, annullamento con Esc e azioni sul modello o sulla sola vista |
| CTX-02 | Menu su linea/etichetta e azioni nelle proprietà, modifica atomica della relazione e navigazione agli estremi |
| UI-01 | Navigazione senza elenco completo dei diagrammi nella barra, icone per comandi comuni, AI nel pannello contestuale e azioni secondarie raggruppate |

La correzione del terminale affronta un problema distinto dalla presenza dell’eseguibile: attendere `focusWhenReady()` su un terminale il cui pannello è nascosto può lasciare l’apertura in attesa. Il percorso condiviso ora crea il terminale, lo rende attivo, mostra il pannello e attende il focus in quest’ordine.

## Verifiche locali

Ambiente: Linux x64, Node 24.22.1, Electron previsto dal repository, display Xorg di prova e profilo desktop temporaneo. Le dipendenze native necessarie al collaudo sono state compilate nel checkout senza modificare i lockfile. Il rilevamento nativo del layout della tastiera non era disponibile in questo ambiente; i controlli da tastiera eseguiti usano il layout di fallback. La CI desktop installa i prerequisiti completi.

- Test del dominio: disposizione con 5/15/30 nodi, cicli e nomi lunghi; densità; connessioni convergenti, parallele, inverse e autoreferenziali; modifica delle relazioni e conservazione delle altre viste.
- Test del controller AI e degli strumenti: account CLI autenticato, logout/login esterno, stato sconosciuto, budget zero/solo piano, esclusione reciproca delle operazioni, prerequisiti della sessione, login nativo e fallback CLI; radice del workspace e ordine di apertura del terminale.
- Test Node della CLI: risoluzione dell’eseguibile e comandi di stato su processi controllati, senza credenziali reali; home selezionata, stdout/stderr non esposti, timeout e stati non riconosciuti.
- Test del motore AI: disclosure, budget, errori classificati senza output sensibile, generazione in worktree, verifica e rollback.
- Smoke desktop `--followup-only`: menu nativi aperti con clic destro e attivati da tastiera, creazione/annullamento dal canvas, modifica della relazione e Undo, Arrange/Fit, creazione del progetto, Files, verifica di `pwd` e riapertura della cartella.
- Smoke desktop `--ai-only`: CLI simulata eseguita realmente, contesto e piano revisionati, controllo di accettazione indipendente, test nel worktree, applicazione, riavvio, ripresa e annullamento esatto. Nessun provider esterno è certificato da questo scenario.

La suite desktop già esistente verifica inoltre finestra stretta, focus, lettura accessibile e quattro temi. I controlli della PR su Linux/macOS restano la verifica della revisione pubblicata; i risultati locali non attestano automaticamente il loro esito.

## Ripetere le verifiche

Dopo il setup e la build del client:

```sh
npm run ade:setup:test
npm run ade:test
npm --prefix ade/ai test
node ade/scripts/test-ai-service.mjs
node test/unit/node/index.js --run src/vs/workbench/contrib/ade/test/node/adeCliExecutable.test.ts --run src/vs/workbench/contrib/ade/test/node/adeCliAccount.test.ts
node ade/scripts/smoke-desktop.mjs --followup-only
node ade/scripts/smoke-desktop.mjs --ai-only
node ade/scripts/smoke-desktop.mjs --ux-only
```

Su Linux i comandi desktop richiedono un display, per esempio `xvfb-run -a`. La CI esegue controlli dei tipi e smoke anche su macOS. Le immagini e i rapporti sono prodotti sotto `.build/ade-smoke/`, compresi `followup-results.json`, `followup-canvas.png`, `followup-relation-menu.png` e `followup-project-terminal.png`.

## Limiti del collaudo

Il riconoscimento di un account Codex reale sul Mac dell’utente e VoiceOver richiedono il relativo collaudo: non sono sostituiti dai test con CLI simulata. La verifica del login non dimostra disponibilità di ogni modello o quota. La CLI Claude viene controllata con il suo comando di stato, ma l’implementazione con account Claude reale mantiene il limite di collaudo già dichiarato da M5. Windows non è una piattaforma desktop certificata da questo incremento.

Classi UML e database ER non fanno parte di questi fix e mantengono il proprio perimetro di sviluppo separato.
