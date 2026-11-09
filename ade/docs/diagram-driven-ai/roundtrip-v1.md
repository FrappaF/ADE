<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Round trip del primo profilo

DAI-09 completa S13 nel perimetro dichiarato di Node ESM revisione 5. La matrice è esposta anche nella review, tramite `projectRoundTripMatrix` e `projectCoverage`. «Parziale» è un esito bloccante quando il cambiamento non ha proiezione; non è una ricostruzione approssimativa accettata automaticamente. [ADR 0012](../decisions/0012-structural-roundtrip-and-source-index.md) registra le decisioni.

| Costrutto | Forward | Reverse | Conservazione |
| --- | --- | --- | --- |
| Contratti e tipi | Closure tipizzata nei piani, validazione di input/output | Conservati; cambi incompatibili del contratto nel sorgente sono parziali | ID, nomi, criteri, unknown, nullable e presence |
| Espressioni dei predicati | Grammatica dichiarata completa | Parziale: literal e confronti esistenti, con riemissione esatta del corpo | ID dei nodi e contratto |
| Interazioni e frame | Piani alt/opt/loop/par/critical/ref | Parziale: identità esistenti, campi eseguibili supportati, guardie/argomenti e ordinamento verificati dall'adapter | Frame, occurrence, contratti condivisi; nessun nuovo ID inferito |
| Stati piatti | Piano dichiarato e runtime statico | Parziale: transizioni/guardie/priorità/azioni su identità esistenti | Stati, eventi, owner e contratto |
| Messaggistica | Configurazione, envelope e simulazione | Parziale: ackWait, maxAttempts, backoff; contratti, canali e risorse restano immutabili nel reverse | Versioni, producer/consumer, owner e identità |
| ADR | Vincoli normativi e contesto | Conservati, mai dedotti dal codice né riscritti per adattarli a una violazione | Prosa, scope, vincoli, storia |
| Binding PSM | Risoluzione esplicita del profilo | Conservati, piattaforma non supportata bloccante | ID e unknown |
| Viste e testo personalizzato | Conservati | Conservati senza inferenze semantiche | Coordinate, annotazioni, testo fuori regione e permessi |

Una modifica del corpo a firma invariata è rilevata dall'hash e dalla regione, poi sottoposta al reverse specifico. La riemissione deve uguagliare tutti i byte della regione accettata. Un commento descrittore da solo non certifica il comportamento. Il compilatore TypeScript produce fatti sintattici separati: export, import e codici diagnostici. Nessuna chiamata IA interpreta il corpo. Il runner fidato continua a escludere codice e test personalizzati.

Le tre versioni sono snapshot comune, modello attuale e sorgente fisico. Cambiare lo stesso predicato/piano o cambiare il contesto normativo mentre si modifica il sorgente produce conflitto. Il controllo della foundation in reverse è conservativo: può bloccare anche modifiche indipendenti, che richiedono due review separate. Layout e annotazioni del documento restano conservati. Forward non sovrascrive una regione cambiata rispetto alla baseline.

## Operazioni fisiche

`structuralPrepare` accetta `paths: { ID: "src/domain/orders/handler.mjs" }` sia dal protocollo esistente sia dal comando **A.D.E: Move Model Behavior Source**. Il percorso è relativo, in `src`, con al massimo sette sottocartelle e segmenti semplici; niente traversal, redirect o symlink. La destinazione deve essere assente, inclusa quella del test generato corrispondente. Move e rename trasferiscono testo personalizzato e permessi. I test sono spostati sotto `test` con import relativi calcolati dalla nuova posizione.

Create e delete usano l'assenza come pre/postimmagine. Il delete forward segue una modifica esplicita e valida del modello: riferimenti, ADR o risorse ancora necessarie devono essere risolti nel modello, mai eliminati per deduzione dall'adapter. Il solo testo fuori regione viene mantenuto nel vecchio file. Nel reverse l'assenza di un predicato può diventare una cancellazione revisionata; per interazioni, stati e messaging rimane parziale, perché non prova quali riferimenti o risorse rimuovere. L'undo ripristina il precedente stato fisico revisionato, che può già contenere un rename o una cancellazione esterna.

La scansione ricorsiva ricostruisce ogni volta le identità dalle fonti fisiche; una seconda copia della stessa identità è ambigua anche quando il vecchio percorso esiste ancora. Limiti: 1000 entry totali, otto livelli compresa `src`, 8 MiB aggregati, 2 MiB per file e 4 MiB per indice derivato. Un indice troppo grande lascia intatta la cache precedente. I limiti di contesto e journal precedenti rimangono invariati; un overflow blocca, senza troncatura.

## Indice e recovery

`.ade/structural/source-index.json` è una cache derivata dal parser TypeScript 6.0.2 di produzione, condiviso con l'importazione semantica. Contiene hash SHA-256 del file intero, mode, claim di identità estratto dalla regione e fatti sintattici. Non contiene un secondo modello autorevole. Non viene mai usata come input fidato: perdita, corruzione e falsificazione vengono superate rileggendo i sorgenti; un redirect della cache è bloccante. Una scansione allineata non riscrive la cache.

Le nuove review sigillano anche l'inventario dei sorgenti. Aggiungere una copia dopo review invalida verifica/pubblicazione; le prove devono essere rifatte. Le vecchie sessioni conservano i controlli sulle loro preimmagini. Snapshot, modello, test, fonti e permessi usano il journal condiviso DAI-05, senza nuovo protocollo. L'indice viene aggiornato dopo le immagini finali di publish, undo o recovery; un crash può lasciarlo obsoleto, perché la successiva scansione lo ricostruisce. La sua attivazione non è un commit semantico.

Lo snapshot comune è autorevole: se il puntatore identifica uno snapshot perso, l'operazione si blocca e richiede il suo ripristino. Il sistema non interpreta la perdita come un nuovo progetto. Recovery prima/durante il commit ripristina le preimmagini; dopo l'attivazione della baseline conserva le postimmagini. Modifiche manuali ignote bloccano recovery o undo. Si tratta di recovery da arresto del processo; non è certificata la durabilità a perdita di alimentazione né l'atomicità istantanea su più file.

Nessuna operazione sui file migra broker, ledger, checkpoint o dati vivi. Non ci sono nuovi provider, retry automatici, dipendenze dell'applicazione generata o esecuzione arbitraria. No-op forward/reverse produce zero proposte, riscritture sorgenti e chiamate IA; la ricostruzione di una cache persa può scrivere soltanto la cache. Allineamento strutturale e conformità comportamentale sono esiti distinti.

Per riprodurre le prove mirate:

```sh
node --test --test-isolation=none ade/ai/test/roundtrip-project.test.mjs
npm --prefix ade/ai test
npm --prefix ade/code-import test
```

Usare Node 24.22.1 e le dipendenze dichiarate di entrambi i pacchetti. Gli attesi sono in [DAI-09 acceptance](dai-09-acceptance.md); risultati e limiti effettivi nel [verbale](dai-09.md).
