<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Riscrittura incrementale dei diagrammi — verifica del 10 novembre 2026

Branch di partenza: `feat/m6-dai-validation`, commit `7ed9b129`. Ambiente Node **24.22.1**. Il piano e il verbale HTTPie/ChartMuseum precedenti sono conservati. Questa verifica non converte i loro fallimenti in successi e non afferma la parità qualitativa sul corpus reale.

## Percorso implementato

`Import Codebase` continua a creare subito l'inventario locale. `Build Diagrams`, `Resume Diagrams` e la chat di un progetto importato aprono una sessione incrementale: ricerca → lettura aggiuntiva → proposta → diagnostica/preview → applicazione selettiva. I servizi del dominio sono gli stessi nel bridge nativo e nel server MCP. La UI mostra bozze indipendenti, obiettivi/lacune, consumo locale e viste con evidenze obsolete. La review apre il diff completo, le diagnostiche e l’anteprima prima della pubblicazione.

La proposta contiene al massimo una vista. Una classe non realizzabile rimane una bozza distinta e non impedisce di pubblicare la panoramica. Gli ID non dipendono dai nomi dei simboli o dagli alias del prompt. Le modifiche manuali estranee e le posizioni aggiornate durante la review sono conservate. Le evidenze delle responsabilità sono raggiungibili dal pannello Code Evidence con guard della revisione e range esatto.

I dettagli contrattuali e i limiti sono in [ADR 0015](../decisions/0015-incremental-diagram-exploration.md).

## Test locali e di protocollo

I test in `ade/ai/test/diagram-session.test.mjs` non invocano un modello. Usano il servizio di produzione, il bridge, i parser, la pubblicazione e il journal reali. Verificano inventario prima dell'inferenza, letture paginate/continuate, evidenze UTF-16, risposte unsupported/unavailable, proposta idempotente e conflitto sul contenuto, bozza classi respinta indipendentemente, pubblicazione selettiva, annotazioni e layout manuali, ricerche negative invalidate da nuovi file e da documentazione cambiata, symlink/scope, budget esteso senza perdita, recupero di una pubblicazione con risultato incerto e separazione dei due endpoint conservando le occorrenze. Coprono anche fusione con reindirizzamento dei consumatori, correzione di bozze invalide con ID riservati stabili, proiezione delle attività senza cronologia inventata, ordine transitivo fra rami esclusivi, occorrenze intercalate nei frame e membership delle funzionalità indipendente dall’ownership architetturale.

Il protocollo MCP è testato con Client/Server dell'SDK ufficiale sia in memoria sia attraverso un vero processo `stdio`: elenco degli otto tool, ricerca di un simbolo, seconda lettura nella stessa sessione, cancellazione e riapertura. Anche il server distribuito `out/vs/workbench/contrib/ade/node/adeDiagramMcp.js` è stato avviato come processo reale: il client ufficiale ha elencato gli otto tool ed eseguito `ade_project_inspect`, con risposta v2 senza diagnostiche. Questo prova il protocollo e i servizi, non una decisione di un modello reale. I test del workbench verificano registrazione degli strumenti prima della chat, riuso della sessione e configurazione MCP limitata al processo CLI.

Comandi di verifica:

```sh
npm run ade:check
npm --prefix ade/ai run check
npm --prefix ade/code-import run check
npm run ade:test
npm --prefix ade/code-import test
npm --prefix ade/ai test
npm run build-fast -- --client-only
npm run ade:ai:service-test
node ade/scripts/test-diagram-exploration-browser.mjs
```

Le suite complete eseguite hanno dato **282/282** test del dominio, **180/180** di importazione e **129/129** del livello IA, inclusi i 17 test della nuova sessione. La suite dei servizi nativi ha dato **72/72** test, inclusa la review integrale e il rifiuto senza pubblicazione. Sono passati il controllo TypeScript ADE, i controlli dei due pacchetti e la build del client con engine e server MCP inclusi. Sono passati anche i 41 test mirati di regressione del modello semantico e delle interazioni. Dopo le correzioni finali del rendering sono passati anche 29 test mirati di sessione, layout e routing. I nuovi casi verificano diagnostiche della variante effettiva dei comandi, contabilizzazione dei rifiuti, range UTF-16 riparabili e cinque ricerche MCP parallele senza perdita di ricevute. Il controllo ESLint dei file modificati conserva i 40 avvisi preesistenti e non introduce nuove diagnostiche.

## Anteprime nel browser

`test-diagram-exploration-browser.mjs` costruisce tre proposte separate su una fixture dichiarata, senza inferenza. Chromium **154.0.8037.57**, pilotato da Playwright, controlla titoli accessibili, contenuti, separazione geometrica del client esterno dal sistema e presenza dei rami `ChartLimits == nil` / `ChartLimits != nil` nel frame `alt`. La vista attività proietta lo stesso scenario, conserva entrambe le condizioni e non disegna archi temporali assenti dai dati. Non sono esecuzioni di ChartMuseum né prove end-to-end della finestra Electron.

