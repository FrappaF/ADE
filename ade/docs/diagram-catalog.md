# Catalogo dei diagrammi ADE

ADE dispone di **16 tipi di vista**: i 15 della lista di progettazione/architettura e la struttura semantica generica. Prima di questo incremento erano disponibili soltanto struttura, attività, sequenza e stati. L'espansione delle notazioni prevista in M9 viene anticipata su richiesta dell'utente; non chiude le altre attività di M9.

| Vista | Tipo salvato | Contenuto specifico |
| --- | --- | --- |
| C4 System Context | `c4Context` | Persone, sistema e sistemi esterni; comunicazioni e dipendenze |
| C4 Container | `c4Container` | Applicazioni, servizi, archivi, confine del sistema e tecnologie/protocolli dichiarati |
| C4 Component | `c4Component` | Componenti interni a un container, interfacce e dipendenze |
| ERD | `erd` | Entità logiche, attributi, associazioni e cardinalità dichiarate |
| Database Schema | `databaseSchema` | Tabelle/colonne, tipi, nullabilità, PK/FK/unique e riferimenti fra colonne; archivio come confine facoltativo |
| Sequence | `sequence` | Partecipanti e ordine locale di invocazioni, letture e scritture |
| Activity / Flowchart | `activity` | Azioni, decisioni, condizioni e flusso della capacità |
| State Machine | `state` | Stati di una risorsa, eventi/condizioni e transizioni |
| Deployment | `deployment` | Nodi di esecuzione, reti e ambienti dichiarati che ospitano applicazioni, artefatti e archivi |
| Class | `class` | Classi/interfacce, attributi/metodi, ereditarietà, composizione, aggregazione e implementazione |
| Use Case | `useCase` | Attori, capacità, confine del sistema e relazioni include/extend |
| UML Component | `component` | Componenti, interfacce e dipendenze/implementazioni |
| Package | `package` | Moduli/layer semantici e dipendenze fra pacchetti |
| Data Flow | `dataFlow` | Processi, archivi, entità esterne e flussi con nome del dato trasferito |
| Network / Infrastructure | `network` | Confini di rete, nodi, connessioni e protocolli esplicitamente dichiarati |
| Struttura generica | `structure` | Panoramica condivisa delle responsabilità e delle relazioni semantiche |

Le notazioni riusano gli stessi elementi, relazioni e identità quando il ruolo è compatibile. Entità logica, tabella fisica e classe possono essere identità distinte: non sono automaticamente equivalenti. C4 Component e UML Component restano due prospettive differenti. L'esempio [Task Architecture](../examples/architecture.ade.json) contiene tutte le viste ed è un documento progettato a mano per mostrare il catalogo, non un risultato attribuito all'IA.

## Uso nell'editor

**Add Diagram** offre tutti i tipi. I picker di elementi e relazioni propongono quelli compatibili con la vista. La validazione del documento impedisce di inserire, per esempio, un attore in una vista classi o un'invocazione in un ERD. Diagrammi vuoti restano editabili; la generazione IA deve invece produrre le viste significative approvate.

Selezionare una scheda per aprire le proprietà flottanti. **Edit Attributes and Technology** modifica tecnologia, ambiente, attributi/colonne e metodi. Ogni membro ha nome, tipo/firma, ruolo, chiave e obbligatorietà. **Change Boundary or Parent** modifica il contenimento; le relazioni **Hosts** descrivono il posizionamento sui nodi. **Edit Cardinalities and Protocol** modifica molteplicità, colonne ai due estremi e trasporto. Il riferimento a una colonna inesistente viene rifiutato. Le firme differenti consentono metodi sovraccaricati. Questi dati partecipano a salvataggio, undo/redo, riconciliazione e conservazione delle modifiche manuali.

Il canvas resta unico, con zoom/pan e menu flottanti. Le viste strutturali specifiche mostrano le etichette delle relazioni a riposo; C4, deployment, use case e schema mostrano i confini dichiarati. Le classi e le tabelle riservano spazio ai compartimenti; la geometria e il routing usano le stesse dimensioni. **Read Diagram** include membri, cardinalità, protocolli e contenimento.

## Generazione IA e limiti

Il piano valuta i 16 tipi e propone quelli che servono: una piccola applicazione non deve produrre 16 viste. Lo schema fisico richiede evidenze da schema/migrazioni; deployment e rete richiedono configurazioni effettive. L'assenza di infrastruttura non autorizza a inventare cloud, VPC, CDN o ambienti di produzione. Il modello dichiara gli oggetti e i dettagli una sola volta; ogni step successivo seleziona riferimenti compatibili dal grafo condiviso e può completare le relazioni della propria notazione con dichiarazioni IA ancorate alle evidenze. Il focus può contenere contesto di un'altra prospettiva, che non diventa automaticamente un nodo della vista.

La panoramica strutturale completa il grafo dichiarato. Se la proposta inizia direttamente da una vista C4 o dati, gli strumenti aggiungono il passaggio locale di panoramica, mantenendo l'identità e il contenuto della vista proposta. Non trasformano una vista C4 in un diagramma generico. Le selezioni semantiche restano del modello IA; strumenti deterministici controllano identità, compatibilità, estremi, membri, connessione, limiti e pubblicazione atomica.

Gli indizi deterministici su `NOT NULL` e PK coprono un sottoinsieme conservativo di SQL: dichiarazioni complete, senza nomi quotati, stringhe o commenti. L’assenza di un indizio resta sconosciuta. Il controllo rifiuta contraddizioni con i vincoli espliciti riconosciuti, senza eseguire il sorgente.

Questa è una base editabile delle notazioni, non una certificazione UML/C4 completa: sequenze senza frammenti combinati o timing osservato, stati senza regioni parallele, ERD con molteplicità testuali, schema senza import/esecuzione DDL e deployment senza discovery dell'infrastruttura in esecuzione. Non sono inclusi generazione automatica di migrazioni DB, provisioning cloud o diagrammi automaticamente verificati rispetto al runtime.

Lo schema semantico v3 viene esteso con nuovi valori tipizzati e dettagli facoltativi; i vecchi documenti v2/v3 continuano a essere leggibili. Una versione precedente di ADE può rifiutare i nuovi tipi, quindi aggiornare e ricostruire l'app e il motore insieme. Il protocollo del ponte codice è ora **4**.

Le prove, gli errori corretti e i confini del collaudo sono registrati nel [verbale di validazione](validation/diagram-catalog-2026-11-08.json).
