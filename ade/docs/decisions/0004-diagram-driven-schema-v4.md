<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0004 — Nuova versione semantica per Diagram-Driven AI

Stato: adottata in DAI-01 l'8 novembre 2026, prima di S01. Responsabile di attuazione: ruolo `domain`; verifica indipendente: ruolo `quality`. Attuata nel perimetro iniziale da [DAI-02](../diagram-driven-ai/dai-02.md). Questa è una decisione sullo sviluppo di ADE, non un ADR da applicare ai progetti utente.

## Contesto

La baseline `05c3a0f0` legge `SemanticModel.version: 2 | 3`. `parentId` non separa ownership e feature; membri e campi sono identificati per nome; sequenze e stati usano relazioni e viste generiche. Introdurre nuovi significati incompatibili come campi facoltativi v3 renderebbe ambiguo ciò che un vecchio lettore può conservare. S01 richiede anche conoscenza incompleta, provenienza e identità referenziabili.

## Decisione

Implementare **schema v4** in DAI-02, conservando lettori e fixture v2/v3 e introducendo una migrazione esplicita, conservativa e idempotente. Versione del modello e versione dei protocolli IA restano indipendenti. Il [contratto v4 di S01](../diagram-driven-ai/schema-v4.md) è implementato con schema versionato e lettori legacy conservati. Gli archetipi di generazione restano successivi.

Mantenere la persistenza JSON e le sezioni logiche del piano §5.1. Dominio, validazione, migrazione e serializzazione canonica restano in `common/`, senza Node/Electron/browser. Non introdurre database a grafo, shard o indici persistenti prima di misure che li giustifichino.

Gli ID esistenti di elementi/relazioni/viste/mapping rimangono invariati. Per oggetti prima privi di identità, creare ID una sola volta nella migrazione e persisterli: non ricalcolarli da nomi, percorsi o ordine degli array. È ammessa una sorgente di ID iniettata dal chiamante; il dominio non legge il filesystem e una seconda migrazione v4 non ne alloca altri.

Conservare annotazioni, mapping, evidenze, layout e `legacy-unclassified`. Non indovinare ownership ambigua, tecnologia, nullabilità, risposte, frame o intenzioni di business. Le ambiguità migrano come conoscenza non risolta con diagnostica pertinente; una bozza resta salvabile. L'ordine legacy va conservato come dichiarazione legacy, senza certificarlo come comportamento eseguibile.

Separare hash semantico e layout. Un lettore incompatibile deve rifiutare v4 senza riscrivere il documento; la migrazione lavora su una copia e il salvataggio usa i meccanismi recuperabili esistenti. Il rifiuto del validatore attuale non sostituisce il futuro collaudo del percorso di apertura/salvataggio.

## Conseguenze e prova attesa

S01 consegna tipi, schema generato/versionato, conversioni esplicite delle convenzioni dei provider e lettura v2/v3/v4; le prove sono nel [verbale DAI-02](../diagram-driven-ai/dai-02.md). Le fixture `conservative-migration` e `layout-only` del [corpus v1](../diagram-driven-ai/corpus.v1.json), gli esempi indipendenti e le prove negative su riferimenti/copertura devono dimostrare assenza di perdite, idempotenza, identità stabili, hash indipendente dalla geometria e rifiuto senza scrittura. S01 è consegnato sul perimetro di fondazione; le accettazioni di release R01/R09 rimangono aperte per i costrutti e gli archetipi successivi.

L'alternativa di estendere v3 è scartata per l'incompatibilità dei significati. Non si introduce una serializzazione binaria: il collo di bottiglia e la sufficienza del contesto vanno misurati separatamente dal formato di persistenza.
