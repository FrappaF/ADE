<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# MCP per l'esplorazione e i diagrammi ADE

Valutazione del 10 novembre 2026, successiva al [piano di riprogettazione](diagram-import-redesign-plan.md). Fonti: codice locale della branch `feat/m6-dai-validation` e documentazione primaria dei progetti indicati. È una valutazione di opportunità e integrazione: nessun nuovo server è stato installato, eseguito o collegato all'account dell'utente per questa attività; nessuna nuova inferenza. Le capacità documentate non sono risultati di un benchmark ADE.

## Decisione

**Conviene implementare un server MCP ADE locale e provare Serena come componente opzionale per la navigazione semantica.** Un unico server ADE espone servizi di evidenza, modello e anteprima. Questi servizi servono anche la chat interna tramite il percorso di strumenti dell'Agent Host già disponibile: stessa logica di dominio, due adapter sottili. Il confronto del prototipo decide quale trasporto usare dentro ADE; MCP offre da subito il contratto interoperabile per Codex CLI e altri client.

Il guadagno atteso è permettere all'IA di recuperare l'evidenza mancante e correggere una proposta circoscritta. MCP non corregge autonomamente l'ordine dei messaggi, non trasforma i riferimenti in chiamate e non prova la correttezza di un diagramma. Collegarlo alla vecchia sequenza obbligatoria di gruppi e sintesi globale conserverebbe il collo di bottiglia.

## Confronto dei candidati

