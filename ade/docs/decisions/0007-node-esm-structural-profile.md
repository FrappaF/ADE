<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0007 · Primo profilo Node ESM

Stato: adottato per DAI-04/S10 iniziale, 9 novembre 2026. Risolve D04 per il primo stack; broker e secondo archetipo restano DAI-08/11.

Il registro fidato del prodotto espone `node.esm`, revisione `1`, runtime Node **24.22.1**, linguaggio ECMAScript modules, framework **nessuno**. Il primo target è una libreria di dominio con contratti e predicati puri: non richiede server HTTP, ORM, broker o dipendenze installate implicitamente. La toolchain coincide con quella disponibile e verificata nel repository. Il PIM conserva ID, tipi e business rule; un binding PSM esplicito associa `node-esm` al container application/service. Storage, SPA, mobile e messaging richiedono profili/capacità ulteriori.

Il descrittore è versionato e restituito in copia. Runtime, mapping, capacità, layout sorgenti/test, dipendenze ammesse, convenzioni degli errori e runner entrano nel sigillo. Le modifiche del descrittore serializzato non registrano nuove capacità. Il runner previsto è l'eseguibile fidato `node` con argomento `--test`, senza shell; i predicati generati non contengono I/O o import. L'isolamento e la pubblicazione di un intero progetto vengono attuati in DAI-05: questo sprint non dichiara un sandbox di progetto già operativo.

Mapping iniziale: string → string; boolean → boolean; integer → number con controllo safe integer. Record, enum, collection e reference restano contratti espliciti del contesto; i mapping produttivi dei relativi sorgenti verranno verificati con DAI-05. Le firme degli errori sono risultati taggati dichiarati; nessun retry, compensazione o conversione in eccezione implicita. Moduli condivisi non distribuibili diventano package ESM con dipendenze dichiarate; la allowlist iniziale di dipendenze esterne è vuota. Layout `src/<id assegnato dal tool>.mjs`, `test/<id assegnato dal tool>.test.mjs`; i nomi di visualizzazione non sono percorsi.

| Capacità | DAI-04 |
| --- | --- |
| Contesto strutturale e contratti di chiamata | Implementato |
| Predicati puri: type check, simulazione, emissione ESM e test | Implementato |
| Creazione progetto, analisi/reverse e forward produttivo | Non supportato fino a DAI-05 |
| Stati, frame eseguibili, asincronia, persistenza, migrazioni | Non supportato; richiede incremento pertinente |

La readiness strutturale non autorizza generazione o pubblicazione. I percorsi legacy M4–M6 continuano a rifiutare la riscrittura v4. Nessuna inferenza live è necessaria per selezionare il profilo o preparare il contesto.