Gli artefatti riproducibili sono in `.build/ade-exploration-preview/`: `c4.svg`, `sequence.svg`, `activity.svg`, gli screenshot PNG e `report.json`. Le tre anteprime sono passate senza errori del browser e sono state anche esaminate visivamente.

## Collaudi reali con Codex

Modello esplicito: **`gpt-5.6-terra`**, senza escalation o cambio di provider. Repository fissate: ChartMuseum **`dcbb99069784841bc19a7e434ae0fc9e11f2d159`** e HTTPie **`5b604c37c6c67e18e7c3e9aee6c88a8c22b98345`**. Importazione predefinita sintattica: nessun indice risolto di chiamate o controllo del flusso. Non sono stati eseguiti i programmi importati.

Il primo tentativo precedente si era fermato sulla directory di stato Codex in sola lettura; il secondo aveva ricevuto **HTTP 401**, pur con `codex login status` positivo. Quei due tentativi restano conservati con zero inferenze completate e zero chiamate ADE. Successivamente l’utente ha richiesto un nuovo accesso con codice dispositivo: la CLI ha confermato l’accesso e le richieste reali successive sono riuscite. Non sono stati copiati o esposti token.

Ogni nuovo run ha un limite di 32 chiamate ADE, 512 KiB restituiti e 10 minuti; il prompt chiede al massimo 24 chiamate, o 16 per la vista HTTPie focalizzata. Una ripresa autorizzata aggiunge questa disponibilità al budget della stessa sessione e conserva evidenze, ID, ricevute e proposte. Shell, subagenti, plugin aggiuntivi e ricerca web sono disabilitati. La configurazione MCP rimane limitata al processo CLI.

### Difetti trovati e corretti con il modello reale

I primi due run autenticati hanno fallito l’obiettivo e restano nel denominatore: ChartMuseum non ha salvato proposte dopo ripetuti comandi malformati; HTTPie è stato fermato dopo aver riprodotto lo stesso problema. La prima implementazione restituiva l’errore della prima variante `oneOf`, anziché quella del comando scelto, e non conteggiava i rifiuti di schema. Le ricevute locali sottostimavano quindi le chiamate viste dalla CLI: **12 contro 27** per ChartMuseum, **9 contro 25** per HTTPie; questi ultimi conteggi includono anche errori di lock e una richiesta di risorse MCP non supportata.

Sono stati aggiunti esempi completi con dati annidati, diagnostiche del ramo corretto con proprietà mancanti/inaspettate e valori ammessi, ricevute e byte anche per i rifiuti, e `isError` MCP sulle risposte respinte. Un range errato restituisce i limiti UTF-16 e come proseguire. Le ricerche parallele vengono accodate prima di acquisire il lock condiviso: i run iniziali nuovi avevano ancora quattro/cinque collisioni di lock; nelle successive modifiche conversazionali le chiamate CLI e le ricevute ADE coincidono (**7/7** e **6/6**), senza collisioni.

La revisione visiva ha anche trovato frecce nascoste sotto i nodi e relazioni prive di etichette nell’SVG strutturale. L’anteprima ora riusa routing e posizionamento delle etichette del canvas, termina le frecce sui bordi e diagnostica relazioni non instradabili. Le sequenze riusano la gerarchia condivisa dello scenario, separano gli operandi e riservano spazio ai titoli dei frame; le etichette vanno a capo fra parole.

### Risultati conservati

| Run reale | Chiamate CLI MCP / ricevute ADE nel run | Durata | Risultato |
| --- | ---: | ---: | --- |
| ChartMuseum, ripresa dopo correzione del contratto | 5 / 5 | 126 s | Correzione locale di schema e scope; bozza valida e preview |
| HTTPie, ripresa dopo correzione del contratto | 5 / 5 | 104 s | Correzione locale di schema e relazioni; bozza valida e preview |
| ChartMuseum, sessione nuova | 17 / 13 | 110 s | Panoramica: 4 responsabilità, 4 dipendenze; preview |
| HTTPie, sessione nuova | 23 / 18 | 226 s | Panoramica: 10 responsabilità/integrazioni, 10 dipendenze; preview |
| ChartMuseum, aggiunta conversazionale upload | 7 / 7 | 137 s | Scenario descrittivo: 8 occorrenze, 3 rami esclusivi, 7 vincoli inferiti; preview |
| HTTPie, nuova prospettiva focalizzata | 6 / 6 | 48 s | Vista con 4 identità e 3 relazioni già accettate; preview |

Le riprese hanno usato le conversazioni CLI e le sessioni ADE esistenti, senza rileggere tutto il codice. Le nuove sessioni hanno usato le domande iniziali complete, senza correzioni manuali del payload durante il run. Una bozza valida indica integrità e compatibilità del dominio, non una certificazione automatica della fedeltà. Nella prima bozza HTTPie ripresa, la dipendenza output → CLI era troppo aggregata: la sessione nuova modella esplicitamente lo stream di console come destinazione. Non si trasferisce una valutazione positiva automaticamente a ogni bozza.

