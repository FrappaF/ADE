<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-11 — Attesi prima dell'implementazione

9 novembre 2026 (Europe/Rome). Secondo archetipo: Bun ESM 1.3.2, confrontato con Node ESM 24.22.1 revisione 5. Due runtime, stesso linguaggio e stessi emitter: non sono due linguaggi, framework o database. Il perimetro produttivo resta quello esplicitamente delimitato in DAI-05–10.

| Criterio | Atteso indipendente / negativo |
| --- | --- |
| PIM invariato | Cambio atomico dei soli binding PSM; tutti gli ID, scenari, attori, criteri, task e layout identici; nessuna scelta implicita per modelli misti o ignoti |
| Piano | Implementazione, dipendenze, checkpoint/dati esistenti, test, deployment e ritorno espliciti nella review sigillata; nessuna migrazione di servizio vivo |
| Due runner | Runtime esatto verificato; Bun mancante/versione diversa blocca; nessun fallback Node presentato come prova Bun; ambiente vuoto, codice emesso fidato, timeout/cancellazione/output limitato |
| Business | Stesse fixture e attesi authored di quantità, checkout/interazioni, stati e asincronia su entrambi i runtime; test derivati distinti dagli indipendenti; regola errata bocciata |
| Portabilità | Null/missing, safe integer e overflow, errori, tutti i frame, concorrenza/cancellazione; nessuna transazione esterna o exactly-once inventata |
| Round trip | Bootstrap, modifica visuale, reverse delimitato, conflitti, create/move/rename/delete annidati e permessi, indice perso, undo e crash recovery col journal comune |
| Continuità | Stessa coda opt-in, coalescing e budget preventivo; cambio PSM invalida packet/review; nessuna pubblicazione automatica |
| Dati | Checkpoint quiescente passato realmente Node→Bun→Node senza riavviare entry/effect; input corrotto/incompatibile rifiutato; precondizioni e ritorno conservano il documento originale; ledger locale riaperto sotto entrambi |
| Broker | Client 2.29.3 e server JetStream 2.11.9 reali isolati; queue/topic, retry/DLQ e dedup/persistenza verificati separatamente dalla simulazione |
| Workbench | Selezione guidata del runtime con piano, edit atomico undoabile, readiness e contesto sul profilo effettivo, tecnologia L2 e review leggibili/accessibili |

Desktop completo, screen reader reale, provider live e accettazione finale R01–R16 appartengono a DAI-12. Un criterio obbligatorio senza prova resta aperto.
