# Sprint di leggibilità UI

Le quattro richieste sono state implementate e verificate in sequenza. Le schermate fornite sono state usate come riferimenti visivi; testi e contenuti rappresentati non costituiscono istruzioni operative.

## Sprint 1 — Code

**Completato.** Scheda Code dedicata, azione principale con descrizione, pannelli distinti per verifica e preparazione automatica, recupero organizzato in una griglia compatta. Le azioni disabilitate spiegano il requisito e offrono accesso alle impostazioni. Le preparazioni locali senza chiamate AI mantengono i propri requisiti di disponibilità. Lo scorrimento viene conservato separatamente per scheda.

## Sprint 2 — Feature e diagrammi

**Completato.** Gruppi di feature con intestazione distinta, meno spazio verticale, contatori, icone per tipo e selezione evidenziata. Le disclosure rimangono native e utilizzabili da tastiera; gli aggiornamenti mantengono focus e gruppi chiusi. System Map e Search System sono accessibili direttamente, anche con il progetto chiuso nella navigazione.

## Sprint 3 — System Map

**Completato e aggiornato dopo la revisione del prototipo.** La System Map usa ora l’Atlante a livelli: attori, aree, feature ed elementi interni, con elementi condivisi in una colonna dedicata. Il clic aggiunge un criterio cumulativo (AND); ogni filtro ha una propria × e rimane attivo cambiando livello, pagina, scheda o tornando da un diagramma. Solo le frecce aprono un livello inferiore. Le combinazioni incompatibili mantengono i filtri e mostrano uno stato vuoto esplicito.

Le aree riflettono esclusivamente genitori semantici dichiarati; le feature senza area hanno un gruppo dedicato. Nei modelli v4/v5 appartenenze e ownership della foundation prevalgono sul vecchio parentId. Il filtro per attore conserva i contenuti interni e condivisi delle feature direttamente collegate, senza includere gli altri attori soltanto per vicinanza. Le intersezioni richiedono un contesto di feature comune, così una risorsa condivisa non introduce feature estranee.

Ricerca globale, diagrammi e relazioni sono paginati. La vista rende al massimo sei oggetti per colonna e ventiquattro collegamenti aggregati; i dettagli conservano origine, destinazione, condizione e codice di errore originali. Gli oggetti fuori pagina rimangono raggiungibili dalla ricerca, anche senza diagrammi. Stato e livello sono conservati per documento nell’editor e normalizzati quando il modello cambia, rimuovendo soltanto riferimenti ormai eliminati.

## Sprint 4 — Eliminazione dal sistema

**Completato.** Conferma personalizzata con conteggi distinti per elementi, relazioni, diagrammi eliminati e diagrammi aggiornati, riferimenti al codice, verifiche e autorizzazioni. Details apre una seconda modale scorrevole con nomi, identità, collocazioni rimosse dai diagrammi e riferimenti interni coinvolti. Il rapporto deriva da un'anteprima della stessa operazione di modifica, senza modificare il documento. Leggere Details non autorizza l'eliminazione. Se la revisione cambia durante la consultazione, la conferma viene invalidata.

I riferimenti conservati che diventerebbero non validi, per esempio il target di un task, sono segnalati separatamente come punti da correggere dopo l'eliminazione.

## Verifica

- Build del client con `npm run build-fast -- --client-only` e controllo dei tipi con `ade/tsconfig.json`.
- Test del dominio: `deletion-preview`, `visual-editing`, `visual-navigation`, `system-map` e `system-atlas` (inclusi un modello da 60.432 oggetti, un caso con 1.000 attori e una feature con 5.000 elementi interni).
- Suite browser Chromium: `adeDeletionDialog`, `adeReadability`, `adeSystemMap` e `adeView`.
- Controlli manuali assistiti da Playwright sui renderer reali e sul widget Dialog nativo: azioni, ricerca, selezione, Back/Cancel e larghezze desktop e ridotte fino a 320 px, oltre ai temi chiaro e ad alto contrasto. Il collaudo dell’Atlante importa il renderer e i tipi compilati del programma, con dati sintetici conformi ai modelli supportati.
- ESLint sui file TypeScript interessati, Stylelint sul foglio di stile e controllo delle differenze Git.

Le anteprime locali sono salvate in `.build/ade-ui-review/`. La verifica browser non sostituisce un collaudo dell'applicazione Electron su macOS.