I contatori CLI dei run nuovi sono **560.427 input / 499.200 cached / 3.871 output** per ChartMuseum e **774.145 / 683.008 / 7.704** per HTTPie. I contatori delle riprese sono conservati come snapshot grezzi: possono includere turni precedenti e non vengono sommati come consumi indipendenti. Un evento `turn.completed` della CLI comprende più richieste al provider; **non prova** il target di otto inferenze. Il numero delle inferenze del provider resta non osservato, distinto dalle chiamate agli strumenti. Non si dichiara il gate del 50% di risparmio: la vecchia baseline fallita non è un confronto equivalente di successo.

### Review, pubblicazione locale e fedeltà

Dopo la review, l’host ha pubblicato le due panoramiche **solo nei progetti temporanei** e verificato la riapplicazione idempotente e gli ID. Ha poi applicato le due proposte conversazionali: la vista precedente e tutti gli elementi condivisi sono rimasti identici. Per HTTPie erano state introdotte prima della richiesta un’annotazione manuale e una modifica del layout: il confronto dei documenti conferma che sono conservate. I processi del modello non hanno pubblicato proposte e non hanno modificato sorgenti. `git diff --exit-code` è pulito in entrambe le repository campione.

La sequenza upload è confrontata con `api.go:116` e `:232`: il caso `ChartLimits == nil` contiene `PutObject`; il ramo sotto limite non elimina un chart; quello al limite legge/elimina il più vecchio prima del nuovo `PutObject`. I rami sono esclusivi e non concatenati. I sette ordini restano marcati **inferred**, con avvisi di fedeltà: l’indice non fornisce controllo del flusso. Errori, conflitti, limiti globali di storage, multipart/provenance ed eventi di aggiornamento dell’indice sono lacune dichiarate. Le route di lettura indice/oggetto sono state lette e riconosciute come distinte, ma questo collaudo non produce le due viste dedicate di lettura.

Una prova deterministica dell’host ha aggiunto e pubblicato una vista attività dello **stesso** scenario reale: nessuna nuova inferenza, otto occorrenze e sette archi esistenti, fondazione semantica e viste precedenti identiche. ChartMuseum termina con tre viste; HTTPie con due. SVG e screenshot derivano dalle proposte reali; non sono fixture né una prova end-to-end della finestra Electron. La leggibilità resta conservativa: grafi più densi possono richiedere etichette con richiamo e viste focalizzate.

Gli artefatti sono in `.build/ade-exploration-live/`: `*-authenticated` conserva i fallimenti dopo l’accesso; `*-repaired` le riprese; `*-fresh` le sessioni nuove; `chartmuseum-terra-upload` e `httpie-terra-focus` le modifiche conversazionali; `chartmuseum-terra-activity` la proiezione deterministica. Ogni run conserva input, eventi CLI, risposta e report. Le verifiche dell’host aggiungono `review.json`, SVG/PNG, modello pubblicato e risultati separati. I run successivi conservano anche gli hash dei file di implementazione nel loro input. `real-validation-summary.json` raccoglie i dieci tentativi, inclusi quelli precedenti all’accesso, con gli errori del trasporto. I cinque `render-validation.json` verificano titoli, numero atteso di frecce e assenza di testo fuori dall’SVG sull’implementazione finale; gli screenshot sono `reviewed-preview.png`. È passata anche una prova del bundle MCP con cinque ricerche parallele, conservata in `packaged-mcp-report.json`.

Per riprodurre una sessione nuova:

```sh
ADE_AI_EXECUTABLE=/percorso/codex node ade/scripts/test-diagram-exploration-live.mjs /percorso/chartmuseum gpt-5.6-terra .build/ade-exploration-live/nuovo-run
```

Per riprendere un test si aggiungono `ADE_EXPLORATION_SESSION_ID`, `ADE_EXPLORATION_CHAT_THREAD` e una domanda esplicita in `ADE_EXPLORATION_QUESTION`. Il comando riesce solo con un turno CLI completato, una proposta corrente `ready` e una preview riuscita nel run. Non considera sufficiente l’exit code zero. Il runner non pubblica; le pubblicazioni descritte sopra sono verifiche separate dell’host nei progetti usa e getta.

## Gate ancora aperti

La migrazione qualitativa P6 resta subordinata ai run reali ripetuti e agli aggiornamenti del corpus, con revisione stratificata delle affermazioni e confronto equivalente di costo. Il confronto di trasporto nativo/MCP con il modello reale, la prova opzionale di Serena e il benchmark ELK non sono dichiarati completati. La proiezione descrittiva degli stati richiede un incremento successivo e viene dichiarata non supportata. Le attività sono disponibili come proiezione condivisa dello scenario, senza inferenza di semantica eseguibile. La fusione di responsabilità descrittive conserva l’ID di destinazione e ridirige i consumatori; contratti eseguibili e annotazioni incompatibili richiedono il loro editor dedicato. La pubblicazione locale, le transazioni, le evidenze e l'esplorazione strutturale, sequenziale e delle attività sono esercitate dai test indicati sopra.
