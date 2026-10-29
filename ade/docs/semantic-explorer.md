# Esplorazione semantica M3

Il primo incremento M3 consente di raggiungere elementi e diagrammi del modello senza aprire il codice o il JSON. M2 resta soggetta al collaudo macOS e VoiceOver già registrato: l'avvio di M3 sul percorso Linux non chiude quelle verifiche.

## Ricerca e destinazioni

**Search System**, disponibile nella sidebar, nella navigazione dell'editor e come **A.D.E: Search System** nella palette, apre due scelte native. La prima filtra tutti i risultati, i soli diagrammi oppure uno dei tipi semantici; la seconda cerca nomi, tipi, antenati e nomi dei diagrammi. La ricerca usa il documento corrente, comprese le modifiche non ancora salvate.

Un elemento già rappresentato viene selezionato nella prospettiva corrente quando questa lo contiene; altrimenti viene aperto il primo diagramma che lo rappresenta. Il nodo riceve il focus ed entra nell'area visibile. **Diagrams Containing This Element** nelle proprietà permette di scegliere un'altra prospettiva mantenendo lo stesso identificatore.

Un elemento non collocato, per esempio il contratto «Pagamento», apre **Element Details**. La scheda mostra tipo, descrizione, proprietà comportamentali, relazioni ed evidenze presenti; le relazioni aprono a loro volta la destinazione semantica. Non viene creato un diagramma fittizio. Una feature mostra i diagrammi di cui è proprietaria e gli elementi contenuti; un elemento con figli consente di raggiungerli direttamente.

Nei documenti scrivibili la scheda usa le stesse operazioni di rinomina, descrizione, cancellazione, undo/redo e salvataggio dell'editor. Le azioni che richiedono un diagramma, come collegare due nodi, rimangono nel contesto del canvas. Contratti estesi, editor di sequenze e stati completi non fanno parte di questo incremento.

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

## Accessibilità e aggiornamenti esterni

**Read Element Details** usa lo stesso lettore nativo di **Read Diagram**. L'aiuto accessibile descrive ricerca, breadcrumb, schede e cronologia. La lettura non presenta la scheda come un diagramma e non deduce esecuzione o verifiche del codice.

Il servizio mantiene un watcher correlato sul file del modello, anche fuori dalla cartella del workspace. Un aggiornamento esterno ricarica soltanto il documento pulito; le modifiche non salvate restano protette dal backend nativo. Se viene eliminato l'elemento ispezionato, il contesto torna a un diagramma valido. Errori di lettura non lasciano il vecchio contenuto presentato come stato corrente. Watcher e richieste superate vengono rilasciati o ignorati quando cambia il documento.

Le verifiche e i confini di piattaforma sono nei verbali [M3.1](m3-1-verification.md) e [M3.2](m3-2-verification.md).
