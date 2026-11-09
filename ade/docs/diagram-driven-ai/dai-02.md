<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-02 — Fondazione semantica consegnata

Consegna dell'incremento I0 sulla revisione `05c3a0f0`, proseguendo le modifiche locali DAI-01. S01/S02 sono consegnati; S11/S14/S15 sono avviati nel perimetro previsto. R01–R16 restano accettazioni di release aperte. Il [contratto v4](schema-v4.md) e la [scheda DAI-03](handoff-dai-03.md) descrivono API e prosecuzione; la [matrice](coverage.json) conserva separatamente baseline storica e incremento corrente.

## Criteri di uscita

| Criterio | Responsabile | Evidenza osservata |
| --- | --- | --- |
| DAI-02.1 | domain | Schema v4 generato/versionato identico; ID per campi, operazioni, occorrenze e frame; ownership, feature e viste distinte; mapping e annotazioni conservati |
| DAI-02.2 | domain | Conoscenza tipizzata; producer/revision e quattro provenienze; accettazione separata dalla verifica con check/revisione; conversioni di trasporto provate per entrambi i provider |
| DAI-02.3 | domain/quality | V2/v3 leggibili, migrazione esplicita senza perdita e idempotente, fixture originali intatte e copie v4 separate; CLI legacy rifiuta v4 senza output; hash invariato su geometria/raggruppamento |
| DAI-02.4 | domain/engine | Validazione a livelli e readiness per target/profilo; negativi indipendenti, diagnostiche azionabili e grammatica dalle stesse definizioni; una bozza indipendente non blocca un target completo |
| DAI-02.5 | engine/workbench | API comuni per ispezione CLI, adapter IA e workbench; primo pacchetto di definizioni sigillato; migrazione nativa con undo/redo, salvataggio e riapertura delle bozze |

Le nuove sequenze conservano una dichiarazione di ordine; le sequenze migrate non ricevono risposte, occorrenze o frame inventati. Frame `unspecified`, parent legacy ambigui e fatti non risolti restano visibili e bloccanti. Vincoli ADR contraddittori sono un input del motore di diagnostica; repository, storia e authoring degli ADR sono ancora S09.

La creazione visuale v4 registra le membership; proprietà e mappa condividono le identità. Le API distinguono modifiche di owner, membership, binding e asserzioni. Il pannello di recupero consente di salvare e correggere le bozze referenzialmente incoerenti senza renderizzarle come grafi validi. Gli editor visuali completi dei nuovi campi proseguono in DAI-03/S14.

## Prove eseguite

| Prova | Esito e limite |
| --- | --- |
| `node --test ade/test/*.test.mjs` | 115 passati, zero falliti/skipped; 22 nuovi test di fondazione, oltre ai contratti legacy e alla baseline |
| `npm --prefix ade/ai test` | 32 passati; include tre nuove prove che i percorsi legacy rifiutano v4 senza scritture/chiamate incompatibili e che lo schema supera un meta-validatore JSON Schema indipendente |
| `npm --prefix ade/code-import test` | 169 passati, zero falliti/skipped; regressioni su parser, identità, snapshot, Sync, riconciliazione e contesto registrato |
| `adeProjectService.test.ts` | 36 passati; servizio, documento testuale e undo reali, filesystem in memoria. Tre nuove prove: upgrade annullabile, bozza recuperabile e formato futuro rifiutato |
| TypeScript | Check dei pacchetti `ade/ai` e `ade/code-import` riusciti; check mirato strict/no-unused/erasable del dominio e dell'editing riuscito |
| Schemi e artefatti | Esportazione deterministica v2/v3/v4, round trip, hash e byte dei pacchetti verificati; link e riferimenti della copertura controllati |

La suite del servizio è stata eseguita in Node con trascrizione TypeScript e caricamento dei sorgenti, usando Mocha e Sinon reali in un'installazione temporanea, senza sostituire renderer o globali DOM. È una prova del servizio/documento, non della superficie desktop. Nel checkout preparato per lo sviluppo la medesima suite è eseguibile dal runner unitario upstream con `scripts/test.sh --run src/vs/workbench/contrib/ade/test/browser/adeProjectService.test.ts`.

Non sono stati eseguiti build desktop, prove grafiche/accessibilità, inferenze live o applicazioni generate sul nuovo dominio. Le verifiche storiche M2/M3/M5/M6 restano distinte. I test IA usano provider simulati e repository temporanei, non un account reale. Il corpus v1 resta congelato: i negativi `invalid-reference`, `unknown-technology`, `undeclared-external`, `unsupported-type`, il controllo normalizzato `adr-conflict` e `conservative-migration` hanno adapter locali del sottoinsieme; gli scenari applicativi futuri non sono dichiarati passati.

## Misure ripetibili

Il [report finale v4](../benchmarks/dai-02-schema-validated-2026-11-08.json) usa gli stessi grafi 64/256/1024 e gli stessi input di evidenza di [DAI-01](../benchmarks/dai-01-2026-11-08.json), migrati senza cambiare elementi, relazioni o geometria. `sourceGraphSha256` permette il confronto indipendente; i nuovi ID del benchmark provengono da una factory di fixture ripetibile, non da nomi/percorsi. Policy e corpus hanno gli stessi hash congelati. Linux x64, Node 24.22.1, AMD EPYC 9V74, quota 2 CPU e 8 GiB; tre warmup, venti campioni, p95.

| Elementi | Validazione p95 ms | Edit p95 ms | Impatto p95 ms | Packing p95 ms | Evidenze UTF-8 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 64 | 0,986 | 1,783 | 0,327 | 0,164 | 17 087 B |
| 256 | 3,426 | 6,967 | 0,753 | 0,385 | 70 396 B |
| 1024 | 9,583 | 27,459 | 13,107 | 0,983 | 284 875 B |

Latenze e RSS massimo di **145,14 MiB** rispettano i budget locali. Le sole evidenze del caso grande superano **196 608 B**, prima di istruzioni/schema/grafo: il limite resta fallito e aperto per S11. Non è stato aumentato. Il packing conserva esattamente i range; questo non misura recall o sufficienza semantica. Token reali, prezzo e recall restano `null`, chiamate provider zero.

Il report registra gli hash delle sorgenti effettivamente misurate, dopo la validazione indipendente dello schema distribuito. Il report DAI-01 non è sovrascritto. Queste misure locali non costituiscono una serie statistica di prestazioni desktop.

```sh
npm run ade:dai:baseline -- --v4 --output /tmp/dai-v4-new-report.json
```

## Primo pacchetto IA

Il [pacchetto riproducibile](../benchmarks/dai-02-sealed-context.json) contiene **22 698 B** di input effettivo: istruzioni, definizioni, identità, profilo e grammatica. Il sigillo è SHA-256 sui byte del campo `bytes`; una modifica semantica o di profilo invalida la review, una modifica di solo layout la conserva. Un budget di un byte inferiore al necessario blocca la compilazione. Un riferimento necessario non risolto non è omesso silenziosamente.

Il profilo `fixture.spec` descrive capacità di test sul [modello indipendente](../../examples/dai-foundation.ade.json); non è uno stack o un generatore produttivo. Nessun archetipo produttivo viene registrato in questo sprint. Il pacchetto è il primo contratto di definizioni: contesto minimo per delta, consumer impattati, sorgenti, retrieval e recall saranno estesi da DAI-04/S11. I blocchi su M4–M6 impediscono di trattare v4 come il vecchio modello e perdere i nuovi record.

DAI-03 può quindi iniziare da una fondazione conservativa e verificata, mantenendo aperte generazione, runtime e accettazione finale nelle relative milestone.
