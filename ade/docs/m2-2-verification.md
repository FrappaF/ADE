# Verifica M2.2 — 29 ottobre 2026

Prosecuzione della prima shell [M2.1](m2-1-verification.md), nello stesso checkout basato su `a8d677e9`. Implementazione e perimetro supportato sono descritti nell'[editor persistente](visual-editing.md).

## Risultati verificati

Ambiente Linux x64 gestito, Node 24.22.1 da `.nvmrc`, Electron 43.8.3 e display Xvfb. Le verifiche del desktop non richiedono `ade/prototype/`; lo smoke nativo disabilita l'attivazione delle estensioni integrate per verificare l'indipendenza del prodotto visuale.

- 21 test Node di dominio, migrazione, navigazione ed editing: schema v3, appartenenza dei diagrammi vuoti, struttura/flusso con pagamento autorizzato o rifiutato, identità condivisa, validazione atomica e cancellazione dei riferimenti.
- 9 test del servizio visuale: ripristino, caricamenti concorrenti, errori, creazione senza sovrascrittura, transazione unica feature/diagrammi, undo/redo, salvataggio e protezione delle modifiche durante il cambio di documento. Usano il modello testuale e la cronologia upstream reali; il collegamento ai servizi file è controllato e il backend completo è collaudato su Electron.
- Un test di regressione del ripristino: un gestore generico riutilizza l'editor già associato al documento da un gestore specializzato. I test includono il controllo delle risorse non rilasciate e degli errori inattesi.
- La suite upstream `WorkingCopyBackupTracker (browser)` è stata eseguita su Electron: 8 casi del backup tracker e il controllo iniziale dei registri superati.
- TypeScript mirato (`ade:check`), ESLint e Stylelint sui file modificati; build del client e validazione indipendente JSON Schema 2020-12 di schema ed esempio v3.
- Controllo dei livelli con le regole upstream su 13 file di produzione ADE e del recupero dei backup: nessuna violazione. Il controllo completo del fork resta distinto da questa verifica mirata.

Lo smoke Electron esegue il percorso dalla home alla creazione di un progetto e della feature «Conferma acquisto», disegna struttura e flusso, compresi pagamento riuscito e rifiutato, senza aprire o modificare JSON. Verifica spostamento da tastiera, trascinamento, zoom, undo/redo, cancellazione con ripristino, salvataggio tramite scorciatoia e riapertura del documento con identità e coordinate conservate.

Un'ulteriore modifica non salvata viene messa in conflitto con un aggiornamento esterno: il salvataggio viene bloccato e il file sul disco resta intatto. Il test riavvia Electron, recupera il contenuto non salvato nel canvas e verifica lo scarto esplicito con ricaricamento del documento esterno. Non vengono aperte schede JSON aggiuntive durante editing e recupero.

Le schermate sono in `.build/ade-smoke/`, inclusa `visual-editing.png`. I casi precedenti di M2.1 continuano a verificare sidebar, cambio fra feature, file v2, modelli vuoti, documenti invalidi e aggiornamenti esterni.

## Limiti della certificazione

Il collaudo riguarda Linux e il perimetro dichiarato. macOS, nuova CI remota, distribuzione completa delle estensioni integrate, temi/contrasto e revisione UX restano da completare. Il successo storico sul MacBook per M0/M1 non certifica automaticamente questo incremento.

Il prossimo punto operativo è **M2.3**, collaudo del percorso visuale completo sulle piattaforme previste. L'editor non implementa importazione del codice, chiamate IA o esecuzione del modello e non attribuisce alle condizioni lo stato di comportamento verificato.