| Candidato | Valore specifico per ADE | Limiti e lavoro richiesto | Decisione |
| --- | --- | --- | --- |
| **MCP ADE**, da implementare | Interroga evidenze e revisioni del progetto, oggetti semantici, diagnostiche e viste; propone cambiamenti e mostra preview dello stesso modello usato dal canvas | Serve sviluppare i servizi mancanti, soprattutto transazioni e preview indipendente dall'editor. Il wrapper MCP è solo una parte del lavoro | **Priorità 1.** Iniziare dalla lettura e riutilizzare indice, lettori e controlli esistenti |
| **[Serena](https://github.com/oraios/serena)** | Recupero per simbolo, outline, riferimenti e implementazioni attraverso language server; può ridurre letture complete e ricerca testuale rumorosa, soprattutto nei progetti Go/Python dei test | Richiede Python e language server, configurazione del progetto e gestione dell'indice. Riferimenti non equivalgono a chiamate né a ordine temporale. Non conosce responsabilità/ID ADE. Integrazione e qualità variano col backend | **Priorità 2: prova comparativa**, come processo esterno opzionale. Non riscriverlo e non renderlo requisito dell'importazione |
| **[ast-grep MCP](https://github.com/ast-grep/ast-grep-mcp)** | Ricerca di strutture sintattiche: registrazioni di route, chiamate di API, condizioni e configurazioni che attraversano linguaggi diversi | Il server ufficiale è dichiarato sperimentale; richiede ast-grep e runtime Python. AST matching non risolve il significato del destinatario di una chiamata. ADE usa già Tree-sitter | **Secondario.** Provare prima ast-grep come backend di query del server ADE, se le query dei parser esistenti non bastano; non avviare subito un altro server |
| **[LikeC4 MCP](https://likec4.dev/tooling/ai-tools/)** | Strumenti di lettura del grafo, navigazione e anteprima; precedente concreto per il design di `model.query` e `view.preview` | Richiede un modello LikeC4. Trasformare ADE in un secondo modello comporta mapping di ID, semantica e perdita di costrutti non equivalenti | **Riferimento progettuale; integrazione opzionale** per export/preview C4 dopo aver stabilizzato il modello ADE |
| **[Structurizr MCP](https://docs.structurizr.com/ai/mcp)** | Parsing, validazione e ispezione del DSL, export Mermaid/PlantUML | Valida il modello Structurizr, non la sua corrispondenza al sorgente. Richiede conversione e runtime Java/server o container | **Opzionale per C4/export**, non motore principale dell'importazione |
| **[Repomix MCP](https://repomix.com/guide/mcp-server)** | Preparazione di un pacchetto del repository, letture parziali e ricerca nel pacchetto; utile quando un client non ha accesso diretto al workspace | Packaging dell'intera codebase non aggiunge risoluzione semantica; leggere tutto il pacchetto riprodurrebbe il problema del contesto. Il server documentato è sperimentale | **Non prioritario nel desktop ADE.** Possibile adapter per client esterni con workspace remoto e lettura selettiva |
| **MCP generici filesystem/Git/GitHub** | Lettura file, diff e storia per client che ne sono privi | Nella chat Codex completa queste capacità sono in gran parte già presenti; non aggiungono ID ADE, evidenze revisionate o regole del modello | **Nessuna nuova implementazione dedicata**. Usare gli strumenti nativi quando disponibili e query ADE per le evidenze da conservare |

La prova di Serena deve usare strumenti di lettura esplicitamente selezionati, senza refactoring o modifiche ai sorgenti durante l'importazione. Le versioni attuali distinguono interfaccia a tool e REPL: scegliere e fissare versione/backend/interfaccia nel test, evitando configurazioni copiate da un'altra versione. Un processo per progetto evita che un cambio di progetto attivo confonda HTTPie e ChartMuseum. Il README attuale dichiara GPL-3.0-or-later: tenere distinta la prova come componente esterno dalla decisione di ridistribuirlo nel prodotto, che richiede una verifica della licenza della versione scelta.

I [risultati pubblicati da Serena](https://oraios.github.io/serena/04-evaluation/000_evaluation-intro.html) sono auto-valutazioni degli agenti su attività di coding, in parte con backend JetBrains. Indicano quali operazioni possono beneficiarne; non dimostrano un miglioramento misurato dei diagrammi ADE né le stesse capacità del backend LSP.

## Cosa implementare nel server ADE

Il server deve essere un adapter ai servizi locali, con SDK MCP ufficiale e versione esplicita. Evitare un nuovo protocollo JSON-RPC scritto a mano o copie dei validatori. Primo trasporto esterno: `stdio`, processo legato al progetto e al lifecycle del client. Un eventuale trasporto HTTP per comunicare con l'app aperta resta successivo alla prova di isolamento e revisione delle sessioni. Codex gestisce il proprio account: il server ADE non richiede token del modello.

| Incremento | Tool proposto | Dati e comportamento |
| --- | --- | --- |
| Lettura iniziale | `ade_project_inspect` | Inventario compatto, revisioni, capacità effettive degli analizzatori, stato e limiti della copertura, viste esistenti |
| Lettura iniziale | `ade_source_search` | Ricerca testuale o simbolica nello scope; risultati paginati, evidence ID e revisioni |
| Lettura iniziale | `ade_source_read` | Corpo di un simbolo o range su revisione esplicita; troncamento e prosecuzione dichiarati |
| Lettura iniziale | `ade_model_query` | Oggetti, relazioni, ownership e viste dal modello ADE; query limitate e paginazione |
| Dopo il backend semantico | `ade_code_references` | Definizioni/riferimenti e dipendenze risolte se disponibili; risposta `unsupported` o disponibilità parziale quando manca l'indice necessario |
| Dopo i servizi di proposta | `ade_model_propose` | Piccola transazione di comandi tipizzati, oggetti/evidenze letti e revisione di base; ritorna proposal ID, diff e diagnostiche |
| Dopo i servizi di proposta | `ade_view_preview` | Proiezione e geometria della proposta, diagnostiche, riferimenti al sorgente; immagine se supportata dal client, senza cambiare il modello pubblicato |

I nomi con prefisso `ade_` sono proposte di nomi sul trasporto; non sono tool attualmente registrati. Le operazioni in lettura possono partire dai modelli e snapshot esistenti senza attendere lo schema v5. Le operazioni di scrittura arrivano dopo il contratto di transazione del piano P1; non devono aggirarlo scrivendo direttamente il JSON del modello. Confrontare la dimensione dello schema di `ade_model_propose` con pochi comandi di dominio distinti: se ricrea un enorme schema universale, dividere il tool per responsabilità.

Ogni risultato espone revisione e capacità del backend. Dati mancanti e query senza risultati vanno distinti; la paginazione non deve sembrare un risultato completo. Le query del codice e quelle del modello architetturale rimangono distinguibili. Il server applica scope del progetto, controlli dei percorsi, limiti delle letture e guard delle revisioni usando i servizi esistenti; le annotazioni MCP `readOnlyHint` non sostituiscono questi controlli.

Il salvataggio di una bozza e l'applicazione seguono la policy già autorizzata della sessione e il servizio di pubblicazione esistente. Non serve chiedere conferma per ogni lettura o preview. Una correzione mirata può riusare gli oggetti accettati senza rieseguire tutta l'analisi.

## Integrazione concreta nel codice attuale

L'ispezione aggiuntiva rende più preciso P0 del piano generale:

1. [Il provider di importazione](../ai/providers.ts) oggi invoca la CLI senza MCP e senza strumenti di ricerca. Installare o configurare un server esterno non basta a renderlo disponibile a quel percorso: occorre sostituire il collegamento a inferenza isolata con la sessione esplorativa.
2. [L'Active Client Service](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.ts) espone `setSessionTools`, `acquireSessionTools` e pulizia per sessione. Gli strumenti devono essere prima registrati nel servizio tool del workbench. Non è un'API che accetta callback arbitrarie: il servizio risolve tool ID registrati.
3. [L'handler della chat](../../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.ts) unisce questi strumenti a quelli del client. [Il provider Codex](../../src/vs/platform/agentHost/node/codex/codexAgent.ts) li pubblica con `_buildDynamicTools` e gestisce `item/tool/call`. È un percorso riusabile per il prototipo interno, pur dipendendo da superfici Codex sperimentali e senza essere ancora collaudato per gli strumenti ADE.
4. Lo stesso provider include oggi gli schemi dei dynamic tool in modo eager, perché non rileva la capacità di tool search del modello. Quindi esporre solo il piccolo insieme necessario, prima del primo turno; aggiungere decine di server può far crescere di nuovo il contesto. Verificare aggiunta/rimozione dopo il primo turno senza assumere che ricrei la conversazione in modo trasparente.
5. [Le personalizzazioni Codex](../../src/vs/platform/agentHost/node/codex/codexClientCustomizations.ts) forniscono `codexMcpServersFromPlugins`, mentre [l'adapter MCP](../../src/vs/platform/agentHost/node/codex/codexMcpServers.ts) traduce configurazioni `stdio` e HTTP. Sono punti di integrazione esistenti da usare e verificare nel test end-to-end.
6. La presenza di `IAgentHostService.addMcpServerConfiguration` non prova supporto per ogni provider: il dispatcher delega a un metodo opzionale e nella classe Codex esaminata non è presente un'implementazione di quel metodo. Evitare di fondare P0 su tale chiamata o di modificare la configurazione globale per aggirare il problema.

La struttura proposta è: **servizi ADE → adapter tool della chat interna / adapter MCP esterno**. La logica di selezione delle evidenze, proposta, validazione e pubblicazione rimane unica. L'adapter interno non è un server MCP; viene confrontato esplicitamente con l'integrazione MCP nella stessa chat per scegliere la soluzione meno costosa da mantenere.

## Prova che decide l'investimento

Prima prova locale di protocollo, senza IA: elenco tool, lettura di un simbolo, paginazione, revisione superata, query senza backend e lifecycle. Poi prova reale limitata con il Codex dell'utente, quando si passa all'implementazione, su domande fissate prima di eseguire i test.

| Domanda / operazione | Risultato verificabile |
| --- | --- |
| ChartMuseum: upload senza limiti | Recupera handler, `PutWithLimit` e il ramo `ChartLimits == nil` fino a `PutObject`; distingue il riferimento dalla prova del ramo |
| ChartMuseum: lettura indice e oggetto | Identifica endpoint e handler distinti; non li dichiara fasi successive della stessa richiesta |
| HTTPie: entrypoint ed esecuzione | Raggiunge il percorso CLI e il componente che invia la richiesta; inventaria separatamente test e strumenti di sviluppo |
| Modello: Redis opzionale | Espone condizione ed evidenza della configurazione; la correzione modifica gli oggetti e le viste dipendenti |
| Nuovo frammento necessario | Il modello usa un'altra lettura nella stessa sessione; non chiede all'utente ciò che può trovare nel repository |
| File cambiato o server riavviato | Evidenza obsoleta rilevata e recuperata; nessun ID architetturale ricreato per il solo riavvio |

Confrontare due fattori distinti: tool nativi della chat vs gli stessi servizi esposti via MCP; backend ADE attuale vs backend arricchito da Serena. Non confrontare soltanto «vecchia pipeline senza strumenti» con «nuova pipeline con Serena»: attribuirebbe a Serena anche il beneficio della nuova orchestrazione. Per ciascuna configurazione registrare correttezza delle risposte, byte/token restituiti e inviati, numero di letture e inferenze, tempo di avvio a freddo/a caldo, errori e complessità di setup. Una tool call locale non è una nuova inferenza.

Promuovere il server ADE quando il ciclo di recupero/correzione funziona e conserva revisioni e identità. Promuovere Serena come opzione supportata solo se aggiunge capacità o riduce costo/letture senza peggiorare la correttezza rispetto alla ricerca e agli indici già disponibili. Rimandare gli altri server finché non risolvono un caso che questi strumenti non coprono.

## Fonti primarie

- Serena: [progetto](https://github.com/oraios/serena), [avvio e trasporti](https://oraios.github.io/serena/02-usage/020_running.html), [configurazione e backend](https://oraios.github.io/serena/02-usage/050_configuration.html), [valutazione e metodo](https://oraios.github.io/serena/04-evaluation/000_evaluation-intro.html), [licenza](https://github.com/oraios/serena/blob/main/LICENSE).
- ast-grep: [uso con agenti](https://ast-grep.github.io/advanced/prompting), [server MCP ufficiale sperimentale](https://github.com/ast-grep/ast-grep-mcp).
- [LikeC4 MCP e strumenti](https://likec4.dev/tooling/ai-tools/), [Structurizr MCP](https://docs.structurizr.com/ai/mcp), [Repomix MCP](https://repomix.com/guide/mcp-server).
