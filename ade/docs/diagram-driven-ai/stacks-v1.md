<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Due runtime, stesso PIM — v1

[ADR 0014](../decisions/0014-bun-esm-second-archetype.md) sceglie `bun.esm@1`, Bun 1.3.2, dopo `node.esm@5`, Node 24.22.1. Sono due runtime ECMAScript ESM senza framework: non due linguaggi o database. Il descrittore Node mantiene il digest DAI-10 `2558425ea86e106e58ab78240c93ac69f5a2efafa9c8d27482005ca05c1be838`. La revisione fidata dell'archetipo partecipa al sigillo del task e della review.

| Capacità | Node ESM 24.22.1 / profilo 5 | Bun ESM 1.3.2 / profilo 1 |
| --- | --- | --- |
| Creazione / analisi | Starter tipizzato; parser TS 6.0.2 dei moduli ESM | Stesso starter e analisi, binding Bun esplicito |
| Forward | Espressioni, piani interazioni/stati/messaging | Stessi emitter, runtime e runner Bun reali |
| Reverse | Grammatica delimitata ed esatta riemissione | Stessa grammatica verificata; nessuna inferenza su codice arbitrario |
| Test | `node --test` con permission Node | `bun test`, versione esatta, senza fallback |
| Stati | Piatti, eventi serializzati, cancellazione do, checkpoint quiescenti | Stessi attesi, restore e dedup sotto Bun |
| Frame | alt/opt/loop/par/critical/ref | Stessi test con timer e cancellazione reali |
| Asincronia | Simulazione nel runner; adapter locale separato con JetStream 2.11.9 / nats 2.29.3 | Stesse prove col broker reale isolato e trasferimento del ledger |
| Continuità | Opt-in, coalescing, budget preventivo, review manuale | Stessa coda e budget; verifica Bun esplicita prima di pubblicare |
| Dati esistenti | Checkpoint v1 e ledger JSON locali | Copia offline e restore con digest semantico invariato; ritorno Node provato |
| Migrazioni DB | Unsupported | Unsupported |
| Deploy | Manuale, fuori dalla pubblicazione dei file | Manuale, runtime da installare e servizi da riavviare esplicitamente |

Il workbench offre **Choose Runtime and Review Stack Plan** negli strumenti e nella palette. Su un modello completo cambia in un solo edit nativo tutti i binding del runtime, incluso quello del broker, conservandone gli ID. Cancel non modifica il documento; undo/redo/save/reopen usano il servizio già esistente. La prima assegnazione di una bozza sceglie esplicitamente il container. Job con container applicativi misti, binding ignoti/duplicati o tecnologia contraddittoria sono bloccati; non esiste un runtime implicito.

Readiness, anteprima del task, proprietà e lettura accessibile usano il profilo effettivo. L2 mostra runtime/versione risolti e distingue NATS dal runtime applicativo. Gli ADR normativi restano intatti: un vincolo Node-only impedisce la generazione Bun finché l'autore non lo revisiona. Anche il codice custom resta intatto e fuori dal runner fidato.

Dopo un cambio di stack, **Model to Code** prepara una review col piano sigillato: implementazione, dipendenze, storage/dati, test, deployment e ritorno. Il PIM completo deve corrispondere alla baseline; modifiche di business simultanee richiedono prima una riconciliazione distinta. Il manifest passa al runtime destinazione; gli emitter non riscrivono sorgenti invariati. Criteri indipendenti invariati vengono rieseguiti davvero sotto il nuovo runtime. Manifest cambiati manualmente fuori dal piano non possono risultare allineati. Inventario, preimmagini, journal, worktree, pubblicazione, undo e recovery sono comuni ai due profili.

Il worker host resta Node 24.22.1. Per verificare Bun, configurare prima di avviare ADE `ADE_BUN_EXECUTABLE` con il percorso assoluto all'eseguibile 1.3.2. Il campo non appartiene al modello o al protocollo del provider. Il runner verifica la versione, ricostruisce solo codice degli emitter fidati e attesi dati in una directory temporanea, controlla la sintassi con Node e l'esecuzione con Bun, usa ambiente vuoto, limite 30 secondi/1 MiB di output e cancellazione del gruppo di processi. Bun non possiede le permission Node: non si dichiara una sandbox OS/rete. Nessun package script, test arbitrario, codice custom, dipendenza di progetto o servizio vivo entra nel runner.

Null e assenza restano distinti; interi limitati a `Number.isSafeInteger`, divisione non integrale/overflow e divisione per zero falliscono esplicitamente. La concorrenza è locale strutturata con join/cancellazione/drain e mutex dichiarati; nessuna transazione esterna o compensazione automatica. Le politiche NATS e i relativi limiti di at-least-once, dedup e DLQ restano quelli di [messaging v1](messaging-v1.md). La directory del runner non esegue il broker: le prove di integrazione lo avviano separatamente.

Per dati esistenti: fermare e drenare tutti gli scrittori; conservare runtime e backup originali; copiare checkpoint/ledger; validare digest, input, delivery ID, stato e sequenza prima del riavvio. `transferModelCheckpoint` restituisce una copia detached e una ricevuta con hash origine/destinazione e piano; il restore non esegue entry/effect né modifica file. La prova attraversa file reali Node→Bun→Node. Il formato del ledger non cambia: una delivery già completata resta duplicata attraverso entrambi i runtime. Corruzione, programma/revisione differenti o scrittori concorrenti restano bloccanti. Pubblicazione/undo del codice non migrano dati né riavvolgono un ledger dopo nuovi effetti. Database, servizi vivi e migrazioni distruttive non sono supportati.

Le prove e gli strumenti riproducibili sono nel [verbale DAI-11](dai-11.md) e nel [report](../benchmarks/dai-11-verification-2026-11-09.json). Restano aperti desktop completo, screen reader reale, provider live e accettazione R01–R16 di DAI-12.
