<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-01 — Baseline e contratto di accettazione

Sprint S00 e avvio S15, 8 novembre 2026, fuso Europe/Rome. Revisione di ingresso verificata: `05c3a0f0` (`origin/main`), dopo `git pull --ff-only origin main` sulla branch locale `work`, partita da `9e0efde8`. Il pull è stato fast-forward e la copia di lavoro era pulita. Il piano era entrato con `15c78215`; `05c3a0f0` aggiunge l'organizzazione in sprint. Questa consegna riguarda la fondazione di verifica; le capacità DAI-02–12 rimangono da implementare.

## Inventario verificato nei sorgenti

Il [registro R01–R16/S00–S15](coverage.json) contiene, per ciascun requisito, stato della baseline, schema, servizio, UI, prove, gap, responsabile, step/sprint, casi e criterio di uscita. I percorsi sono relativi alla radice del repository. `partial` significa che esiste una base riusabile, non che il requisito DAI sia soddisfatto; `missing` rende esplicita l'assenza delle strutture dedicate. Tutte le accettazioni R01–R16 restano aperte.

| Area | Capacità presente e riuso | Limite determinante |
| --- | --- | --- |
| Dominio | `SemanticModel` v2/v3; validazione di forma, riferimenti, contenimento, relazioni e criteri; migrazione legacy; identità condivise | Non separa PIM/PSM, ownership/feature e conoscenza; mancano ID di membri/operazioni e readiness per target |
| Editing | `applyVisualEdit`, servizi progetto, salvataggio, undo/redo, recupero, navigazione e lettura accessibile | Percorso del dominio attuale; criteri e permessi non completamente modificabili nella UI |
| Notazioni | 16 `viewKinds`; C4, classi, dati e infrastruttura con filtri e metadati testuali | Catalogo visuale, non conformità UML universale o modello eseguibile |
| Sequenze/stati | `getSequenceDiagram` ordina relazioni locali; `getStateDiagram` raggruppa stati e transizioni della risorsa | Nessun frame/occorrenza/correlazione né motore con trigger, entry/exit/do |
| Importazione M4 | Parser, indice, profili e Sync deterministico con tracciabilità; analisi JS/TS e ponte SCIP | I 16 profili di parsing non sono archetipi di generazione/runtime |
| Contesto | Packing `compact-v4`, finestre deduplicate, handle, schema strutturato, budget byte e review legata agli input | Non è ancora un compilatore comune con chiusura di dipendenze semantiche e recall misurato |
| Forward M5 | Piano, worktree Git, generazione, test Node, applicazione e undo | Richiede una codebase importata; nessun bootstrap da solo modello; un worktree non è una sandbox OS |
| Riconciliazione M6 | Tre versioni, proposte modello↔codice, hash, `bodyChanged`, sostituzioni delimitate, journal, undo/recovery | File esistenti; nessun piano fisico completo create/move/delete né esecuzione runtime automatica in Sync |
| ADR/messaggi | ADR Markdown sullo sviluppo ADE e topologie generiche disegnabili | Nessun repository ADR utente normativo né modello dedicato queue/topic/subscription |

### Discrepanze risolte e verifiche conservate

Il README indicava M6 interamente «da sviluppare» e descriveva il Sync globale come percorso solo codice→modello. I servizi, `reconciliationJournal.ts`, le suite di riconciliazione e il [verbale M6](../m6-verification.md) mostrano la base bidirezionale integrata dalla PR #16. Il README ora distingue quella capacità presente dalla sua estensione DAI. Le descrizioni storiche in ADR/verbali mantengono data e perimetro originali.

La suite delle notazioni non caricava il resolver sorgente prima dell'importazione di `visualEditing.ts`: il comando autonomo con Node cercava `semanticModel.js`, assente nel checkout non compilato. La suite ora usa `source-loader.mjs` e l'importazione dinamica già adottata dagli altri test di dominio. Non cambia il codice del prodotto.

I verbali precedenti sono evidenze storiche, non esecuzioni di questo sprint. Il [report del catalogo](../validation/diagram-catalog-2026-11-08.json) distingue inferenza reale di generazione diagrammi, output registrati e smoke desktop con provider simulato. Il [tentativo live M6](../validation/m6-live-benchmark-2026-11-05.json) fallì per autenticazione: il successivo successo live sui diagrammi non certifica la qualità della riconciliazione. Restano i collaudi equivalenti dei provider, la matrice piattaforme/accessibilità e le verifiche ancora aperte nei verbali [M2](../m2-validation.md), [M3](../m3-6-verification.md), [M5](../m5-verification.md) e [M6](../m6-verification.md). DAI-01 non li chiude.

## Contratto di accettazione versionato

- [Glossario normativo](glossary.md): sistema governato/esterno, container C4, modulo, feature, vista, intento, implementazione, evidenza e stati della conoscenza/verifica.
- [Corpus v1](corpus.v1.json): input e osservazioni attese indipendenti per checkout riuscito/rifiutato, scorte, permessi, timeout, concorrenza, frame, stati, queue/topic, migrazioni e conflitti/recupero. Include negativi su identità, tecnologia, scope, ADR, tipi, omissioni essenziali e revisioni superate. È una specifica di test, non un modello v4 già importabile.
- [Budget v1](budgets.v1.json): grafi da 64/256/1024 elementi; reference Linux x64, Node 24.22.1, 2 vCPU e limite 8 GiB; p95 delle operazioni locali, RSS, editing desktop, preparazione contesto, input 192 KiB e riserva risposta 64 KiB. Ogni archetipo deve passare tutti i casi obbligatori e respingere tutti i negativi. Nessuna omissione essenziale silenziosa; zero chiamate sui no-op/layout.
- [Decisioni](decisions.md): otto voci del piano §9 con stato, responsabile, scadenza e prova attesa. La scelta **v4** è adottata nell'[ADR 0004](../decisions/0004-diagram-driven-schema-v4.md); schema e migrazione sono lavoro di DAI-02.
- [Handoff](handoff.md): stato dei cinque criteri DAI-01 e scheda circoscritta per il prossimo sprint secondo il piano §10.

