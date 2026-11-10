<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0015 — Esplorazione incrementale e modello descrittivo v5

Data: 10 novembre 2026. Evoluzione di [ADR 0004](0004-diagram-driven-schema-v4.md), secondo il [piano di riprogettazione](../diagram-import-redesign-plan.md) e la [valutazione MCP](../mcp-diagram-evaluation.md). Stato: implementazione locale e primi collaudi reali riusciti su ChartMuseum/HTTPie; promozione qualitativa completa sul corpus ancora da completare.

Il flusso desktop di pianificazione e approvazione è aggiornato da [ADR 0016 — Generazione completa con review unica](0016-complete-diagram-generation.md). Questo documento conserva le decisioni originarie del protocollo incrementale.

## Decisione

L'importazione dei diagrammi usa una conversazione persistente con strumenti locali sopra servizi ADE condivisi. Non richiede la classificazione IA di ogni dichiarazione, una sintesi globale o un piano immutabile. L'inventario deterministico resta disponibile prima dell'inferenza. Una proposta contiene al massimo una vista: un'altra vista viene salvata in una proposta indipendente, così una bozza irrealizzabile non blocca quelle valide.

Il servizio `ade/ai/diagramSession.ts` gestisce sessioni, query, evidenze, bozze, budget e pubblicazione. Gli adapter sono il bridge del workbench e `ade/ai/diagram-mcp.mjs`, con SDK MCP ufficiale `@modelcontextprotocol/sdk` **1.32.2**, trasporto `stdio` e un progetto per processo. Gli strumenti nativi sono prima registrati in `ILanguageModelToolsService` e poi esposti attraverso `setSessionTools`; vengono rimossi alla chiusura del servizio o al cambio di progetto. Il fallback CLI riceve la configurazione MCP nei soli argomenti del processo. Il server non gestisce token del modello e non modifica la configurazione globale MCP.

Sono indipendenti la versione **5 del documento**, la versione **2 delle risposte della sessione** e la versione **5 del bridge del worker**. La negoziazione MCP è gestita dall'SDK.

## Modello comune

La v5 conserva le identità e i contratti eseguibili della v4. La migrazione esplicita lavora su una copia, è idempotente e non introduce input, risposte, timeout o altri contratti mancanti. La grammatica v4 pubblicata resta invariata. Il nome TypeScript `SemanticModelV4` è mantenuto come tipo della fondazione comune alle versioni 4 e 5; `SemanticModelV5` restringe il discriminante alla nuova versione.

Le evidenze sono record con ID, percorso relativo, revisione del contenuto, range UTF-16, produttore/versione, natura e riferimenti ai fatti. Le assertion possono citarle senza confondere provenienza, accettazione e verifica. L'applicazione di una proposta non trasforma un'inferenza in un'estrazione statica o in una verifica positiva. L'IA può proporre assertion inferite; non può autoattribuirsi osservazioni runtime o accettazioni dell'utente.

Interazioni, occorrenze e frame rimangono nella fondazione comune. Il profilo `descriptive` aggiunge trigger, scope, partecipanti, evidenze, ordine parziale e condizioni descrittive. Un'occorrenza descrittiva può non conoscere l'operazione eseguibile. Le alternative esclusive non possono essere concatenate da un ordine temporale. La sequenza deriva dallo scenario, non dall'ordine di `relationIds`; le occorrenze ripetute hanno ID distinti. Lo stesso ID può essere trasferito a uno scenario distinto in una transazione di correzione. Le definizioni non più usate rimangono disponibili; questa operazione non è una cancellazione globale.

Una bozza descrittiva può essere visualizzabile e revisionabile. I servizi di generazione continuano a richiedere i contratti eseguibili. Le revisioni di intento, proiezione e layout sono separate. Gli spostamenti manuali non invalidano la lettura semantica di una vista e vengono conservati anche quando avvengono durante la review.

## Transazioni e recupero

I comandi di dominio dichiarano/aggiornano elementi e relazioni, ownership, membership delle funzionalità, assertion, scenari, viste e fusione di responsabilità descrittive. La fusione conserva l’ID di destinazione, ridirige i consumatori, mantiene le annotazioni compatibili e respinge conflitti manuali o contratti eseguibili. Gli alias `@nome` sono temporanei; ADE riserva gli ID canonici una volta e li salva nella proposta. Lo stesso proposal ID con contenuto diverso viene respinto. Una correzione può indicare `supersedes`: riusa le riserve degli alias del draft precedente, conserva il draft storico e lo sostituisce nella coda corrente senza cambiare gli ID degli oggetti. I riferimenti non vengono normalizzati per prefisso e lo schema non enumera tutti i simboli del repository.

