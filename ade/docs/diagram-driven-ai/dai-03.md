<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-03 · Blueprint strutturale

Consegnato il 9 novembre 2026 nel perimetro strutturale I1: S03/S04/S09 e incrementi S11/S14/S15. HEAD locale `05c3a0f0`; DAI-01/02/03 restano modifiche locali, non una revisione integrata. Il [contratto blueprint](blueprint-v4.md), gli [attesi registrati prima dell'implementazione](dai-03-acceptance.md) e la [matrice](coverage.json) delimitano la consegna. R01–R16 restano aperti per l'accettazione completa della release.

| Criterio | Responsabile | Risultato ed evidenza |
| --- | --- | --- |
| DAI-03.1 · Scope e gerarchia C4 | domain | Soggetti L1/L2 governati, L3 con un solo owner, esterni dichiarati e mai target di implementazione; moduli non distribuibili e consumer espliciti. Negativi per owner improprio, dipendenza esterna senza dichiarazione e provider ambiguo in `dai-blueprint.test.mjs` |
| DAI-03.2 · Navigazione e proprietà | workbench | Persona/sistema → container → componente → contratto tramite riferimenti, breadcrumb e comandi semantici distinti dallo zoom. Dettagli, lettura accessibile e contesto esterno senza nuove identità. Dialoghi/servizio documentale e quattro test del renderer in Chromium reale |
| DAI-03.3 · Tipi e contratti condivisi | domain/workbench | Primitive, record, enum, collezioni, riferimenti, vincoli; operazioni, errori tipizzati, permessi/effetti dichiarati e criteri; interfacce/porte, compatibilità direzionale e overload; contratti di trasporto e mapping distinti. Negativi indipendenti e proiezioni condivise; modifiche di firma cambiano il sigillo e mostrano consumer/occorrenze |
| DAI-03.4 · ADR dei progetti | domain/workbench | [D06/ADR 0005](../decisions/0005-project-adr-constraints.md): numero, ragioni, scope, revisione, storia, stati e sostituzione. Revisione ottimistica, salvataggio/undo/riapertura; documenti sullo sviluppo di ADE separati |
| DAI-03.5 · Vincoli e contesto | engine/workbench | Vincoli scalari tipizzati `equals/notEquals`, conflitti senza precedenza, proposta contraria respinta anche se prova a cancellare l'ADR; inattivi/estranei esclusi. Chiusura conservativa delle definizioni, byte reali, sigillo e blocco oltre budget |

## Verifiche osservate

| Livello | Comando/percorso | Risultato |
| --- | --- | --- |
| Dominio/CLI/corpus | `node --test ade/test/*.test.mjs` | 140 test passati, inclusi 25 casi blueprint; corpus e budget v1 invariati |
| Adapter IA/regressioni | `npm --prefix ade/ai test` | 33 test passati; Ajv2020 strict indipendente sullo schema esportato e blocco delle proposte normative |
| Import/Sync legacy | `npm --prefix ade/code-import test` | 169 test passati; nessuna abilitazione implicita di v4 |
| Dialoghi, documento, lettura | Suite Mocha sorgenti `adeProjectService`, `adeBlueprintEditing`, `adeBehaviorEditing`, `adeAccessibleContent` | 61 test passati; text model, filesystem in memoria e undo nativo reali; dialoghi scriptati al confine del servizio |
| Renderer | `adeBlueprintDetails.test.ts`, bundle delle sorgenti e Mocha in Chromium 154.0.8037.57 via Playwright | 4 test passati: drill-down/focus, firma/presenza/null, contesto esterno, ragioni/storia ADR. Nessun DOM simulato |
| Tipi e schema | Check package IA/import; check strict mirato del dominio e diagnostiche TypeScript dei file browser/test modificati | Riusciti; schema generato identico, v2/v3 conservati, `git diff --check` riuscito |

Totale delle suite dichiarate: **407 test passati**. Le prove Mocha sul servizio non sono un lancio desktop. Le prove Chromium eseguono il renderer reale in un harness locale; non certificano shell Electron, temi, screen reader, finestra stretta o percorso completo nuovo progetto → runtime. Le verifiche storiche ancora aperte restano tali.

Il [registro delle verifiche](../benchmarks/dai-03-verification-2026-11-09.json) lega suite, runtime e sorgenti; il [benchmark sui grafi congelati](../benchmarks/dai-03-2026-11-09.json) conserva hardware, hash e soglie v1. Il packing delle sole evidenze sul grafo grande continua a superare 192 KiB: nessuna soglia viene alzata e questo non è un risultato di sufficienza del contesto.

Il [pacchetto blueprint sigillato](../benchmarks/dai-03-sealed-context.json) misura **50.431 byte UTF-8**, con target `operation.confirm` e il solo profilo di specifica `fixture.spec`. Contiene tre definizioni di operazione, tipi/errori risolti, contratti di trasporto, porte/connessione, modulo condiviso e ADR applicabile; il test ne confronta i byte correnti. Un byte oltre il budget assegnato blocca la compilazione. Le revisioni storiche nel record sono dati non normativi; solo i vincoli correnti accettati si applicano. Il pacchetto DAI-02 rimane evidenza storica immutata, con sigillo ricontrollato senza pretendere una grammatica identica a quella successiva.

## Limiti e prossimo incremento

Nessuno stack produttivo scelto, nessun generatore v4 registrato, nessuna inferenza live né provisioning/deploy. Condizioni, invarianti ed effetti dichiarati non diventano codice eseguibile per sola validità JSON. Gli adapter M4–M6 continuano a rifiutare v4 prima di scritture incompatibili. S11 resta una chiusura conservativa di definizioni: selezione minima, evidenze sorgente, retrieval, consumer consultivi, protocollo di output, token/costi e recall si completano negli sprint assegnati. S14/S15 proseguono con accessibilità e desktop completi.

Il prossimo sprint è [DAI-04](handoff-dai-04.md): primo sottoinsieme di espressioni, primo archetipo versionato e compilatore di contesto completo per la parte strutturale. La scelta dello stack richiede una decisione concreta in D04; il profilo di test non la anticipa.
