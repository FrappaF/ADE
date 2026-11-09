<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Progetto puro v1

Estensione corrente: [DAI-06 · espressioni e interazioni](interactions-v1.md), profilo Node ESM revisione 3. I limiti del perimetro precedente descritti sotto restano riferiti alla rispettiva consegna.

DAI-05 rende eseguibili i predicati v1 del modello, senza dedurre corpi arbitrari dai contratti. Il profilo Node ESM revisione 2 abilita `create/analyze/forward/reverse` esclusivamente per questo sottoinsieme; frame, stati, asincronia, storage, dipendenze esterne e migrazioni runtime restano non supportati. [ADR 0008](../decisions/0008-pure-project-runner-and-publication.md) registra policy, runner e limiti.

Dal workbench: **Create Project**, **A.D.E: Add Pure Quantity Feature**, poi **Implement Feature**. Il primo comando crea modello, binding esplicito, feature e oracoli indipendenti senza codice importato o conversazioni precedenti. L'inserimento del modello è annullabile sullo stack nativo. I criteri sono dati separati del progetto: restano disponibili dopo l'undo della feature e non vengono sovrascritti da una seconda inizializzazione.

La review apre diff reali di ogni creazione/modifica/cancellazione, contesto sigillato, limiti e risultati. **Run Tests** verifica la revisione nel worktree; **Apply Changes** pubblica solo dopo review e verifiche indipendenti verdi; **Undo Implementation** ripristina preimmagini e baseline. **A.D.E: Reverse Pure Feature from Code**, **A.D.E: Move Pure Feature Source**, **A.D.E: Resume Pure Feature Review** e **A.D.E: Recover Pure Feature Publication** operano sulle stesse sessioni persistenti. **A.D.E: Edit Independent Pure Feature Expectations** modifica esplicitamente un atteso, revisionando i criteri separatamente dal generatore. Il contesto e i dati tecnici restano nella review, non nei dialoghi di modellazione.

Il compilatore di DAI-04 riceve baseline reale, provider deterministico revisionato, delta di predicato e sorgenti effettive con hash. La creazione fisica è autorizzata dal piano deterministico esterno: lo scope di editing sorgenti del protocollo IA non è allargato per fingere evidenze di file assenti. Input e riserve conservano i budget v1; nessuna troncatura obbligatoria. Scope, criteri, modello, manifest, sorgenti, test, permessi, profilo e baseline sono ricontrollati prima della pubblicazione. Le modifiche semantiche invalidano subito la review nel workbench; layout e target allineati non avviano inferenze.

Gli snapshot in `.ade/structural/snapshots` conservano le definizioni comuni e i mapping dei predicati, che il vecchio `CodeMapping` a livello elemento non rappresenta. Non è necessario un indice esterno; il reverse usa identità e regioni verificabili. Lo spostamento di un file viene riconosciuto solo con una corrispondenza univoca, oppure dichiarato nel piano. L'assenza diventa una proposta di cancellazione; l'ambiguità resta bloccante. Test derivati modificati manualmente non vengono sovrascritti.

I test indipendenti usano input a ID di campo stabili e atteso `true`, `false`, `null` oppure `typeError`. Il risultato indeterminato non equivale a rifiuto. I casi di quantità sono fissati in [dai-node-criteria.json](../../examples/dai-node-criteria.json): segno, zero, limite sicuro, assenza, null, stringa e intero non sicuro. Il runner non esegue codice estraneo alla regione: il suo esito certifica questo sottoinsieme, non un'applicazione arbitraria, un protocollo o un servizio esterno.

La CLI usa lo stesso motore del workbench:

```sh
node ade/scripts/dai-project.mjs create /tmp/new-quantity-project "Quantity Rules"
node ade/scripts/dai-project.mjs forward /tmp/new-quantity-project /tmp/review.json
node ade/scripts/dai-project.mjs verify /tmp/new-quantity-project SESSION_ID REVIEW_ID /tmp/verified.json
node ade/scripts/dai-project.mjs apply /tmp/new-quantity-project SESSION_ID REVIEW_ID /tmp/applied.json
node ade/scripts/dai-project.mjs reverse /tmp/new-quantity-project /tmp/reverse.json
node ade/scripts/dai-project.mjs undo /tmp/new-quantity-project SESSION_ID REVIEW_ID /tmp/undone.json
```

`SESSION_ID` e `REVIEW_ID` arrivano dall'output di `forward/reverse`. I report devono essere nuovi e fuori dal progetto. `session/recover ROOT SESSION_ID NEW_REPORT` riprendono dopo riavvio. Per mapping fisici espliciti è disponibile `ade/ai/cli.mjs run OPERATION.json NEW_RESULT.json` con `operation: structuralPrepare`, `direction`, `root` e `paths: {PREDICATE_ID: "src/new-name.mjs"}`. Nessun comando pubblica senza l'identità della review; nessun test superato è accettato dall'output di un provider.

Il limite di una sessione è 64 predicati e 16 MiB di journal, con file UTF-8 regolari senza hardlink/symlink e preimmagini fino a 2 MiB. Il contesto sorgente conserva il lettore M5 più restrittivo da 256 KiB e il budget di input di 192 KiB. Sono limiti espliciti di lavoro, non soglie di release aumentate. Lo snapshot è aggiornato solo dopo verifiche coerenti; recovery protegge le modifiche manuali. Le cartelle vuote, il repository e il commit vuoto iniziale possono restare dopo l'undo; i contenuti pubblicati e la baseline vengono ripristinati.

L'estensione [DAI-07 · stati v1](states-v1.md) porta lo stesso percorso al profilo Node ESM revisione 4 con macchine piatte, contesto selettivo, criteri indipendenti e checkpoint quiescenti. I limiti descritti sopra restano riferiti alla consegna originaria.

Estensione DAI-08: [messaggistica v1](messaging-v1.md) e [ADR 0011](../decisions/0011-jetstream-messaging.md) aggiungono topologie/policy e collegamenti tipizzati nel profilo revisione 5; prove reali del broker restano separate dal runner di progetto.

Estensione DAI-09: [round trip e operazioni fisiche](roundtrip-v1.md), matrice per costrutto, percorsi annidati, permessi conservati e indice compilatore ricostruibile; lo snapshot comune autorevole rimane distinto dalla cache.