La proposta conserva revisione di base, letture, evidenze, query, scritture, diff e diagnostiche. L'applicazione ricontrolla le letture e le preimmagini delle sole scritture, consentendo proposte disgiunte. Evidenze cambiate e query negative superate richiedono un recupero mirato. La review apre il diff completo in un documento locale e l'anteprima nel visualizzatore nativo; il diff paginato degli strumenti non sostituisce la review integrale. La pubblicazione comprende la transazione e i suoi oggetti dipendenti; le altre proposte non vengono applicate implicitamente.

La persistenza usa il namespace registrato `.ade/exploration`, JSON atomico, coda per progetto delle chiamate concorrenti nello stesso processo, lock di progetto, `writeSnapshot` e journal di riconciliazione esistenti. Il modello pubblicato rimane nello snapshot attivo. Una pubblicazione con esito locale incerto viene riconciliata col puntatore e col journal prima di riprendere; la stessa proposta applicata restituisce lo snapshot corrente senza duplicare le identità. Un arresto forzato del processo può richiedere la scadenza del lease del lock condiviso. Non viene promessa esecuzione remota exactly once.

## Evidenze e capacità

Le query restano nello scope importato e nel filtro di disclosure esistente; non seguono symlink. Ricerca, lettura e query del modello sono paginate o limitate. Le letture indicano revisione, encoding, troncamento e continuazione. Documentazione, configurazione, test e runtime sono distinguibili. La ricerca testuale limita anche byte locali scansionati e numero di match, dichiarando il limite.

Il backend espone le capacità effettive. Il grafo SCIP/compilatore fornisce riferimenti risolti, non chiamate o ordine temporale. Quando il sorgente cambia, le evidenze obsolete invalidano gli oggetti e le viste consumatrici. I riferimenti di un indice esterno ancora validi possono essere mantenuti come copertura parziale; quelli dei file cambiati vengono rimossi finché il backend non viene aggiornato. Un indice mancante restituisce `unsupported`, un simbolo non indicizzato `unavailable` e una ricerca completa senza risultati resta un esito distinto.

## UI, budget e limiti

Il percorso incrementale è il default di `ade.diagramImport.incremental`; il valore `false` conserva il percorso legacy per confronti e rollback verso documenti precedenti. Il nuovo percorso non richiede una nuova autenticazione quando l'account Codex è valido. Un modello scelto esplicitamente viene applicato alla chat o alla CLI; l'indisponibilità non provoca un cambio implicito di provider. Un cambio di modello viene registrato come nuova revisione dell'esecuzione, conservando il lavoro precedente.

Il budget locale controlla chiamate agli strumenti, byte restituiti, durata e turni osservabili. Anche le richieste respinte per schema o dominio consumano chiamate e byte e lasciano una ricevuta; la piccola risposta di esaurimento viene contabilizzata anche quando supera il residuo disponibile per i dati. Le diagnostiche selezionano la variante effettiva del comando e identificano proprietà inattese, valori ammessi e forma attesa. Gli esempi completi rendono utilizzabile il contratto anche con client che abbreviano le union annidate. Il trasporto MCP non comunica il numero delle inferenze del provider; la chat nativa espone gli identificatori delle richieste che eseguono strumenti, non tutte le inferenze interne. Questa misura è un limite sui turni osservati, non una certificazione del numero totale di inferenze. I token restano sconosciuti quando non esposti. Le misure CLI dei collaudi reali sono registrate separatamente. Aumentare il budget conserva evidenze, ID e proposte; gli strumenti non possono aumentarlo autonomamente.

Le anteprime strutturali e C4 riusano dimensioni, ownership, routing ortogonale e posizionamento delle etichette del canvas, con separazione conservativa dei gruppi. Le relazioni non instradabili bloccano la proposta, anziché sparire dall’anteprima. Le sequenze e le attività derivano dalle stesse occorrenze e rappresentano condizioni, alternative e ordine parziale. L'attività disegna soltanto i vincoli dichiarati: le colonne dei rami non inventano cronologia, join o decisioni eseguibili. Il canvas consente il drill-down al partecipante semantico, mentre il layout di questa proiezione rimane derivato. Le immagini SVG sono locali, limitate e indirizzate per contenuto. I controlli geometrici impediscono la pubblicazione di elementi estranei dentro un confine C4. ELK e Serena non sono prerequisiti e non vengono dichiarati promossi senza una prova comparativa. Gli stati descrittivi richiedono ancora una proiezione dedicata: il tool restituisce un limite esplicito e propone struttura, sequenza o attività. Il percorso legacy e gli editor delle altre notazioni restano disponibili.

## Verifica

Il [verbale di implementazione](../validation/incremental-diagrams-2026-11-10.md) distingue test locali, protocollo ufficiale, browser e tentativi reali. I gate di fedeltà e costo del piano non vengono sostituiti da test simulati o da screenshot privi di errori JavaScript.
