<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Contratto semantico v4 — DAI-02–06

DAI-03 estende questa fondazione con il [blueprint C4, contratti e ADR](blueprint-v4.md); [DAI-04](context-v1.md) aggiunge predicati portabili opzionali e protocollo strutturale; i paragrafi seguenti distinguono la base iniziale dalle estensioni attuali.

V4 attua la [decisione 0004](../decisions/0004-diagram-driven-schema-v4.md). Il dominio resta in `common/`, senza import di Node, Electron o browser. La fonte di tipi, schema e validazione è [semanticModel.ts](../../../src/vs/workbench/contrib/ade/common/semanticModel.ts); lo [schema distribuito](../../schema/model-v4.schema.json) è rigenerato con `npm run ade:schema`. Gli schemi v2/v3 restano identici.

## Identità e sezioni

Gli ID esistenti di modello, elementi, relazioni, viste, mapping e verifiche restano invariati. V4 richiede anche `behavior.id`, gli ID dei campi di input/output e gli ID dei membri. Un comportamento condiviso o un membro `method` è una definizione di operazione; `foundation.occurrences[].operationId` vi fa riferimento. Più occorrenze possono chiamare la medesima operazione, con identità proprie. Firme, risultati ed errori condivisi sono in `foundation.blueprint.operations` (S04); argomenti dinamici, espressioni e frame eseguibili sono descritti nel [contratto DAI-06](interactions-v1.md); `execution` opzionale conserva la compatibilità delle bozze storiche. Le viste di sequenza possono legare esplicitamente `interactionId`.

Le namespace sono esplicite: ad esempio `{ kind: 'field', id: 'field.requestId' }`. Gli ID legacy riutilizzati in namespace differenti non vengono rinominati. I duplicati dentro la stessa namespace sono errori; campi e operazioni sono univoci fra le rispettive definizioni.

| Campo | Autorità e limite iniziale |
| --- | --- |
| `semantics.elements/relations` | Definizioni condivise e relazioni del grafo; `classification: legacy-unclassified` resta consultabile e non generabile |
| `foundation.ownership` | Owner univoco per elemento, con ruolo `architecture` o `lifecycle`; controlli di riferimenti, ruolo, duplicati e cicli |
| `foundation.memberships` | Appartenenza trasversale alle feature; non modifica l'owner e ammette più feature |
| `foundation.integrations` e `element.scope` | Sistemi `governed/external` e accessi consumer→esterno dichiarati; contratti C4 più completi in S03/S04 |
| `foundation.types` | Primo registro di record con campi referenziabili e `typeId`, compresi riferimenti ricorsivi; le stringhe di tipo legacy rimangono conservate |
| `foundation.occurrences/frames/interactions` | Identità distinte dalle relazioni strutturali; frame iniziali `unspecified`, sempre incompleti per la generazione |
| `foundation.assertions` | Asserzioni su oggetto/campo JSON Pointer, conoscenza, provenienza e accettazione; verifica separata |
| `foundation.platform.bindings` | Binding per elemento/profilo, con tecnologia esplicitamente conosciuta oppure irrisolta; nessuno stack predefinito |
| `foundation.decisions` | Vincoli normalizzati, scope e stato; confronto di valori, senza precedenza implicita. S09 aggiunge `record` con numero, motivazioni, stati e storia |
| `views` | Riferimenti e geometria; nessuna copia autonoma dei contratti |
| `codeMappings/verifications` | Evidenze legacy conservate; la lettura non prova l'esecuzione corrente di un controllo |

`parentId` resta un dato legacy, non un alias implicito dell'ownership v4. La migrazione riconosce appartenenze dirette a feature e lifecycle espliciti stato→risorsa; gli altri parent restano conservati e segnalati in `foundation.migration.unresolvedOwnershipIds`. Le nuove API di editing distinguono `ownership` e `membership`. Impatto, mappa e riferimenti alle viste utilizzano i relativi record; il percorso visuale C4 è esteso da [DAI-03](blueprint-v4.md).

## Conoscenza e prove

`Knowledge` è l'unione `{ state: 'unknown', reason }`, `{ state: 'omitted' }`, `{ state: 'known', value }`. In questo contratto iniziale `value` è scalare JSON, incluso `null`; `false`, `''` e `null` restano distinti. Le normali collezioni vuote dello schema restano collezioni note, senza attribuire loro contenuti inventati.

Ogni nuova asserzione dichiara `authored/extracted/inferred/observed`, produttore e revisione. `acceptance` conserva stato e revisione dell'intento. `verification`, quando presente, richiede controllo, revisione, esito ed evidenza. La verifica non accetta automaticamente una proposta. Asserzioni accettate discordanti oppure non corrispondenti al dato di dominio bloccano il target; la migrazione non inventa la provenienza degli autori legacy.

[modelKnowledge.ts](../../../src/vs/workbench/contrib/ade/common/modelKnowledge.ts) converte esplicitamente due convenzioni di trasporto: envelope con slot richiesti e nullable per Codex, unione esplicita/scalare per Claude. Il significato di uno slot `null` scalare è una policy dichiarata, mai dedotta dalla sua falsità. Queste sono conversioni di confine provate localmente; non attestano un collaudo live dei provider sul nuovo formato.