Gli oracoli osservano valori, righe persistite, chiamate e tracce tramite adapter fidati esterni alla patch generata. Le fixture non contengono un'implementazione del checkout; le aspettative sono state scritte prima della generazione. Tutti i casi applicativi hanno stato `pending-adapters`: non esiste un passaggio automatico da fixture presente a caso passato. In DAI-05/06 gli adapter osserveranno l'applicazione reale; in DAI-08 servirà il broker scelto. Le prove di schema, generazione, reverse e UI rimangono distinte.

## Benchmark ripetibile

Con Node della `.nvmrc`, senza installare dipendenze o costruire il desktop:

```sh
npm run ade:dai:baseline -- --output /tmp/dai-baseline-rerun.json
npm run ade:test
```

Il runner rifiuta di sovrascrivere un report esistente. Il [report DAI-01](../benchmarks/dai-01-2026-11-08.json) conserva revisione, stato dirty, hash di policy/corpus/sorgenti/input, hardware osservato, prima chiamata, mediana/p95 su 20 campioni dopo 3 warm-up, picco RSS e byte delle evidenze. I grafi e le finestre di sorgente sono deterministici e condivisi tramite `ade/benchmarks/dai-fixtures.mjs`; usare gli stessi input per confrontare candidati futuri. La prima chiamata non viene presentata come avvio a freddo di un processo indipendente.

La misura riguarda validazione, rinomina con copia/validazione, impatto sull'intera feature e packing delle evidenze esistenti. Verifica che ogni finestra originale e relativa identità sia ricostruibile dal pacchetto. Il confronto byte è fra righe non compattate e packing attuale sulle stesse finestre; non dimostra recall semantico o risparmio di un futuro compilatore. Il pacchetto esclude istruzioni, schema di output e grafo semantico: non è il payload completo da confrontare con il limite di release. Un superamento resta registrato; non si ritoccano i budget per far passare una prova.

Token misurati, prezzi, recall semantico, esecuzione dei casi di business, preparazione completa del contesto e input-to-paint desktop rimangono non misurati. La stima `ceil(byte UTF-8 / 4)` è solo un'euristica separata dall'usage dei provider. Il picco RSS appartiene all'intero processo; non è l'allocazione di ciascuna operazione. Nessuna inferenza, chiamata a pagamento, pubblicazione esterna o scelta di default commerciale è necessaria per questa baseline.

## Esiti di questa consegna

Esecuzione locale con Node **24.22.1**, Linux x64, AMD EPYC 9V74, quota CPU effettiva **2**, limite cgroup memoria **8192 MiB**. Il [report](../benchmarks/dai-01-2026-11-08.json) contiene i valori non arrotondati e gli hash; misura sorgenti di produzione invariati rispetto alla revisione di ingresso e tooling DAI-01 aggiunto nella copia di lavoro (`workingTreeDirty: true`).

| Grafo | Validazione p95 | Rinomina p95 | Impatto p95 | Packing p95 | Byte prima → dopo |
| --- | --- | --- | --- | --- | --- |
| 64 elementi / 62 relazioni | 0,60 ms | 2,98 ms | 0,43 ms | 0,21 ms | 30.277 → 17.087 |
| 256 elementi / 254 relazioni | 2,05 ms | 8,50 ms | 1,16 ms | 0,40 ms | 124.216 → 70.396 |
| 1024 elementi / 1022 relazioni | 5,08 ms | 17,16 ms | 12,47 ms | 1,35 ms | 501.557 → 284.875 |

Le latenze locali e il picco RSS di **106,55 MiB** rientrano nei budget fissati. Il packing riduce i byte del **43,2–43,6%**, preservando tutte le finestre dichiarate. Il grafo grande **supera** il limite input di **196.608 byte** già con le sole evidenze: il futuro compilatore S11 deve selezionare le dipendenze del target oppure bloccare/suddividere il task. Non basta inviare l'intero grafo compattato. Questo risultato non certifica il risparmio del futuro compilatore né la sufficienza semantica del contesto.

Comando di verifica: `node --test ade/test/*.test.mjs ade/code-import/test/diagram-evidence.test.mjs`. **96 test passati, 0 falliti, 0 saltati**: 93 del dominio/contratto DAI e 3 sul packing delle evidenze, comprese finestre sovrapposte incoerenti respinte. I 5 nuovi test controllano copertura, riferimenti reali, integrità del corpus, dimensioni e hash delle fixture/report; non eseguono i 30 scenari applicativi futuri. Verificati anche sintassi dei moduli, collegamenti locali e assenza di errori whitespace nel diff. Nessun build desktop, inferenza o nuovo collaudo dei provider è stato eseguito in questo sprint.

**DAI-01 consegnato**: S00 consegnato e S15 avviato; corpus, budget, decisione v4 e handoff disponibili. Restano aperti tutte le accettazioni R01–R16, i casi applicativi `pending-adapters`, misure desktop/contesto completo e DAI-02–12. Nessun risultato locale certifica in anticipo tali capacità.
