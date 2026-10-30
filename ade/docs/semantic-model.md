# Modello semantico v2/v3 (M1 e M2.2)

Il contratto è implementato in `src/vs/workbench/contrib/ade/common/semanticModel.ts`. Non importa Electron, API del workbench, filesystem o framework. La shell nativa consuma lo stesso servizio, senza duplicare il validatore del dominio nel prototipo.

## Documento

Lo [schema JSON](../schema/model-v2.schema.json) usa JSON Schema 2020-12, identificatore `urn:ade:model:2`. Si genera con `npm run ade:schema`; i test confrontano l'artefatto con la definizione runtime. Lo schema descrive la struttura; i vincoli del grafo e i riferimenti sono verificati da `validateSemanticModel`.

L'editor M2.2 introduce lo [schema v3](../schema/model-v3.schema.json), identificatore `urn:ade:model:3`, con `views[].featureId` facoltativo e validato come riferimento a una feature. Il resto del dominio resta condiviso. I nuovi progetti sono v3; i documenti v1/v2 sono ancora apribili e un v2 passa a v3 alla prima modifica visuale, conservando identità e dati. La conversione è annullabile e viene scritta solo al salvataggio. Lo schema v2 resta invariato per i documenti storici; i client che supportano solo v2 rifiutano esplicitamente v3.

| Campo | Responsabilità |
| --- | --- |
| `version`, `id`, `name` | Versione del formato, identità e nome del progetto |
| `semantics.elements` | Intento progettuale: feature, actor, component, resource, view, controller, contract, action, state |
| `semantics.relations` | Relazioni tipizzate fra identificatori semantici |
| `views` | Proiezioni structure/activity/sequence/state: riferimenti, coordinate e relazioni visibili |
| `codeMappings` | Implementazione osservata: elemento, file, simbolo e revisione del codice |
| `verifications` | Evidenze di comportamento: elemento, criterio, esito, riferimento al risultato e revisione |

Una vista semantica (`kind: view`) rappresenta un'interfaccia del sistema. Una voce in `views` è invece una proiezione del modello: i due concetti hanno identità e responsabilità distinte. M1 definisce i formati delle proiezioni, senza implementarne gli editor UML.

M3.4 interpreta le viste `sequence` con il sottoinsieme descritto nell'[esploratore](semantic-explorer.md): `nodes` ordina i partecipanti da sinistra a destra e `relationIds` ordina le interazioni dall'alto al basso. Ogni relazione può comparire una sola volta; un partecipante è l'identità semantica esistente, non un'istanza runtime distinta. Le coordinate restano conservate nel documento ma il renderer di sequenza ricava la geometria dall'ordine e dalle etichette. Questa interpretazione non aggiunge campi né modifica lo schema v2/v3. Le altre proiezioni mantengono coordinate e riferimenti indipendenti.

Gli identificatori sono stringhe opache, indipendenti da nome, posizione e percorso del file. Sono univoci nel rispettivo insieme: elementi, relazioni, viste, mappature e verifiche. Accettano lettere ASCII, numeri, punto, trattino, underscore e due punti; il primo carattere è alfanumerico. Il chiamante assegna l'ID una volta e lo conserva nelle modifiche. Criteri di accettazione e codici di errore sono univoci all'interno dell'elemento che li dichiara.

`parentId` esprime contenimento semantico e non coordinate. Può riferirsi a feature, component, resource, controller o action. Sono vietati riferimenti mancanti e cicli. Gli stati dello stesso ciclo di vita condividono il contenitore.

## Relazioni

| Tipo | Origine | Destinazione |
| --- | --- | --- |
| `invocation` | actor, view, component, controller, action | view, component, controller, action, contract |
| `dependency` | Qualsiasi elemento | Qualsiasi elemento |
| `read`, `write` | component, controller, action | resource |
| `transition` | state | state con lo stesso `parentId`, anche entrambi assenti |
| `realization` | component, controller, action, resource, view | feature, contract |

La matrice è esposta da `isCompatibleRelation` per i futuri editor. Gli endpoint sono sempre ID di elementi. `condition` è testo dichiarativo e non viene eseguito. `errorCode`, quando presente, deve essere dichiarato dal comportamento dell'origine. Una proiezione può mostrare un sottoinsieme del modello; ogni relazione visibile deve avere entrambi gli endpoint nella stessa proiezione.

## Comportamenti ed evidenze

