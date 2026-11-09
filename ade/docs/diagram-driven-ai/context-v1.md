<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Task strutturali · Protocollo v1

Estensione corrente: [DAI-06 · espressioni e interazioni](interactions-v1.md), profilo Node ESM revisione 3. I limiti del perimetro precedente descritti sotto restano riferiti alla rispettiva consegna.

DAI-04 aggiunge `modelTaskContext.ts` e `modelTaskResponse.ts`; `modelContext.ts` ri-esporta il compilatore condiviso e conserva il pacchetto storico di sole definizioni. [ADR 0006](../decisions/0006-portable-predicates-v1.md) e [ADR 0007](../decisions/0007-node-esm-structural-profile.md) delimitano AST e primo archetipo. `node.esm` non abilita forward/reverse produttivi.

## Preparazione e sufficienza

`ModelTaskRequest` dichiara progetto/target tramite il modello, operazione analisi/generazione/reverse, intento con revisione e chiarimenti, baseline, delta con eventuali definizioni prima/dopo, profilo fidato, provider/modello/configurazione, scope di scrittura e retrieval, evidenze selezionate e budget. Il campo `baselineRevision` è una revisione fornita dal coordinatore: non ricostruisce una baseline comune a partire da testo IA. I delta dichiarati devono corrispondere alle definizioni correnti. Il coordinatore DAI-05 dovrà collegarli alle baseline persistite M5/M6 prima di pubblicare.

L'algoritmo parte da operazione/target/delta, chiude firme, tipi ricorsivi, errori, guardie, chiamate e ordine degli scenari dichiarati, porte richieste, connessioni, trasporti, moduli condivisi, mapping di campi e vincoli correnti accettati. Owner e consumer conservano identità e contratti di confine; non trascinano corpi o operazioni sorelle. Una porta richiesta porta tutto il contratto richiesto, poiché il modello non dichiara un uso più ristretto; le firme indipendenti di un'interfaccia fornita restano lacune consultive esplicite. Gli errori degli input selezionati bloccano, non vengono eliminati per ridurre i byte. La readiness precedente resta un controllo conservativo: alcune bozze nello stesso componente possono ancora bloccare la preparazione, senza mai autorizzare omissioni essenziali.

Ogni definizione compare una volta, con campi/errori incorporati nel rispettivo owner. Dizionario handle→namespace/ID, definizioni complete, confini, consumer, scope C4 senza geometria, asserzioni con provenienza, mapping sorgente, vincoli, evidenze e lacune sono separati nel payload. I set dichiarati sono canonizzati; parametri, campi, AST e occorrenze conservano il proprio ordine. `changes` conserva il prima/dopo solo dove fornito, senza triplicare il modello. Nessun corpo sorgente entra per sola raggiungibilità inversa.

Il sigillo SHA-256 lega l'intero envelope canonico, compresi progetto, intento, grammatica, schema di output, archetipo/versioni, ADR, provider/modello/configurazione e perimetro. Lo hash semantico pertinente esclude layout e componenti dimostrati indipendenti. La cache verifica nuovamente il task prima di restituire dati: riuso dichiarato con zero invocazioni, mai prova di correttezza di una revisione differente.

## Evidenze e budget

`contextTransport.ts` è condiviso da workbench/CLI e adapter; `diagramEvidence.ts` conserva l'API M6 come re-export. M5, importazione diagrammi e riconciliazione riusano anche il conteggio comune di prompt e schema. Il packing `compact-v4` usa file condivisi, righe con colonne dichiarate e offset UTF-16; finestre sovrapposte vengono unite solo quando concordano, senza aggiungere intervalli. Revisioni, lunghezza e produttore sono sigillati; gli intervalli non divulgati restano lacune esplicite.

Il dominio accetta evidenze preparate dagli strumenti, non legge file. L'adapter Node `prepareStructuralSourceContext` riusa il lettore M5 limitato a 256 KiB, percorsi canonici senza symlink, controlla revisioni e finestre effettive. `validateStructuralSourceProposal` rilegge i file prima di accettare una proposta. Chiamanti che usano direttamente la libreria pura devono mantenere questa responsabilità di lettura/freschezza: il solo SHA dichiarato nel JSON non prova il contenuto del filesystem.

