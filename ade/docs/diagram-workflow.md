<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Diagrammi e Codex

Il percorso predefinito è un'esplorazione incrementale del progetto. L'inventario del codice è disponibile subito; Codex cerca le evidenze mancanti nella stessa conversazione e propone una vista alla volta. Le altre bozze e i diagrammi già pubblicati rimangono disponibili durante le correzioni.

## Importare e ottenere la prima panoramica

1. **Import Codebase** sceglie cartella e modalità di analisi. Parser e indici producono evidenze tecniche, separate dal modello architetturale. L'assenza di un indice delle chiamate non viene presentata come assenza di chiamate nel programma.
2. **Explore Architecture** o **Build Diagrams with AI** prepara una sessione locale e apre Codex. Con account e SDK pronti usa la chat nativa; altrimenti usa la CLI originale, con il server MCP ADE configurato per quel processo. Un account già valido non richiede un nuovo login.
3. Nella chat è preparata la richiesta di una panoramica delle responsabilità runtime e delle integrazioni. Il modello effettivo è visibile nel selettore di Codex. **Choose Diagram Model** permette una scelta esplicita separata da quella del coding; un modello non disponibile viene segnalato senza cambiarlo implicitamente.
4. Codex consulta inventario, entrypoint candidati, sorgenti e modello con strumenti locali. Può leggere un secondo frammento o un ramo omesso senza ripartire dall'intera codebase. Documentazione, test, configurazione e runtime rimangono distinguibili. I limiti delle capacità e della copertura sono espliciti.
5. Ogni proposta contiene al massimo una vista e la piccola transazione del modello necessaria. **Review Draft** apre diff, diagnostiche e anteprima. **Apply Proposal** pubblica quella transazione e le sue dipendenze attraverso lo snapshot e il journal esistenti. Una bozza classi respinta non blocca una panoramica valida.

Le tre misure di copertura rimangono separate: file inventariati, fatti disponibili dagli analizzatori, responsabilità/scenari esplorati. Una panoramica parziale non è etichettata come comprensione completa del repository. Una ricerca incompleta o un file illeggibile non equivalgono a un risultato negativo verificato.

## Approfondire e correggere

**Continue Exploration**, **Resume Diagrams** e **Chat with Codex** riaprono la sessione del progetto. Si può chiedere «mostra solo l'upload normale», «aggiungi retention», «separa i due endpoint» o «Redis è opzionale». Le correzioni riusano gli ID e gli oggetti accettati. La fusione di responsabilità descrittive conserva l'ID di destinazione e ridirige i consumatori; annotazioni incompatibili e contratti eseguibili richiedono una decisione o il loro editor dedicato.

Le sequenze descrittive hanno trigger, partecipanti, occorrenze distinte, alternative e vincoli di ordine espliciti. L'ordine delle relazioni nel JSON non diventa cronologia. Un ordine non conosciuto viene segnalato; condizioni e rami esclusivi restano visibili. I dati mancanti non vengono completati con timeout o altre politiche inventate. Le attività proiettano le stesse occorrenze e condizioni, con frecce soltanto per i vincoli d'ordine dichiarati e collegamenti ai partecipanti. Il layout è derivato dallo scenario. Gli stati descrittivi non sono ancora abilitati: il tool restituisce il limite e permette struttura, sequenza o attività. Gli editor esistenti delle altre notazioni restano disponibili.

**Back to Diagrams** aggiorna lo stato delle bozze e riporta al canvas. Il canvas conserva pan, zoom, selezione e posizioni manuali attraverso i servizi esistenti; la [guida canvas](canvas-workspace.md) descrive i controlli. **Code Evidence** apre le evidenze versionate della responsabilità selezionata al range esatto. Se il contenuto è cambiato, la navigazione segnala l'obsolescenza e non trasferisce automaticamente le vecchie posizioni.