`behavior` è facoltativo; se presente contiene tutti gli insiemi, anche vuoti: input/output (`name`, tipo dichiarativo, obbligatorietà), pre/postcondizioni, errori, autorizzazioni e criteri `given/when/then`. Le autorizzazioni fanno riferimento a un elemento `actor`. Tipi e condizioni restano dichiarativi: non implicano esecuzione né controlli su uno specifico linguaggio.

Il progetto non ottiene automaticamente lo stato «implementato» da una mappatura o «verificato» da un criterio. Le mappature osservate e le verifiche sono raccolte separate. Ogni verifica deve riferirsi a un criterio esistente, conserva `passed`/`failed`/`unknown` e indica la revisione cui si riferisce. M1 verifica la coerenza di questi record; l'analisi dei file e l'esecuzione effettiva dei test appartengono a M4 e M7. Un risultato riferito a una revisione precedente non certifica il codice corrente.

L'[esempio acquisto](../examples/checkout.ade.json) copre tutti i tipi di elemento e relazione, contratto di pagamento, autorizzazioni, ordine, pagamento riuscito e rifiutato. È solo intento progettuale: non contiene mappature o verifiche inventate. Gli [esempi invalidi](../examples/invalid/) sono fixture `{ expectedCode, model }`; passare il campo `model` al validatore.

## API e diagnostica

- `validateSemanticModel(value)` restituisce diagnostiche `{ code, severity, path, args }` senza modificare il documento. Prima verifica lo schema, poi i vincoli semantici. Gli errori impediscono il caricamento; gli avvisi richiedono revisione ma conservano il modello.
- `readSemanticModel(value)` valida e restituisce una copia indipendente oppure solleva `InvalidSemanticModelError` con le diagnostiche.
- `SemanticModelService` offre snapshot, ricerca di elementi e relazioni incidenti, sostituzione atomica, rinomina, cambio di contenitore e aggiornamento delle coordinate. Ogni modifica valida l'intero candidato prima di sostituire lo stato precedente. Gli snapshot non permettono di modificare lo stato interno.
- `migrateSemanticModel(value, modelId?)` converte v1 in v2 e conserva i documenti v2/v3 validi, senza scrivere su disco. Versioni future e proprietà non riconosciute vengono rifiutate.
- `upgradeVisualModel` e `applyVisualEdit` in `common/visualEditing.ts` producono copie validate per l'editor v3: creazione, rinomina, layout, collegamenti, condizioni e cancellazione dei riferimenti. La persistenza e la cronologia restano nel workbench; dettagli nell'[editor persistente](visual-editing.md).

La shell traduce i codici in messaggi localizzati. I principali errori identificano campo e riferimento coinvolti: `missingReference`, `incompatibleRelation`, `duplicateId`, `containmentCycle`, `missingCriterion`, `missingError`, `viewEndpoint` e `shape`.

La persistenza appartiene ai servizi file/editor del workbench. Il servizio M1 non salva documenti, non esegue codice e non gestisce undo/redo: questo consente di verificarlo con Node e di riutilizzarlo nell'editor M2.

## Migrazione del prototipo

```sh
node ade/scripts/migrate-model.mjs ade/prototype/examples/checkout.diagram.json /tmp/checkout.ade.json checkout
```

Il comando crea un nuovo file e rifiuta di sovrascrivere sorgente o destinazione esistente. L'[esempio migrato](../examples/checkout.migrated.ade.json) conserva ID, nomi, ordine e collegamenti v1; `class` diventa `resource` conservando `legacyKind: class`. Le coordinate riproducono il layout fisso del prototipo.

Le etichette v1 non permettono di dedurre con certezza il tipo della relazione. La migrazione usa `dependency` con `classification: legacy-unclassified` e un avviso per ciascun collegamento. Gli ID delle relazioni sono deterministici rispetto all'ordine originale; una volta migrato il file, gli ID vengono conservati. Prima di una seconda migrazione non riordinare il vecchio file aspettandosi gli stessi ID. La classificazione esplicita dell'esempio completo è separata dalla migrazione conservativa.

## Verifica

Con il Node di `.nvmrc`:

```sh
npm run ade:test
npm --prefix ade/prototype run check
npm --prefix ade/prototype test
```

Questi controlli non richiedono installazione delle dipendenze desktop. Dopo l'installazione delle dipendenze root, `npm run ade:check` controlla i tipi del dominio e della shell, comprese le dipendenze TypeScript importate. Per chiudere il collaudo desktop seguire il [verbale M0](m0-verification.md).
