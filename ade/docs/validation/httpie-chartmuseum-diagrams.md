# Importazione e fedeltà dei diagrammi: HTTPie e ChartMuseum

Collaudo del 10 novembre 2026 sulla branch `feat/m6-dai-validation`, con le correzioni locali della precedente prova Express. Il test usa la CLI Codex originale autenticata con l’account dell’utente e il modello `gpt-5.6-terra`. Le repository sono state clonate integralmente e importate con scope predefinito; i sorgenti versionati sono rimasti invariati.

## Campioni e metodo

| Repository | Commit | File versionati | Codice principale | Dichiarazioni ADE |
| --- | --- | ---: | --- | ---: |
| [HTTPie CLI](https://github.com/httpie/cli) | `5b604c37c6c67e18e7c3e9aee6c88a8c22b98345` | 265 | 133 file Python, 19.002 righe, inclusi test e strumenti | 1.244 |
| [ChartMuseum](https://github.com/helm/chartmuseum) | `dcbb99069784841bc19a7e434ae0fc9e11f2d159` | 104 | 36 file Go, 8.395 righe, più 5 file Python di supporto | 318 |

ADE registra rispettivamente 266 e 105 voci nell’inventario: la voce aggiuntiva è `.git`, esplicitamente esclusa dall’interpretazione. HTTPie produce 1.805 unità di evidenza e ChartMuseum 529. Il piano di analisi richiede inizialmente 47 e 15 step, prima delle viste aggiunte alla proposta.

Sono state invocate le operazioni di produzione `import`, `diagramPrepare`, `diagramStep` e `diagramApprovePlan` attraverso `createCodeEngine`. Il provider è `createCliProvider`, con la CLI originale e i suoi argomenti di produzione; prompt, schemi, risposte e consumi sono conservati negli artifact locali. Nessuna risposta simulata sostituisce un’inferenza reale. Una sola risposta reale di sintesi ChartMuseum è stata rivalidata dopo una correzione deterministica: istruzione, schema, sorgenti, grafo e chiarimenti coincidevano, verificati automaticamente; differiva soltanto il feedback dell’errore precedente.

Non sono stati collegati indici SCIP esterni: per Python e Go l’importazione predefinita offre evidenze sintattiche e testuali, senza dipendenze di chiamata risolte da un compilatore. Nessuna diagnostica di parser è emersa; questo non certifica né compilazione né correttezza delle inferenze comportamentali. Non sono stati eseguiti i progetti importati. Il confronto semantico è una revisione dei sorgenti ai commit indicati.

Durante la prova la CLI ha raggiunto il limite dell’account. I checkpoint sono stati mantenuti e l’esecuzione è ripresa dopo che i metadati della CLI indicavano una nuova finestra disponibile; la richiesta reale successiva ha confermato l’accesso. Non sono stati acquistati crediti né cambiati account o modello.

## ChartMuseum: esito e confronto

Sono state salvate **12 viste su 13**. L’ultima vista delle classi è rimasta in domanda e lo snapshot finale **non è stato pubblicato**: l’atomicità conserva l’indice iniziale. Le viste completate sono state composte per l’anteprima con la funzione di produzione `compose`, modalità non finale, selezionando soltanto gli identificativi delle viste effettivamente salvate. L’anteprima non modifica il checkpoint o il puntatore attivo e non equivale a una pubblicazione riuscita.

| Vista salvata | Tipo | Nodi | Relazioni |
| --- | --- | ---: | ---: |
| ChartMuseum production architecture · Shared Design | structure | 24 | 26 |
| ChartMuseum production architecture | c4Container | 6 | 4 |
| ChartMuseum server responsibilities | c4Component | 7 | 3 |
| Publish a chart package | activity | 6 | 6 |
| Chart upload and index update | sequence | 6 | 6 |
| Repository index refresh | activity | 4 | 4 |
| Repository index maintenance | sequence | 4 | 3 |
| Serve repository indexes and chart objects | sequence | 6 | 5 |
| Runtime configuration assembly | activity | 4 | 3 |
| Storage and cache selection | activity | 5 | 4 |
| Request and repository observability | sequence | 3 | 2 |
| Chart provenance handling | sequence | 4 | 3 |

La struttura generale riconosce correttamente client Helm, server Go, storage configurabile, cache Redis opzionale, router, gestione degli indici, eventi e metriche. Le condizioni `cache.store is redis`, statefile abilitati e limiti di storage sono in parte esplicite. Gli strumenti di test e rilascio non vengono presentati come servizi del runtime. La qualità delle sequenze e dei confini non è però sufficiente a usare queste viste come descrizione verificata del funzionamento.

| Aspetto | Riscontro nei sorgenti | Risultato dei diagrammi |
| --- | --- | --- |
| Storage e Redis | `cmd/chartmuseum/main.go:133` seleziona un backend; `:285` restituisce `nil` se la cache non è configurata; `pkg/chartmuseum/server/multitenant/cache.go:339` usa memoria quando manca lo store esterno. | Distinzione corretta tra storage dei chart e cache Redis opzionale. La cache interna resta aggregata nella responsabilità dell’indice. |
| Ordine delle richieste di lettura | `pkg/chartmuseum/router/router.go` invoca l’handler selezionato; `pkg/chartmuseum/server/multitenant/routes.go:45` distingue le route indice e archivio. | **Errore temporale:** nella sequenza di lettura, i messaggi 2 e 3 leggono cache/storage prima che i messaggi 4 e 5 invochino gli handler. Inoltre mette in serie due endpoint alternativi. Occorrono scenari separati o una ramificazione esplicita. |
| Persistenza dell’upload | `pkg/chartmuseum/server/multitenant/api.go:116` chiama `PutWithLimit`; `:236` scrive anche quando `ChartLimits == nil`. | **Ramo normale omesso:** il collegamento verso la funzione di persistenza è condizionato a limiti configurati e la scrittura mostrata descrive cancellazione del più vecchio e nuovo inserimento. La scrittura ordinaria senza retention non emerge nella sequenza. |
| Direzione del bootstrap | `cmd/chartmuseum/main.go:57` chiama `UpdateFromCLIContext`; `pkg/config/config.go:60` aggiorna la configurazione e ritorna al chiamante. | **Invocazione invertita:** la vista di configurazione aggiunge `Apply CLI configuration → Configure and start ChartMuseum server` come invocazione. Il codice supporta il passaggio della configurazione e l’ordine delle fasi; non una chiamata dal modulo config al bootstrap. |
| Confini C4 | Nel modello Helm CLI e Pushgateway sono esterni al sistema ChartMuseum; la configurazione tratta Pushgateway come servizio remoto opzionale. | **Problema di layout:** il rettangolo del sistema viene calcolato fra figli intercalati con nodi esterni e li racchiude visivamente. Il parent semantico esterno resta corretto, ma il canvas comunica un confine errato. |
| Osservabilità | `pkg/chartmuseum/router/prometheus.go` distingue registrazione dei collector, middleware delle richieste, scraping e invio periodico a Pushgateway. | Il piano iniziale mescolava questi percorsi in una sequenza scollegata. Dopo un chiarimento basato sul codice, la vista salvata contiene soltanto registrazione della richiesta e lettura dell’endpoint. Il titolo originario è più ampio del contenuto finale. |
| Provenance | `pkg/repo/provenance.go:48` deriva il filename; `:64` calcola il digest in una funzione distinta. | I due helper vengono presentati nella stessa sequenza senza evidenza che il secondo segua il primo nella stessa esecuzione. La validazione del prefisso PGP e dei metadati non dimostra verifica crittografica della firma. |
| Vista delle classi | `pkg/chartmuseum/server/multitenant/cache.go` dichiara `cacheEntry` ed `event`; il modello condiviso non dichiara membri né un rapporto OO tra loro. Gli altri oggetti del focus sono risorse/componenti. | **Blocco residuo:** `Repository index domain model` non ha una relazione rappresentabile e termina in domanda. Serve una revisione del piano o delle dichiarazioni prima dell’approvazione; la ripresa attuale conserva il piano già approvato. |

Gli screenshot sono in `/workspace/ADE/.build/diagram-validation/chartmuseum-preview/`. `diagram-1.png` mostra il problema del confine C4; `diagram-7.png` rende visibile l’ordine scorretto delle invocazioni e delle letture. L’export testuale delle viste è `chartmuseum-diagrams.md` nella stessa cartella di validazione.

## HTTPie: arresto prima della sintesi

HTTPie ha completato tutti i **46 gruppi di analisi**, ma il passaggio di sintesi, numero 47, si ferma localmente con `Semantic context exceeds the configured budget; increase it before preparing this project`. Il budget configurato è 262.144 byte, dei quali il 75% disponibile per prompt e schema. Nessuna richiesta al provider è stata eseguita per quei fallimenti di preflight; le tre registrazioni dell’errore non equivalgono a tre inferenze aggiuntive. Non esistono un piano finale approvato o diagrammi pubblicati da confrontare semanticamente con HTTPie.

Le invocazioni CLI effettive sono 52, inclusa una richiesta fermata dalla quota. Gli eventi completati riportano 1.553.121 token di input e 83.607 di output complessivi, comprese le riprese. Il checkpoint conserva tutte le analisi, ma resta nello stato `ready`: l’errore di budget viene lanciato prima del blocco che persiste il fallimento. Inoltre `prepareDiagramImport` richiede che la configurazione coincida interamente con quella del job, quindi aumentare il budget invalida la ripresa. Il problema è rimasto riprodotto; non è stato aggirato alterando il checkpoint o restringendo il campione.

La richiesta successiva dell’utente di cambiare strategia ha interrotto ulteriori tentativi. Questi esiti alimentano il [piano di riprogettazione](../diagram-import-redesign-plan.md); nessuna nuova inferenza è stata avviata per redigerlo.

## Validazione e artifact conservati

Per ChartMuseum le 12 viste parziali passano i controlli automatici del canvas estratto dal renderer di produzione, senza errori JavaScript. L’anteprima isola il canvas e non è una prova completa dell’app Electron; i difetti semantici e del confine C4 descritti sopra restano presenti. Il modello di anteprima è marcato `unpublished-partial-checkpoint`.

Prima del cambio di strategia, le correzioni locali della pipeline erano state verificate con 180 test code-import, 112 test IA e 43 test canvas, tutti verdi. Sono verifiche dell’implementazione precedente, non una misura della fedeltà dei diagrammi né test di una nuova architettura. Durante la redazione del piano non sono stati ripetuti test runtime.

Gli artifact locali sono in `/workspace/ADE/.build/diagram-validation/`: cartelle `httpie` e `httpie-resume-1`–`httpie-resume-5`, `chartmuseum` e `chartmuseum-resume-1`–`chartmuseum-resume-6`, `repository-validation-summary.json`, `source-ground-truth.json`, `chartmuseum-partial-model.ade.json`, `chartmuseum-diagrams.md`, `chartmuseum-preview/` e log dei test. Prompt, schemi, risposte reali ed errori sono conservati. Il riepilogo distingue chiamate effettive e rivalidazione della risposta registrata; il suo stato nativo HTTPie `ready` va letto insieme al blocco di preflight riportato in questo verbale.
