# Esplorazione semantica M3

Il primo incremento M3 consente di raggiungere elementi e diagrammi del modello senza aprire il codice o il JSON. M2 resta soggetta al collaudo macOS e VoiceOver già registrato: l'avvio di M3 sul percorso Linux non chiude quelle verifiche.

## Ricerca e destinazioni

**Search System**, disponibile nella sidebar, nella navigazione dell'editor e come **A.D.E: Search System** nella palette, apre due scelte native. La prima filtra tutti i risultati, i soli diagrammi oppure uno dei tipi semantici; la seconda cerca nomi, tipi, antenati e nomi dei diagrammi. La ricerca usa il documento corrente, comprese le modifiche non ancora salvate.

Un elemento già rappresentato viene selezionato nella prospettiva corrente quando questa lo contiene; altrimenti viene aperto il primo diagramma che lo rappresenta. Il nodo riceve il focus ed entra nell'area visibile. **Diagrams Containing This Element** nelle proprietà permette di scegliere un'altra prospettiva mantenendo lo stesso identificatore.

Un elemento non collocato, per esempio il contratto «Pagamento», apre **Element Details**. La scheda mostra tipo, descrizione, proprietà comportamentali, relazioni ed evidenze presenti; le relazioni aprono a loro volta la destinazione semantica. Non viene creato un diagramma fittizio. Una feature mostra i diagrammi di cui è proprietaria e gli elementi contenuti; un elemento con figli consente di raggiungerli direttamente.

Nei documenti scrivibili la scheda usa le stesse operazioni di rinomina, descrizione, cancellazione, undo/redo e salvataggio dell'editor. Le azioni che richiedono un diagramma, come collegare due nodi, rimangono nel contesto del canvas. M3.3 aggiunge l'editing dei contratti descritto sotto; editor di sequenze e stati completi restano successivi.

## Percorso e cronologia

Il breadcrumb **Semantic Path** mostra il sistema e il contesto corrente. Nei diagrammi il proprietario è quello della navigazione M2; nelle schede segue l'ascendenza semantica reale. Il nome del sistema apre **System Map**; gli antenati aprono la loro scheda.

**Back** e **Forward**, anche come comandi A.D.E nella palette, ripristinano destinazione e selezione. La cronologia conserva al massimo 100 posizioni durante la sessione, usa identificatori anziché nomi, salta destinazioni eliminate e scarta il ramo successivo quando si avvia una nuova navigazione dopo essere tornati indietro. Spostare un nodo o modificarne le proprietà non aggiunge una posizione di navigazione.

Aprire un altro documento o tornare all'esempio integrato avvia una cronologia nuova, anche se gli identificatori coincidono. Dopo il riavvio viene ripristinata la destinazione corrente, compresa una scheda di dettaglio; la cronologia della sessione precedente non viene conservata. Queste informazioni risiedono nello storage del workspace e non cambiano il formato semantico v2/v3.

## Mappa del sistema M3.2

**System Map**, nella sidebar, nell'editor e nella palette (**A.D.E: Show System Map**), mostra tutte le identità una volta sola, anche senza collocazione visuale. Le schede seguono le radici e i figli della gerarchia semantica; i pulsanti aprono Element Details. I diagrammi di una feature rimangono raggiungibili dalla sua scheda; quelli condivisi o senza proprietario appaiono in System Diagrams.

**Connections Between Groups** raggruppa le relazioni per radice sorgente e destinazione, mantenendo direzione e conteggio. Le relazioni interne allo stesso gruppo sono indicate con **Within**. Espandendo un gruppo si leggono relazioni originali, condizioni ed errori; **Source** e **Target** aprono le rispettive identità. Non vengono dedotte dipendenze dal codice o risultati di esecuzione.

