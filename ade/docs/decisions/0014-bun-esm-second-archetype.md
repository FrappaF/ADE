<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0014 — Bun ESM come secondo archetipo

Stato: accettata per il perimetro DAI-11. Data: 9 novembre 2026 (Europe/Rome).

Il secondo stack è Bun ESM 1.3.2, profilo `bun.esm` revisione 1. Il primo `node.esm` revisione 5 resta byte-identico nel descrittore. La differenza verificata è il runtime e il test runner, non il linguaggio o un framework. La condivisione degli emitter evita divergenze accidentali della semantica del PIM; le prove eseguono davvero entrambi i runtime.

Binding PSM espliciti e omogenei per il job; nessuna registrazione di profili da dati/provider. Cambio atomico dei binding con ID invariati, piano sigillato e nuova verifica obbligatoria. Storage limitato a checkpoint quiescenti v1 e ledger file dell'adapter locale: il cambio runtime non cambia formato o programma semantico. Dati esistenti si trasferiscono solo dopo stop/drain, copia verificata e backup; nessuna pubblicazione di file migra automaticamente dati vivi, broker o deployment.

Il runner Bun usa esclusivamente moduli ricostruiti dagli emitter fidati e attesi dati, senza eseguire codice custom, package scripts o test del progetto. Bun non offre le permission Node: ambiente vuoto, assenza di dipendenze nel runner, revisione runtime esatta, timeout/output/cancellazione limitati; nessuna dichiarazione di sandbox OS/rete. Node mantiene le proprie permission. L'eseguibile Bun è configurazione dell'host (`ADE_BUN_EXECUTABLE`, percorso assoluto), mai un campo nel modello/protocollo.

Il broker resta JetStream 2.11.9 con client nats 2.29.3. Concorrenza locale strutturata, integer sicuri, null esplicito, errori dichiarati e checkpoint devono superare gli stessi attesi. Non si promettono DB, transazioni distribuite, exactly-once o portabilità di codice custom. Migrazioni DB restano unsupported in entrambi i descrittori.