## Lettura, migrazione e salvataggio

`readSemanticModel` rimane il confine rigoroso di schema, riferimenti e dominio. `readSemanticDraft` ammette bozze v4 con riferimenti incompleti, conservando una forma JSON non ambigua; la diagnostica resta disponibile. `SemanticModelService` usa questo percorso per le bozze v4 e conserva il confine rigoroso per v2/v3.

`migrateSemanticModelToV4` opera su una copia v2/v3 valida. Gli ID nuovi provengono da una factory iniettata o da UUID, sono allocati una volta e persistiti. Non dipendono da etichette, percorsi o posizione. Su un input v4 non alloca altri ID. Ordini legacy delle sequenze sono copiati in `legacyRelationOrder`; nessuna risposta, occorrenza o frame è inventata. Se non si possono conservare dati o identità, la migrazione fallisce prima della scrittura.

```sh
npm run ade:dai:model -- migrate ade/examples/checkout.ade.json /tmp/checkout-v4.json
npm run ade:dai:model -- inspect /tmp/checkout-v4.json checkout-controller
```

La destinazione deve essere nuova; gli input e le destinazioni esistenti non sono sovrascritti. La CLI legacy `migrate-model.mjs` mantiene il proprio contratto v1/v2/v3 e rifiuta v4 prima di creare l'output.

Nel workbench i nuovi progetti usano v4. L'apertura di v2/v3 ne conserva il formato; **A.D.E: Upgrade Model to Version 4** è una transazione sulla cronologia testuale nativa, salvata soltanto su richiesta. Undo/redo ripristinano gli stessi ID. Una bozza v4 con errori referenziali si salva e si riapre; il pannello di recupero espone i problemi e **Edit Model Specification**, evitando di passare un grafo incoerente ai renderer. Le scelte di tecnologia mancanti, pur strutturalmente valide, sono mostrate nelle proprietà. DAI-03 aggiunge i dialoghi **Edit Structural Blueprint** e **Project Architecture Decisions**; S14 prosegue sul percorso completo.

## Canonicalizzazione, readiness e contesto

`canonicalJson` ordina le chiavi degli oggetti e conserva l'ordine degli array. Rifiuta valori non JSON che andrebbero persi. `serializeSemanticModel` include il documento completo. `hashSemanticModel` usa SHA-256/WebCrypto su una proiezione senza geometria, con soggetto e scope C4 quando dichiarati, conservando gli ordini dichiarati delle sequenze legacy e il resto della specifica/evidenze. Spostamento e raggruppamento visuale non invalidano la revisione semantica.

[modelReadiness.ts](../../../src/vs/workbench/contrib/ade/common/modelReadiness.ts) espone `validateModelLayers` e `getModelReadiness`. Sintassi, riferimenti, invarianti di dominio e regole di generazione sono distinti. Il rapporto è calcolato per un elemento, operazione o campo e per un profilo fidato. Contiene `draft/structurallyValid/generationReady`, scope, diagnostiche con codice, severità, fase, oggetto/campo e azione; i problemi estranei rimangono in `projectDiagnostics`. Lo stato non è scritto nel modello e non è uno stato dell'operazione.

I profili vengono da adapter registrati dal tool, mai da un'affermazione del provider. DAI-02 non registra un generatore produttivo: la CLI di ispezione segnala il profilo mancante. I negativi indipendenti coprono riferimento inventato, tecnologia ignota, esterno non dichiarato, tipo non supportato e decisioni contraddittorie. Le stesse definizioni di schema, capacità e regole alimentano la grammatica del primo contesto.

[modelContext.ts](../../../src/vs/workbench/contrib/ade/common/modelContext.ts) produce il primo pacchetto S11: definizioni necessarie, tabella delle identità, profilo/revisione, grammatica e istruzioni in byte UTF-8 canonici. Riferimenti mancanti o budget insufficiente bloccano la compilazione; non si tronca il payload. Il sigillo SHA-256 e `assertModelContextCurrent` vincolano review e byte correnti, accettando un cambiamento di solo layout. Il [pacchetto di esempio](../benchmarks/dai-02-sealed-context.json) usa soltanto un profilo di capacità di test.

Workbench e [adapter IA](../../ai/diagramDriven.ts) usano le stesse API. Selezione minima, consumer impattati, sorgenti, retrieval e misure di sufficienza arriveranno con le estensioni S11: questo pacchetto di definizioni non certifica un task completo di implementazione. I percorsi legacy di generazione, Sync, riconciliazione e ricostruzione diagrammi rifiutano v4 prima di chiamate o riscritture incompatibili.

DAI-07 aggiunge `foundation.stateMachines` opzionale e `view.stateMachineId` sulle viste stati, con contratti, eventi, azioni, trigger/guardie, entry/exit/do e persistenza espliciti: [stati v1](states-v1.md). Le notazioni legacy non ricevono capacità eseguibili implicite.

Estensione DAI-08: [messaggistica v1](messaging-v1.md) e [ADR 0011](../decisions/0011-jetstream-messaging.md) aggiungono topologie/policy e collegamenti tipizzati nel profilo revisione 5; prove reali del broker restano separate dal runner di progetto.