Dopo modifiche al sorgente, **Update Diagrams** riprende l'esplorazione. Le evidenze obsolete e le query dipendenti sono segnalate; gli oggetti e le viste estranei non vengono rigenerati automaticamente. Le proposte hanno letture e preimmagini di scrittura: un conflitto pertinente richiede una correzione mirata. Un nuovo file invalida anche una precedente ricerca negativa nello stesso scope. Le modifiche manuali estranee e gli spostamenti eseguiti durante la review vengono mantenuti.

**Update Code** continua a richiedere i contratti e un profilo di generazione compatibile. Una bozza descrittiva visualizzabile non è automaticamente eseguibile. Gli altri flussi di implementazione e riconciliazione conservano i loro provider strutturati e i rispettivi controlli.

## Budget e interruzioni

La sessione conserva evidenze, obiettivi, proposte, chiamate e consumo in `.ade/exploration`. Il documento pubblicato resta nello snapshot attivo. **Exploration Goals and Gaps** mostra il lavoro ancora da esplorare; **Adjust Exploration Budget** aggiunge un budget esplicito senza scartare il lavoro precedente. Le chiamate locali agli strumenti non sono conteggiate come inferenze del modello. Turni interni e token non esposti dal provider rimangono sconosciuti; i contatori della chat riguardano le richieste osservate che usano strumenti.

Ricerca, lettura e anteprima non richiedono una conferma per ciascuna chiamata. L'applicazione resta una decisione della UI. Gli strumenti non possono aumentare budget o scope né pubblicare direttamente. Un errore locale non impone di rigenerare l'intero modello. Una pubblicazione con esito incerto viene recuperata dal journal e dal puntatore attivo; riapplicare lo stesso proposal ID non duplica gli oggetti. Un arresto forzato può richiedere la scadenza del lock condiviso prima della ripresa.

Gli ID riservati sono persistenti e separati dai simboli dell'indice e dagli alias temporanei `@nome`. Lo stesso proposal ID con contenuto diverso viene rifiutato; una correzione usa un nuovo proposal ID con `supersedes`, conservando anche gli ID riservati della bozza precedente. Le proposte non applicate rimangono bozze indipendenti dal modello pubblicato.

## Connessione e build

**Original CLI Executable** identifica il programma (`codex` o il suo percorso completo); **Model ID from Your CLI** identifica il modello. Se ADE non trova una CLI che funziona nel terminale, usare `command -v codex` su macOS/Linux o `(Get-Command codex).Source` in PowerShell e configurare il percorso verificato. L'account e l'eventuale `CODEX_HOME` restano quelli dell'utente. Un errore di autenticazione del servizio richiede di ripristinare quel collegamento; il solo esito locale di `login status` non prova l'accesso remoto.

La build `npm run build-fast -- --client-only` include sia `adeCodeEngine.js` sia `adeDiagramMcp.js`, insieme ai parser, alle librerie del compilatore e alle licenze delle dipendenze. Il workbench verifica la versione del bridge e la presenza dell'operazione `exploration`; una build incompatibile richiede rebuild e riavvio completo.

Per un client esterno si può avviare, con Node 24.22.1, `node ade/ai/diagram-mcp.mjs /percorso/progetto [session-id]`. La radice deve essere un progetto già importato e il processo resta vincolato a quella radice. Il server espone gli stessi otto strumenti del percorso nativo, senza token del modello o scritture ai sorgenti. Non è necessario configurare un server MCP globale.

## Compatibilità e verifica

La migrazione al documento v5 conserva i contratti eseguibili v4 e non modifica gli ID esistenti. Le versioni precedenti rimangono leggibili. `ade.diagramImport.incremental: false` rende disponibile il percorso legacy con piano e checkpoint in `.ade/diagram-imports`; questi checkpoint non vengono convertiti silenziosamente in nuove sessioni. I verbali storici rimangono conservati per il confronto.

[ADR 0015](decisions/0015-incremental-diagram-exploration.md) documenta il contratto. Il [verbale del collaudo incrementale](validation/incremental-diagrams-2026-11-10.md) distingue test locali, protocollo, browser e tentativi reali; documenta anche i run reali riusciti su ChartMuseum e HTTPie. I gate comparativi di fedeltà e costo richiedono ancora il corpus ripetuto completo.
