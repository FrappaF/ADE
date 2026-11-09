<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Espressioni e interazioni v1

Il contratto è implementato in `modelValues.ts`, `modelInteractions.ts`, nello schema v4 e nel profilo `node.esm` revisione 3. [ADR 0009](../decisions/0009-structured-interactions-and-runner.md) fissa politiche e limiti; gli [attesi DAI-06](dai-06-acceptance.md) precedono il runtime.

Le espressioni versionate hanno nodi ordinati e un risultato. Riferimenti con percorsi di campi stabili leggono soltanto lo scope esplicito. Oltre a confronto/logica/presenza/null, sono disponibili aritmetica nominale esatta, enum, record e count/any/every su collezioni scalari. Non sono ammessi decimali, conversioni implicite, variabili ambientali, chiamate o codice libero. Un valore mancante rimane diverso da null; entrambe le rappresentazioni possono rendere indeterminata una guardia. I nodi sono valutati nell'ordine di definizione: errori aritmetici non vengono soppressi da un nodo logico successivo.

Un'interazione dichiara contratto di operazione, revisione, step e binding di output. Gli step referenziano occorrenze e frame della fondazione; gli array `occurrenceIds/frameIds` sono indici di appartenenza, mentre l'ordine eseguibile è `execution.steps` e quello dei figli. Una chiamata ha mittente, destinatario proprietario dell'operazione, modalità locale sync/async, argomenti, risultato distinto, correlazione, risposta richiesta, deadline ed errori propagati. Chiamate ripetute riusano il contratto e ricevono nuovi ID di occorrenza e risultato.

| Frame | Semantica |
|---|---|
| alt | Scelta esclusiva fra guardie tipizzate, un else finale obbligatorio; ambiguità e indeterminatezza falliscono. |
| opt | Corpo eseguito soltanto quando la guardia è vera. |
| loop | Contatore nominale locale da zero, guardia a ogni iterazione, massimo esplicito; guardia ancora vera al limite dà `loopLimit`. |
| par | Rami avviati nell'ordine dichiarato, join all, errore cancel+drain oppure collect; esiti ordinati, risultati tipizzati per ID del ramo nel binding `resultId`. Nessuna variabile di ramo esce implicitamente. |
| critical | Risorsa di effetto e perimetro di una singola esecuzione espliciti; ordine globale dei lock annidati verificato anche attraverso le ref. |
| ref | Contratto, argomenti e revisione esatta della sotto-interazione; risultato distinto e cicli bloccati. |

L'[esempio checkout](../../examples/dai-checkout-frames.ade.json) risolve Checkout, Payments, Orders e Notifications, tipi nominali Money/Quantity, enum approved/declined/pending/unknown, contratti e ref parametrizzata. [Sette casi indipendenti](../../examples/dai-checkout-frames-criteria.json) verificano esiti e chiamate. Altri oracoli in `ade/test/dai-interactions.test.mjs` coprono chiamata ripetuta, alt nel loop, parallelismo, cancellazione, risultati, esclusione e timeout. Ogni programma emesso accetta input e risposte come dati; non contatta servizi esterni.

Nel workbench **A.D.E: Edit Executable Interaction** offre messaggi, frame, rami, navigazione gerarchica, argomenti e guardie attraverso scelte native; crea un solo comando undo. Se la vista corrente è una sequenza, la collega all'interazione. Canvas e lettore accessibile usano la stessa gerarchia; il layout non governa l'ordine. **Independent Business Expectations** consente di scrivere input, risposte tipizzate, esiti e ordine delle chiamate senza ricavare l'atteso dal generatore. **Implement Feature** usa il percorso revisionabile di DAI-05; verifica, applicazione, reverse, spostamento, ripresa, recovery e undo condividono il journal.

Per un esempio CLI, copiare il modello e i criteri nelle posizioni `.ade/model.json` e `.ade/criteria.json` di una cartella nuova, poi usare `node ade/scripts/dai-project.mjs forward ROOT NEW_REPORT`. I comandi verify/apply/undo sono quelli del [progetto v1](project-v1.md); nessun account IA è richiesto. `node ade/scripts/dai-model.mjs normalize-frames INPUT NEW_OUTPUT` converte esplicitamente l'alias region in critical senza sovrascrivere l'input. I vecchi v2/v3 non cambiano.

Il contesto mantiene sempre contratto e revisione delle ref; il corpo indipendente si richiede esplicitamente. La generazione di un modulo che incorpora le sotto-interazioni richiede i loro corpi. Una modifica dell'enum include tutti i consumer interessati. Intento, baseline, profilo, fonti, scope, sigilli e budget 192 KiB/64 KiB rimangono governati dal compilatore comune. Il reverse prova l'intero runtime e il piano dati; non deduce intenzioni dal codice arbitrario né modifica ADR o tipi. Il protocollo di trasformazioni IA generiche continua a essere limitato ai costrutti implementati nei rispettivi adapter; questo percorso è deterministico e registra zero inferenze.

Non sono implementati macchine a stati, broker, DB, migrazioni dati runtime, secondo stack o modalità continua. Il renderer provato in Chromium e i servizi nativi con dipendenze iniettate non certificano il desktop completo.

L'estensione [DAI-07 · stati v1](states-v1.md) porta lo stesso percorso al profilo Node ESM revisione 4 con macchine piatte, contesto selettivo, criteri indipendenti e checkpoint quiescenti. I limiti descritti sopra restano riferiti alla consegna originaria.

Estensione DAI-08: [messaggistica v1](messaging-v1.md) e [ADR 0011](../decisions/0011-jetstream-messaging.md) aggiungono topologie/policy e collegamenti tipizzati nel profilo revisione 5; prove reali del broker restano separate dal runner di progetto.
