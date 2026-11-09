<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Handoff DAI-01 → DAI-02

La scheda applica il contratto del piano §10. Non occorre reinviare il piano completo a ogni inferenza. La revisione di ingresso è `05c3a0f0`; prima del prossimo sprint registrare anche la revisione che integra DAI-01. I ruoli `domain`, `engine`, `workbench`, `quality` individuano responsabilità, non persone già assegnate.

## Consegna DAI-01

| Criterio | Responsabile | Stato | Evidenza |
| --- | --- | --- | --- |
| DAI-01.1: baseline e inventario collegati a schema, servizi, UI e prove | quality | Consegnato | [Baseline](baseline.md), [copertura](coverage.json), README corretto; prove storiche separate dalle esecuzioni locali |
| DAI-01.2: lessico senza equivalenze Docker/container e ownership/feature | domain | Consegnato | [Glossario normativo](glossary.md) |
| DAI-01.3: input e risultati attesi indipendenti prima della generazione | quality | Consegnato | [Corpus v1](corpus.v1.json), stato `pending-adapters`; nessun caso di business futuro dichiarato passato |
| DAI-01.4: dimensioni/hardware/budget fissati e baseline ripetibile | quality | Consegnato | [Budget v1](budgets.v1.json), [runner](../../scripts/benchmark-dai.mjs), report collegato dalla baseline |
| DAI-01.5: decisioni e scheda del prossimo sprint | domain/quality | Consegnato | [Registro](decisions.md), [ADR v4](../decisions/0004-diagram-driven-schema-v4.md), presente scheda |

R14/R16 e S15 restano aperti per l'accettazione di release. La consegna di S00 non chiude il resto dell'incremento I0, che comprende ancora DAI-02.

## Scheda DAI-02: fondazione semantica

1. **Requisiti e comportamento:** R01, R02, R09, R15, R16; S01/S02 e primo S11/S14/S15. Prima: v2/v3, tipi e tecnologia testuali, validazione generale. Dopo: v4 migrabile, provenienza/conoscenza esplicite, readiness per target con diagnostica utilizzabile e primo pacchetto riproducibile. Non implementare in questo sprint stack, frame completi o generazione di un'applicazione.
2. **Revisione e riuso:** verificare HEAD e stato locale. Riutilizzare `semanticModel.ts`, `visualEditing.ts`, `modelImpact.ts`, persistenza e undo di `adeProjectService.ts`; confrontare il [registro](coverage.json). M5 e M6 conservano capacità distinte. I verbali M2/M3/M5/M6 non diventano prove rieseguite.
3. **Invarianti/decisioni:** D01 e ADR 0004 vincolanti, D06/D07/D08 applicabili. Identità e annotazioni conservate, `legacy-unclassified` consultabile, nessuna inferenza di default. Layout separato dall'hash semantico. Ignoto, omesso, vuoto, `null` e `false` distinti. D04 resta aperta: non scegliere uno stack nella migrazione.
4. **Scope consentito:** dominio in `src/vs/workbench/contrib/ade/common/`; adattamenti circoscritti di servizi/browser e adattatori IA; schemi in `ade/schema`; migrazioni, esempi e test. Conservare codice personalizzato e fixture legacy originali; aggiungere fixture migrate separatamente. Nessun deploy, migrazione di dati utente in-place o modifica di codice non pertinente.
5. **Contesto minimo:** selezionare tipi, lettori, scrittori e test coinvolti con provenienza/revisione; usare il [budget v1](budgets.v1.json). Esplicitare esclusioni di renderer/provider non pertinenti. Nessun hash locale, handle o dettaglio di protocollo nella normale UI. Se il contesto obbligatorio non entra, suddividere il task o bloccarlo, senza omissioni silenziose.
6. **Accettazione indipendente:** `conservative-migration`, `invalid-reference`, `unknown-technology`, `undeclared-external`, `unsupported-type`; aggiungere fixture per ID duplicati, ownership, provenienza e conversioni provider. Dimostrare lettura v2/v3 senza perdita, idempotenza, rinomina stabile, rifiuto del lettore incompatibile senza scrittura, schema generato identico, hash invariato su layout, target indipendente in bozza che non blocca gli altri, byte riproducibili del pacchetto. Conflitto ADR come input di diagnostica, senza anticipare tutto il repository ADR S09. Test adeguati a dominio, adapter e workbench; rieseguire la baseline sugli stessi grafi senza sovrascrivere il report v1.
7. **Proposta, blocchi, review/recupero:** consegnare una patch circoscritta con diff schema/migrazione e report delle prove realmente osservate. Una scelta di significato assente o perdita di dati blocca la migrazione; nessuna riscrittura distruttiva per farla passare. Le bozze si salvano, le operazioni superate non si applicano; review su revisione coerente e percorsi di undo/recovery esistenti. Non marcare `generationReady` sulla sola validità JSON o mostrare `passed` senza controllo identificato.

Ogni sprint successivo copia questa struttura con i propri ID e scope, aggiornando responsabilità, decisioni, prove attese e blocchi. Il [registro S00–S15](coverage.json) conserva gli step futuri nello stato pianificato.