Il limite resta **196608 byte di input**, con almeno **65536 byte di riserva output** e riserva overhead esplicita; la somma deve rientrare nel contesto configurato. L'envelope misura i propri byte con convergenza del contatore, includendo istruzioni/schema/wrapper visibile. Token stimati `ceil(bytes/4)`, token misurati e prezzo `null`: nessun tokenizer/provider live è disponibile nel percorso locale. L'overhead privato della CLI è dichiarato non misurato. Una dipendenza obbligatoria oltre budget blocca con suggerimento di separare attraverso un contratto; nessuna soglia viene alzata.

## Esiti, retrieval e proposta

Lo schema stretto ammette soltanto `proposal`, `needsClarification`, `needContext`, `unsupported`. Una proposta contiene operazioni e patch di sorgenti entro scope, ragione breve, criteri esistenti ed evidenze dichiarate; non contiene comandi o risultati di test. Nuove operazioni richiedono un owner di creazione autorizzato e chiavi `tmp:` dichiarate esattamente; i tool assegnano le identità. Solo i campi di identità vengono risolti, senza riscrivere etichette o descrizioni coincidenti.

Il validatore ricostruisce un candidato su copia, controlla schema, riferimenti/tipi, ownership immutata per gli oggetti esistenti, criteri/evidenze, ADR, ancore univoche divulgate, revisioni, sovrapposizioni e freschezza. Una citazione prova tracciabilità, non supporto semantico o correttezza: le prove indipendenti rimangono necessarie prima della pubblicazione DAI-05. Le decisioni non sono modificabili da una proposta per eludere vincoli.

`needContext` può citare handle presenti nel catalogo di retrieval autorizzato o intervalli esatti entro i file/range ammessi. Non apre filesystem o tool nascosti. L'acquisizione è esterna al dominio; `expandModelTaskContext` controlla lo scope e produce un nuovo pacchetto/sigillo, senza ampliare scritture. `clarifyModelTask` salva risposte in una nuova revisione dell'intento. Nessun ampliamento equivale ad autorizzazione implicita all'invio: il chiamante ripresenta la disclosure secondo la politica M5/M6.

## Workbench e CLI

Comandi nativi: **A.D.E: Bind Structural Node Profile**, **A.D.E: Edit Pure Predicate**, **A.D.E: Preview Structural AI Context**. Il binding modifica solo il PSM. L'editor di predicati raccoglie scope, nodi e risultato, conserva identità e annulla senza scritture parziali. Il documento usa salvataggio/undo/redo esistenti. La resa accessibile deriva dalla stessa AST. L'anteprima mostra byte reali, stima, costo sconosciuto, definizioni/confini/lacune e JSON esatto con scope in una disclosure focusabile. Le anteprime superate vengono nascoste; nessun comando avvia un'inferenza.

```sh
node ade/scripts/dai-model.mjs profile node.esm
node ade/scripts/dai-model.mjs context ade/examples/dai-node-orders.ade.json ade/examples/dai-node-task.json NUOVO_PACKET.json
node --test ade/test/dai-task.test.mjs
node ade/scripts/benchmark-dai-task.mjs NUOVO_REPORT.json
```

Gli output della CLI sono creati in modo esclusivo, senza sovrascritture. Il file di richiesta è un `ModelTaskRequest` esplicito; una fixture riproducibile è in `ade/test/fixtures/dai-task.mjs`. Il [pacchetto registrato](../benchmarks/dai-04-sealed-context.json) contiene l'input effettivo e i relativi metadata. I pacchetti degli sprint precedenti restano artefatti storici con il proprio sigillo, mentre la grammatica corrente è verificata separatamente.

L'estensione [DAI-07 · stati v1](states-v1.md) porta lo stesso percorso al profilo Node ESM revisione 4 con macchine piatte, contesto selettivo, criteri indipendenti e checkpoint quiescenti. I limiti descritti sopra restano riferiti alla consegna originaria.

Estensione DAI-08: [messaggistica v1](messaging-v1.md) e [ADR 0011](../decisions/0011-jetstream-messaging.md) aggiungono topologie/policy e collegamenti tipizzati nel profilo revisione 5; prove reali del broker restano separate dal runner di progetto.