La mappa partecipa alla cronologia e al ripristino della destinazione corrente. Non riscrive il documento e non aggiunge diagrammi o coordinate. Salvare una copia mantiene anche questo contesto. **Read System Map** presenta gerarchia, diagrammi e relazioni nel lettore nativo; l'aiuto accessibile descrive i nuovi controlli.

## Relazioni nei diagrammi M3.2

Le connessioni usano segmenti ortogonali che evitano i rettangoli dei nodi, con un costo aggiuntivo per le svolte. Auto-collegamenti e relazioni parallele hanno porte distinte; le frecce mantengono la direzione. Le etichette vengono misurate con il font effettivo e collocate evitando nodi ed etichette precedenti. Quando vengono allontanate dal segmento, una breve linea guida tratteggiata ne indica il riferimento. Se non c'è spazio vicino alla connessione, appaiono sotto il diagramma con una linea guida. L'area scorrevole e Fit Diagram includono le geometrie aggiunte.

Il router conserva il layout manuale e viene ricalcolato dopo gli spostamenti. Se nodi sovrapposti bloccano tutte le porte, un messaggio segnala le connessioni non disegnabili e invita a separare i nodi. Tutte le relazioni rimangono nelle proprietà e nel lettore. Il router evita i nodi; non garantisce l'assenza di incroci fra connessioni, di incroci con linee guida o la separazione completa di numeri arbitrari di relazioni parallele. I grafi molto grandi richiedono ancora misure e ottimizzazioni dedicate.

## Contratti comportamentali M3.3

**Edit Behavioral Contract**, nelle proprietà del diagramma e di Element Details, oppure come comando **A.D.E: Edit Behavioral Contract**, modifica il comportamento dell'identità selezionata. È disponibile per tutti i tipi semantici ammessi dallo schema, anche senza un contratto preesistente e senza collocazione visuale. La demo integrata e i file in sola lettura rimangono consultabili.

Le scelte native **Inputs**, **Outputs**, **Preconditions**, **Postconditions** ed **Errors** permettono di aggiungere, modificare e rimuovere una voce alla volta. Un campo conserva nome, tipo dichiarato e presenza **Required**/**Optional**; i tipi sono testo libero, senza risoluzione verso un linguaggio. Precondizioni e postcondizioni descrivono aspettative, non espressioni eseguibili. Un errore conserva codice univoco e descrizione. Valori vuoti, campi omonimi nella stessa lista e codici duplicati vengono rifiutati. Escape annulla l'intera voce corrente; una voce completata è un'unica operazione undo/redo. Un documento cambiato durante i dialoghi richiede di ricominciare sullo stato corrente.

**Edit Relationship Error**, accanto a ogni relazione nelle proprietà, assegna un errore dichiarato dall'elemento sorgente, oppure **No Error** per rimuovere l'associazione. Le stesse proprietà permettono di modificare condizioni e cancellare relazioni anche dalla scheda di dettaglio. Un errore ancora referenziato non può essere rinominato o rimosso: prima occorre cambiare o liberare le associazioni. La validazione del dominio applica lo stesso vincolo alle operazioni atomiche.

Scheda, proprietà nei diversi diagrammi e lettore accessibile usano lo stesso contratto semantico. Le proprietà mostrano anche obbligatorietà dei campi e codici degli errori. L'editing conserva layout, autorizzazioni, criteri di accettazione, mappature e verifiche esistenti; autorizzazioni e criteri rimangono consultabili e non sono modificabili da questo editor. Nessun risultato runtime viene dedotto dalla modifica di una dichiarazione.

Il formato resta v3 con apertura dei documenti v2; non servono nuove proprietà nello schema. L'[esempio progettato](../examples/checkout-designed.ade.json) include ora il contratto di Richiedi pagamento e il relativo percorso di errore. Verifiche automatiche e limiti dello smoke sono nel [verbale M3.3](m3-3-verification.md).

## Sequenze coordinate M3.4

**Add Diagram → Sequence Diagram** crea una sequenza nella feature scelta. **Add Existing Element** aggiunge un'identità come partecipante; **Add Existing Message** riusa una relazione `invocation`, `read` o `write` del sistema e include automaticamente i suoi endpoint. I partecipanti non vengono duplicati né spostati nella gerarchia. **Add Element** e **Connect Selection** restano disponibili per progettare nuovi elementi e interazioni, compresa un'invocazione verso lo stesso partecipante. Una nuova relazione appartiene al sistema; le altre viste la mostrano solo se la includono, mentre le proprietà ne conservano l'accesso semantico.

Le intestazioni dei partecipanti seguono l'ordine locale della sequenza; le linee di vita e i messaggi numerati si dispongono automaticamente. Le etichette mostrano direzione, tipo della relazione, condizioni ed errori; le righe vengono misurate prima dello zoom per lasciare spazio al testo. Selezionare un partecipante o un messaggio apre le proprietà dell'identità sorgente e il suo contratto M3.3. Il cambio di prospettiva conserva l'identità e riflette nomi, condizioni e contratti modificati nelle altre viste.

Nelle proprietà **Move Participant Left/Right** cambia l'ordine dei partecipanti. **Sequence Message Options** raccoglie **Move Message Earlier/Later** e **Remove Message from Diagram**; **Remove Participant from Diagram** rimuove dalla sola sequenza il partecipante e le sue occorrenze collegate. Elementi, relazioni e altre viste restano conservati. **Delete Element** e **Delete Relationship** mantengono invece il loro significato di cancellazione dall'intero sistema, con la conferma già prevista. Tutte queste operazioni passano dalla cronologia e dal salvataggio nativi.

Il renderer non usa trascinamento e coordinate manuali: l'ordine viene conservato negli array della vista esistente, senza nuovi campi nel formato v3. Il lettore accessibile presenta partecipanti da sinistra a destra e messaggi numerati nello stesso ordine; pan, Fit Diagram, zoom, focus e ripristino del documento riusano il workbench.

| Costrutto | Sottoinsieme M3.4 |
| --- | --- |
| Partecipanti | Una linea di vita per identità semantica, senza istanze runtime distinte |
| Messaggi | Invocazioni, letture e scritture dichiarate, una occorrenza per relazione; auto-messaggi supportati |
| Condizioni ed errori | Etichette dichiarative condivise; nessuna valutazione delle condizioni |
| Alternative, loop, parallelismo | Non sono frammenti UML `alt`, `loop` o `par`; un'etichetta condizionata non ne simula l'esecuzione |
| Risposte, attivazioni e tempi | Non dedotti né rappresentati da costrutti dedicati |
| Altre relazioni | Dipendenze, realizzazioni, transizioni e relazioni legacy non classificate non sono messaggi; nei documenti storici restano segnalate, nelle proprietà e nel lettore |

L'[esempio progettato](../examples/checkout-designed.ade.json) riusa nella sequenza di pagamento le identità e i due messaggi condizionati del flusso. L'ordine rappresenta una dichiarazione della vista, non una traccia che dimostra entrambi gli esiti. Build, test, smoke Linux e verifiche di piattaforma aperte sono registrati nel [verbale M3.4](m3-4-verification.md).

## Stati e transizioni M3.5

**Add Diagram → State Diagram** sceglie la feature e la risorsa del ciclo di vita. **Create New Resource** consente di creare la risorsa insieme al diagramma in un'unica operazione annullabile; annullare un dialogo non lascia risorse o diagrammi parziali. La nuova vista include un riferimento alla risorsa esistente, senza cambiare gerarchia o formato del documento.

**Add State** crea uno stato della risorsa rappresentata; se un documento storico contiene più risorse viene chiesto quale usare. **Add Existing State** mostra gli stati delle risorse già rappresentate e **Add Existing Transition** riusa una transizione dichiarata, includendo i due endpoint se necessario. **Include Resource Lifecycle**, in Diagram Options e nella palette, include tutti gli stati e le transizioni dichiarati della risorsa scelta, preservando coordinate e riferimenti già presenti. Per estendere una vista storica senza risorse riconoscibili, includere prima la risorsa tramite **Add Existing Element**. Includere un'altra risorsa consente di affiancarne il ciclo di vita, mantenendo separate le transizioni.

**Connect Selection** collega stati della stessa risorsa con una transizione, compresi auto-collegamenti. Nome/evento e condizione sono dichiarazioni testuali. **Edit Transition Event**, **Edit Condition** ed **Edit Relationship Error** nelle proprietà aggiornano la relazione condivisa fra tutte le viste. Gli errori devono essere dichiarati nel contratto dello stato sorgente e usano la validazione M3.3. Sul canvas evento e condizione rimangono entrambi visibili, insieme all'eventuale codice di errore; non vengono sostituiti l'uno dall'altra.

Il riepilogo **Resource Lifecycles** collega le risorse alle loro schede e distingue stati visibili, stati dichiarati e transizioni incluse. **Transition Table** espone sorgente, destinazione, evento, condizione ed errore; i pulsanti degli endpoint selezionano il corrispondente stato nel canvas. **Read Diagram** mantiene gli stessi riferimenti e nomina esplicitamente risorsa e appartenenza di ogni stato.

**Remove State from Diagram** rimuove dalla sola vista lo stato e le relazioni che vi sono collegate. **Remove Relationship from Diagram** conserva la transizione nel sistema e negli altri diagrammi. Queste operazioni sono distinte dalle cancellazioni semantiche **Delete Element/Relationship**, che mantengono conferma e pulizia globale dei riferimenti. Spostamenti, aggiunta/rimozione locale, modifica di eventi e contratti usano undo/redo, salvataggio e ripristino nativi.

Il formato v3 resta invariato: l'appartenenza è `state.parentId → resource`, gli eventi usano `relation.name`, le guardie `condition` e gli errori `errorCode`. I documenti storici possono contenere elementi di contesto, relazioni aggiuntive o stati senza risorsa: vengono segnalati e conservati nel grafo e nel lettore, senza assegnazioni automatiche. Le nuove transizioni delle viste di stato richiedono una risorsa effettiva condivisa dagli endpoint.

Il sottoinsieme M3.5 rappresenta stati semplici, eventi dichiarati, guardie testuali, errori e auto-transizioni. Non deduce stati iniziali/finali, stati compositi, regioni parallele, azioni entry/exit o esecuzione runtime. L'[esempio progettato](../examples/checkout-designed.ade.json) contiene ora anche il ciclo di vita dell'ordine: le azioni del flusso e gli stati della risorsa hanno identità distinte, senza dedurre automaticamente causalità fra loro. Verifiche e limiti di piattaforma sono nel [verbale M3.5](m3-5-verification.md).

## Accessibilità e aggiornamenti esterni

**Read Element Details** usa lo stesso lettore nativo di **Read Diagram**. L'aiuto accessibile descrive ricerca, breadcrumb, schede e cronologia. La lettura non presenta la scheda come un diagramma e non deduce esecuzione o verifiche del codice.

Il servizio mantiene un watcher correlato sul file del modello, anche fuori dalla cartella del workspace. Un aggiornamento esterno ricarica soltanto il documento pulito; le modifiche non salvate restano protette dal backend nativo. Se viene eliminato l'elemento ispezionato, il contesto torna a un diagramma valido. Errori di lettura non lasciano il vecchio contenuto presentato come stato corrente. Watcher e richieste superate vengono rilasciati o ignorati quando cambia il documento.

Le verifiche e i confini di piattaforma sono nei verbali [M3.1](m3-1-verification.md), [M3.2](m3-2-verification.md), [M3.3](m3-3-verification.md), [M3.4](m3-4-verification.md) e [M3.5](m3-5-verification.md).
